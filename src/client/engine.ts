/**
 * 客户端增强引擎 —— 把「若干增强模块」接进宿主渲染出的 Markdown DOM。
 *
 * 官方没有 Markdown 围栏渲染钩子，因此路线是**在其产物上做 DOM 增强**。
 * 引擎负责所有模块共用的横切关注点，模块只关心"这个块我能处理吗、怎么处理"：
 *  - **串行队列**：逐块处理，块之间让出主线程（大文档不卡顿）；
 *  - **幂等**：节点被标记后永不再处理（重复扫描、重复挂载、流式重渲染都安全）；
 *  - **降级可见**：任何失败都保留原始内容并给出可读提示（永不留空白块）。
 */
import { ATTR_STATE, type BlockState } from '../shared.js';

/** 增强上下文：模块通过它读取/写入节点状态，并使用统一的降级表现。 */
export interface EnhanceContext {
  stateOf(el: Element): BlockState | null;
  mark(el: Element, state: BlockState): void;
  /** 结构化降级：保留原始内容 + 附可读提示 + 重试（重试后节点会被重新接管）。 */
  degrade(block: Element, reason: string, options?: { retry?: () => void }): void;
}

/** 一个增强模块。 */
export interface EnhanceModule {
  readonly id: string;
  /** 是否接管该候选块。 */
  test(block: HTMLPreElement, ctx: EnhanceContext): boolean;
  /** 执行增强；失败时**必须自行降级**（返回 false 表示已降级）。 */
  enhance(block: HTMLPreElement, ctx: EnhanceContext): void | Promise<void>;
  dispose?(): void;
}

/** 引擎对外句柄。 */
export interface Engine {
  /** 扫描（默认整篇文档）并处理尚未标记的候选块。 */
  scan(root?: ParentNode): void;
  /** 停止观察并释放资源（幂等）。 */
  stop(): void;
  readonly modules: readonly EnhanceModule[];
}

/** 扫描节流：流式输出会把 DOM 打得非常碎，攒批处理。 */
const SCAN_DEBOUNCE_MS = 150;

function codeOf(block: Element): HTMLElement | null {
  const code = block.querySelector('code');
  return code instanceof HTMLElement ? code : null;
}

class EngineImpl implements EnhanceContext, Engine {
  readonly modules: readonly EnhanceModule[];
  private readonly seen = new WeakSet<Element>();
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private readonly notes = new WeakMap<Element, HTMLElement>();

  constructor(modules: readonly EnhanceModule[]) {
    this.modules = modules;
  }

  start(): void {
    if (this.observer !== null || this.stopped) return;
    this.scanDocument();
    if (typeof MutationObserver !== 'undefined') {
      const root = document.body ?? document.documentElement;
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(root, { childList: true, subtree: true });
    }
  }

  stop(): void {
    this.stopped = true;
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const module of this.modules) module.dispose?.();
  }

  scan(root: ParentNode = document): void {
    const blocks = root.querySelectorAll('pre');
    for (const block of blocks) {
      if (!(block instanceof HTMLElement)) continue;
      if (block.hasAttribute(ATTR_STATE) || this.seen.has(block)) continue;
      const code = codeOf(block);
      if (code === null || (code.textContent ?? '').trim() === '') continue;
      const claimed = this.modules
        .filter((module) => module.test(block as HTMLPreElement, this))
        .slice(0, 1);
      for (const module of claimed) {
        this.mark(block, 'claimed');
        this.enqueue(() => module.enhance(block as HTMLPreElement, this));
      }
    }
  }

  stateOf(el: Element): BlockState | null {
    const value = el.getAttribute(ATTR_STATE);
    return value === 'claimed' || value === 'rendered' || value === 'degraded' ? value : null;
  }

  mark(el: Element, state: BlockState): void {
    el.setAttribute(ATTR_STATE, state);
    this.seen.add(el);
  }

  degrade(block: Element, reason: string, options: { retry?: () => void } = {}): void {
    this.mark(block, 'degraded');
    const existing = this.notes.get(block);
    if (existing !== undefined) existing.remove();
    const note = document.createElement('div');
    note.className = 'mdp-note';
    note.setAttribute('role', 'note');
    const label = document.createElement('span');
    label.className = 'mdp-note-label';
    label.textContent = `图表渲染失败：${reason}`;
    note.append(label);
    // 降级永远可重试：清掉状态标记后重新接管（模块可通过回调做额外清理，例如丢弃缓存的引擎）。
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'mdp-retry';
    retry.textContent = '重试';
    retry.addEventListener('click', () => {
      note.remove();
      block.removeAttribute(ATTR_STATE);
      this.seen.delete(block);
      options.retry?.();
      this.schedule();
    });
    note.append(retry);
    block.after(note);
    this.notes.set(block, note);
  }

  /** 让出主线程后继续（保持 UI 响应）。 */
  async idle(): Promise<void> {
    await new Promise<void>((resolve) => {
      const anyGlobal = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => unknown };
      if (typeof anyGlobal.requestAnimationFrame === 'function') anyGlobal.requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  }

  private enqueue(task: () => void | Promise<void>): void {
    this.queue = this.queue
      .then(() => task())
      .then(() => this.idle())
      .catch(() => {
        // 模块内部的失败已由其自行降级；引擎保证队列不被单块失败打断。
      });
  }

  private scanDocument(): void {
    const run = (): void => {
      this.timer = null;
      this.scan(document);
    };
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  }

  private schedule(): void {
    if (this.stopped || this.timer !== null) return;
    this.timer = setTimeout(() => this.scanDocument(), SCAN_DEBOUNCE_MS);
  }
}

/** 创建并启动引擎（**幂等**：重复调用返回同一实例）。 */
let singleton: EngineImpl | null = null;
export function startEngine(modules: readonly EnhanceModule[]): Engine {
  if (singleton !== null) return singleton;
  singleton = new EngineImpl(modules);
  singleton.start();
  return singleton;
}

/** 测试/热重载用：销毁单例。 */
export function resetEngine(): void {
  singleton?.stop();
  singleton = null;
}
