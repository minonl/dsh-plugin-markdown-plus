/**
 * 文档级增强 —— 面向"整页结构"的增强点（如大纲），与块级引擎（`pre>code`）分工。
 *
 * 为什么单独一层：块级引擎的输入是"一个代码块"，而大纲的输入是"整篇文档的标题结构"，
 * 两者的触发条件、幂等键、生命周期都不同；混在一起会让块级队列被整页扫描拖慢。
 *
 * 与块级引擎共享的原则：
 *  - **幂等**：重复 refresh 不产生重复 DOM；
 *  - **降级**：模块抛错只记录并移除自身产物，绝不破坏宿主内容；
 *  - **防抖**：流式输出会高频改 DOM，统一攒批。
 */
export interface DocModule {
  readonly id: string;
  /** 重新计算并更新（必须幂等）。 */
  refresh(doc: Document): void;
  /** 卸载（移除产物与监听）。 */
  dispose?(): void;
}

export interface DocEngine {
  /** 立即重算一次（幂等）。 */
  refresh(): void;
  /** 停止观察并卸载所有模块。 */
  stop(): void;
}

const REFRESH_DEBOUNCE_MS = 250;

export function startDocModules(modules: readonly DocModule[]): DocEngine {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let observer: MutationObserver | null = null;
  let stopped = false;

  const run = (): void => {
    if (stopped) return;
    for (const module of modules) {
      try {
        module.refresh(document);
      } catch (error) {
        // 单个模块失败不影响其它模块，也不破坏宿主 DOM。
        console.warn(`[markdown-plus] doc module "${module.id}" failed:`, error);
      }
    }
  };

  const schedule = (): void => {
    if (stopped || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, REFRESH_DEBOUNCE_MS);
  };

  const start = (): void => {
    run();
    if (typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(schedule);
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  return {
    refresh: run,
    stop(): void {
      stopped = true;
      observer?.disconnect();
      observer = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      for (const module of modules) {
        try {
          module.dispose?.();
        } catch {
          /* 卸载失败不影响其它模块 */
        }
      }
    },
  };
}
