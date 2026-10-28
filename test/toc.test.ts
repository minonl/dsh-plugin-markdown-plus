import { beforeEach, describe, expect, test } from 'bun:test';

import { startDocModules, type DocModule } from '../src/client/docs.js';
import { tocModule } from '../src/client/modules/toc.js';

const RAIL = 'nav[data-mdp-toc]';
const ITEM = '[data-mdp-toc-item]';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function refresh(): void {
  tocModule.refresh(document);
}

/** 让所有标题的 getBoundingClientRect 返回可控位置（happy-dom 无布局）。 */
function stubRects(tops: number[]): void {
  document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6').forEach((el, i) => {
    el.getBoundingClientRect = () => ({ top: tops[i] ?? 9999, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  });
}

beforeEach(() => {
  tocModule.dispose?.();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('大纲模块', () => {
  test('按标题生成条目，并按层级缩进', () => {
    setBody('<main><h1>一</h1><h2>一点一</h2><h3>一点一点一</h3><h2>一点二</h2></main>');
    refresh();

    const items = [...document.querySelectorAll<HTMLElement>(ITEM)];
    expect(items.length).toBe(4);
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['跳转到：一', '跳转到：一点一', '跳转到：一点一点一', '跳转到：一点二']);
    // 层级以刻度宽度表达：一级最宽，越深越窄
    const widths = items.map((i) => parseInt(i.style.width, 10));
    expect(widths[0]).toBe(18);
    expect(widths[1]).toBe(15);
    expect(widths[2]).toBe(12);
    expect(widths[3]).toBe(15);
  });

  test('标题不足 2 个时不显示面板', () => {
    setBody('<main><h1>只有一个标题</h1><p>正文</p></main>');
    refresh();
    expect(document.querySelector(RAIL)).toBeNull();
  });

  test('忽略代码块与面板自身里的标题', () => {
    setBody('<main><pre><code># 不是标题</code></pre><h1>真标题</h1><h2>另一个</h2></main>');
    refresh();
    const items = [...document.querySelectorAll(ITEM)].map((i) => i.getAttribute('aria-label'));
    expect(items).toEqual(['跳转到：真标题', '跳转到：另一个']);
  });

  test('幂等：重复 refresh 只有一个面板、条目数稳定', () => {
    setBody('<main><h1>一</h1><h2>二</h2></main>');
    refresh();
    refresh();
    refresh();
    expect(document.querySelectorAll(RAIL).length).toBe(1);
    expect(document.querySelectorAll(ITEM).length).toBe(2);
  });

  test('点击条目会滚动到对应标题', () => {
    setBody('<main><h1>一</h1><h2>二</h2></main>');
    let scrolled = 0;
    document.querySelectorAll('h1,h2').forEach((el) => {
      el.scrollIntoView = () => { scrolled += 1; };
    });
    refresh();
    (document.querySelectorAll<HTMLButtonElement>(ITEM)[1] as HTMLButtonElement).click();
    expect(scrolled).toBe(1);
    expect(document.querySelectorAll(ITEM)[1]?.getAttribute('aria-current')).toBe('true');
  });

  test('滚动时高亮当前位置（scroll spy）', () => {
    setBody('<main><h1>一</h1><h2>二</h2><h3>三</h3></main>');
    stubRects([-500, -100, 400]); // 前两个已越过视口上沿
    refresh();
    globalThis.dispatchEvent(new Event('scroll'));
    // rAF / setTimeout 兜底，等一拍
    const items = document.querySelectorAll(ITEM);
    return new Promise<void>((resolve) => setTimeout(() => {
      expect(items[1]?.getAttribute('aria-current')).toBe('true');
      resolve();
    }, 40));
  });

  test('悬浮刻度显示标题预览', () => {
    setBody('<main><h1>一</h1><h2>二</h2></main>');
    refresh();
    const mark = document.querySelectorAll<HTMLButtonElement>(ITEM)[1] as HTMLButtonElement;
    mark.dispatchEvent(new Event('mouseenter'));
    const preview = document.querySelector('.mdp-toc-preview');
    expect(preview?.textContent).toBe('二');
    expect(preview?.classList.contains('mdp-toc-preview-visible')).toBe(true);
    mark.dispatchEvent(new Event('mouseleave'));
    expect(preview?.classList.contains('mdp-toc-preview-visible')).toBe(false);
  });

  test('文档级引擎：DOM 变化后自动重建大纲', async () => {
    setBody('<main><h1>一</h1><h2>二</h2></main>');
    const engine = startDocModules([tocModule]);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll(ITEM).length).toBe(2);

    document.querySelector('main')!.innerHTML = '<h1>一</h1><h2>二</h2><h3>三</h3>';
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelectorAll(ITEM).length).toBe(3);
    engine.stop();
  });

  test('不自触发刷新：宿主写入后不会每 250ms 空转', async () => {
    setBody('<main><h1>一</h1><h2>二</h2></main>');
    let calls = 0;
    const counting: DocModule = {
      id: 'toc-count',
      refresh: (doc) => {
        calls += 1;
        tocModule.refresh(doc);
      },
    };
    const engine = startDocModules([counting]);
    await new Promise((r) => setTimeout(r, 20));
    const afterBoot = calls;

    // 模拟宿主流式渲染的一次写入；若模块自己的 DOM 写入再触发刷新，这里会持续增长
    document.querySelector('main')!.append(document.createElement('p'));
    await new Promise((r) => setTimeout(r, 900));
    engine.stop();

    expect(calls - afterBoot).toBe(1);
  });
});
