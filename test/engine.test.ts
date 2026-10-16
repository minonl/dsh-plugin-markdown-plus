import { beforeEach, describe, expect, test } from 'bun:test';

import { resetEngine, startEngine, type EnhanceModule } from '../src/client/engine.js';
import { ATTR_STATE } from '../src/shared.js';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  resetEngine();
  document.body.innerHTML = '';
});

describe('增强引擎', () => {
  test('接管候选块并标记状态；新出现的块也被接管', async () => {
    const seen: string[] = [];
    const passThrough: EnhanceModule = {
      id: 'passthrough',
      test: () => true,
      enhance(block, ctx) {
        seen.push(block.textContent ?? '');
        ctx.mark(block, 'rendered');
      },
    };
    startEngine([passThrough]);

    document.body.insertAdjacentHTML('beforeend', '<pre><code>a</code></pre>');
    await wait(300);
    expect(seen).toEqual(['a']);
    expect(document.querySelector('pre')?.getAttribute(ATTR_STATE)).toBe('rendered');

    document.body.insertAdjacentHTML('beforeend', '<pre><code>b</code></pre>');
    await wait(300);
    expect(seen).toEqual(['a', 'b']);
  });

  test('引擎启动幂等：重复调用返回同一实例，不重复接管', async () => {
    let calls = 0;
    const counter: EnhanceModule = {
      id: 'counter',
      test: () => true,
      enhance(_block, ctx) {
        calls += 1;
        ctx.mark(_block, 'rendered');
      },
    };
    const first = startEngine([counter]);
    const second = startEngine([{ id: 'other', test: () => true, enhance: () => {} }]);
    document.body.insertAdjacentHTML('beforeend', '<pre><code>x</code></pre>');
    await wait(300);
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  test('降级：保留原始内容、给出可读提示、重试后重新接管', async () => {
    let attempts = 0;
    const flaky: EnhanceModule = {
      id: 'flaky',
      test: () => true,
      enhance(block, ctx) {
        attempts += 1;
        if (attempts === 1) ctx.degrade(block, '模拟失败');
        else ctx.mark(block, 'rendered');
      },
    };
    startEngine([flaky]);
    document.body.insertAdjacentHTML('beforeend', '<pre><code>payload</code></pre>');
    await wait(300);

    const note = document.querySelector('.mdp-note');
    expect(note?.textContent).toContain('模拟失败');
    expect(document.querySelector('pre code')?.textContent).toBe('payload'); // 源码保持可读（非空白块）
    expect(document.querySelector('pre')?.getAttribute(ATTR_STATE)).toBe('degraded');

    (document.querySelector('.mdp-retry') as HTMLButtonElement).click();
    await wait(300);
    expect(attempts).toBe(2);
    expect(document.querySelector('pre')?.getAttribute(ATTR_STATE)).toBe('rendered');
  });
});
