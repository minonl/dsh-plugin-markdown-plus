import { beforeEach, describe, expect, test } from 'bun:test';

import { resetEngine, startEngine } from '../src/client/engine.js';
import { looksLikeMermaid, mermaidModule, MAX_SOURCE_CHARS, setRuntimeUrlForTesting } from '../src/client/modules/mermaid.js';
import { setRuntimeLoaderForTesting } from '../src/client/runtime.js';
import { ATTR_STATE } from '../src/shared.js';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface FakeRuntime {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

function block(source: string, className = 'language-mermaid'): string {
  return `<pre><code class="${className}">${source}</code></pre>`;
}

function fakeRuntime(overrides: Partial<FakeRuntime> = {}): FakeRuntime {
  return {
    initialize: () => {},
    render: async (_id, source) => ({ svg: `<svg data-source="${source}"></svg>` }),
    ...overrides,
  };
}

function installRuntime(runtime: FakeRuntime, onLoad?: () => void): void {
  setRuntimeLoaderForTesting(async () => {
    onLoad?.();
    return { default: runtime };
  });
}

beforeEach(() => {
  resetEngine();
  setRuntimeLoaderForTesting(null);
  setRuntimeUrlForTesting(null);
  document.body.innerHTML = '';
});

describe('语言/源码识别', () => {
  test('识别语言类（含大小写）与无语言类的首词兜底', () => {
    const el = (html: string): HTMLElement => {
      document.body.innerHTML = html;
      return document.querySelector('code') as HTMLElement;
    };
    expect(looksLikeMermaid(el('<pre><code class="language-mermaid">graph TD</code></pre>'))).toBe(true);
    expect(looksLikeMermaid(el('<pre><code class="language-MMD">graph TD</code></pre>'))).toBe(true);
    expect(looksLikeMermaid(el('<pre><code>sequenceDiagram\nA->>B: hi</code></pre>'))).toBe(true);
    expect(looksLikeMermaid(el('<pre><code class="language-ts">const a = 1</code></pre>'))).toBe(false);
    expect(looksLikeMermaid(el('<pre><code>just prose</code></pre>'))).toBe(false);
  });
});

describe('Mermaid 模块', () => {
  test('渲染成功：注入 SVG、隐藏源码、标记 rendered，且运行时只加载一次', async () => {
    let loads = 0;
    installRuntime(fakeRuntime(), () => (loads += 1));
    startEngine([mermaidModule]);

    document.body.insertAdjacentHTML('beforeend', block('graph TD\nA-->B'));
    document.body.insertAdjacentHTML('beforeend', block('graph TD\nC-->D'));
    await wait(600);

    expect(document.querySelectorAll('.mdp-figure').length).toBe(2);
    expect(document.querySelector('.mdp-figure svg')?.getAttribute('data-source')).toContain('A-->B');
    expect((document.querySelector('pre') as HTMLElement).style.display).toBe('none');
    expect(document.querySelector('pre')?.getAttribute(ATTR_STATE)).toBe('rendered');
    expect(loads).toBe(1); // 懒加载 + 记忆化
  });

  test('渲染失败：降级可见（源码保留 + 有错误提示），不产生空白块', async () => {
    installRuntime(fakeRuntime({ render: async () => { throw new Error('Parse error on line 2'); } }));
    startEngine([mermaidModule]);
    document.body.insertAdjacentHTML('beforeend', block('graph TD\nA-->>'));
    await wait(400);

    expect(document.querySelector('.mdp-figure')).toBeNull();
    expect(document.querySelector('pre code')?.textContent).toContain('graph TD');
    expect((document.querySelector('pre') as HTMLElement).style.display).not.toBe('none');
    expect(document.querySelector('.mdp-note')?.textContent).toContain('Parse error on line 2');
    expect(document.querySelector('pre')?.getAttribute(ATTR_STATE)).toBe('degraded');
  });

  test('引擎加载失败：降级可见且可重试（不记忆失败）', async () => {
    setRuntimeLoaderForTesting(async () => { throw new Error('404'); });
    startEngine([mermaidModule]);
    document.body.insertAdjacentHTML('beforeend', block('graph TD\nA-->B'));
    await wait(400);
    expect(document.querySelector('.mdp-note')?.textContent).toContain('图表引擎加载失败');
    expect(document.querySelector('.mdp-retry')).not.toBeNull();
  });

  test('超大源码：直接降级且不加载引擎', async () => {
    let loads = 0;
    installRuntime(fakeRuntime(), () => (loads += 1));
    startEngine([mermaidModule]);
    const huge = `graph TD\n${'A-->B\n'.repeat(Math.ceil(MAX_SOURCE_CHARS / 6))}`;
    document.body.insertAdjacentHTML('beforeend', block(huge));
    await wait(400);
    expect(document.querySelector('.mdp-note')?.textContent).toContain('源码过大');
    expect(loads).toBe(0);
  });

  test('幂等：同一块重复增强只产生一个图；流式改写时不覆盖新内容', async () => {
    installRuntime(fakeRuntime());
    startEngine([mermaidModule]);
    document.body.insertAdjacentHTML('beforeend', block('graph TD\nA-->B'));
    await wait(400);
    const pre = document.querySelector('pre') as HTMLPreElement;
    await mermaidModule.enhance(pre, {
      stateOf: () => pre.getAttribute(ATTR_STATE) as never,
      mark: (el, state) => el.setAttribute(ATTR_STATE, state),
      degrade: () => {},
    });
    expect(document.querySelectorAll('.mdp-figure').length).toBe(1);

    // 渲染期间源码被改写 → 丢弃结果
    const code = pre.querySelector('code') as HTMLElement;
    let release: () => void = () => {};
    installRuntime(fakeRuntime({ render: async () => { await new Promise<void>((r) => { release = r; }); return { svg: '<svg data-stale="1"></svg>' }; } }));
    document.body.innerHTML = block('graph TD\nX-->Y');
    const fresh = document.querySelector('pre') as HTMLPreElement;
    const pending = mermaidModule.enhance(fresh, {
      stateOf: () => null,
      mark: (el, state) => el.setAttribute(ATTR_STATE, state),
      degrade: () => {},
    });
    await wait(60); // 让运行时装载与 render 真正开始
    (fresh.querySelector('code') as HTMLElement).textContent = 'graph TD\nZ-->W';
    release();
    await pending;
    expect(document.querySelector('svg[data-stale]')).toBeNull();
    expect(code).not.toBeNull();
  });
});
