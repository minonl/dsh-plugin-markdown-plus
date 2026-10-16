/**
 * Mermaid 增强模块 —— 把 ```mermaid 围栏渲染成图。
 *
 * 设计要点（每条都对应一次真实故障）：
 *  - **懒加载**：引擎运行时只在首次遇到 Mermaid 块时拉取（宿主供出的自包含资产）；
 *  - **降级可见**：语法错误 / 引擎加载失败 / 超大源码 → 保留源码 + 可读提示（永不留空白）；
 *  - **幂等**：`data-mdp-state` 标记 + 源码比对，重复扫描与流式重渲染都不会二次渲染；
 *  - **防串号**：异步渲染完成后校验节点仍在文档中且源码未变，否则丢弃结果。
 */
import { ATTR_STATE, BUILD_ID, RUNTIME_MERMAID_PATH } from '../../shared.js';
import type { EnhanceContext, EnhanceModule } from '../engine.js';
import { loadRuntime } from '../runtime.js';

/** 语言类名（大小写不敏感）。 */
const LANGUAGE_RE = /^language-(?:mermaid|mermaidjs|mmd)$/i;
/** 无语言类时的兜底嗅探：源码首词命中图表类型才接管。 */
const DIAGRAM_TYPE_RE = /^\s*([A-Za-z][\w-]*)/;
const DIAGRAM_TYPES = new Set([
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2',
  'erDiagram', 'gantt', 'pie', 'journey', 'timeline', 'mindmap', 'gitGraph', 'quadrantChart',
  'requirementDiagram', 'c4Context', 'c4Container', 'c4Component', 'c4Dynamic', 'c4Deployment',
  'block', 'packet', 'architecture-beta', 'sankey-beta', 'xychart-beta', 'zenuml',
]);

/** 拒绝渲染的源码体量上限（超过则降级，避免主线程卡死）。 */
export const MAX_SOURCE_CHARS = 50_000;
export const MAX_SOURCE_LINES = 2_000;

interface MermaidRuntime {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

let uid = 0;
let runtimeUrl = `${RUNTIME_MERMAID_PATH}?rev=${encodeURIComponent(BUILD_ID)}`;
let initializedFor: MermaidRuntime | null = null;

/** 测试用：覆盖运行时 URL。 */
export function setRuntimeUrlForTesting(url: string | null): void {
  runtimeUrl = url ?? `${RUNTIME_MERMAID_PATH}?rev=${encodeURIComponent(BUILD_ID)}`;
  initializedFor = null;
}

function codeOf(block: Element): HTMLElement | null {
  const code = block.querySelector('code');
  return code instanceof HTMLElement ? code : null;
}

function firstWord(source: string): string {
  const match = DIAGRAM_TYPE_RE.exec(source);
  return match?.[1] ?? '';
}

/** 语言类判定 + 无语言类兜底嗅探。 */
export function looksLikeMermaid(code: Element): boolean {
  const classes = Array.from(code.classList);
  if (classes.some((name) => LANGUAGE_RE.test(name))) return true;
  // 官方默认高亮会退化成无语言类的纯 `<code>`：此时只能靠源码首词嗅探。
  if (classes.some((name) => /^language-/i.test(name))) return false;
  return DIAGRAM_TYPES.has(firstWord(code.textContent ?? ''));
}

function isDark(): boolean {
  const root = document.documentElement;
  const attr = root.getAttribute('data-theme') ?? root.getAttribute('data-color-scheme') ?? '';
  if (/dark/i.test(attr)) return true;
  if (/light/i.test(attr)) return false;
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const firstLine = text.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? '未知错误';
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine;
}

/** 从任意模块形态取出运行时对象。 */
function runtimeOf(module: unknown): MermaidRuntime | null {
  const candidate = (module as { default?: unknown } | null)?.default ?? module;
  const runtime = candidate as Partial<MermaidRuntime> | null;
  if (runtime === null || typeof runtime !== 'object') return null;
  if (typeof runtime.initialize !== 'function' || typeof runtime.render !== 'function') return null;
  return runtime as MermaidRuntime;
}

function ensureInitialized(runtime: MermaidRuntime): void {
  if (initializedFor === runtime) return;
  runtime.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // 抑制 Mermaid 自带的错误 SVG：失败必须走我们自己的降级表现（不留临时错误图形）。
    suppressErrorRendering: true,
    theme: isDark() ? 'dark' : 'default',
  });
  initializedFor = runtime;
}

/** 渲染结果容器 + 源码显隐开关（保留源码可达，便于用户对照）。 */
function present(block: HTMLElement, svg: string): void {
  const figure = document.createElement('div');
  figure.className = 'mdp-figure';
  figure.setAttribute('role', 'img');
  figure.setAttribute('aria-label', 'Mermaid 图表');
  figure.innerHTML = svg;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mdp-toggle';
  toggle.textContent = '源码';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const hidden = block.style.display === 'none';
    block.style.display = hidden ? '' : 'none';
    toggle.setAttribute('aria-pressed', hidden ? 'false' : 'true');
  });
  block.before(figure);
  block.before(toggle);
  block.style.display = 'none';
}

export const mermaidModule: EnhanceModule = {
  id: 'mermaid',

  test(block): boolean {
    const code = codeOf(block);
    return code !== null && looksLikeMermaid(code);
  },

  async enhance(block: HTMLPreElement, ctx: EnhanceContext): Promise<void> {
    const code = codeOf(block);
    if (code === null) return;
    if (ctx.stateOf(block) === 'rendered') return;

    const source = code.textContent ?? '';
    const lines = source === '' ? 0 : source.split('\n').length;
    if (source.length > MAX_SOURCE_CHARS || lines > MAX_SOURCE_LINES) {
      // 确定性失败：给重试按钮没有意义，直接说明原因（源码保持可读）。
      ctx.degrade(block, `源码过大（${source.length} 字符 / ${lines} 行，上限 ${MAX_SOURCE_CHARS} / ${MAX_SOURCE_LINES}）`);
      return;
    }

    let runtime: MermaidRuntime;
    try {
      const resolved = runtimeOf(await loadRuntime(runtimeUrl));
      if (resolved === null) throw new Error('运行时模块形态不符（缺少 initialize/render）');
      runtime = resolved;
      ensureInitialized(runtime);
    } catch (error) {
      ctx.degrade(block, `图表引擎加载失败（${messageOf(error)}）`);
      return;
    }

    const id = `mdp-mermaid-${(uid += 1)}`;
    let svg: string;
    try {
      const result = await runtime.render(id, source);
      svg = result.svg;
    } catch (error) {
      ctx.degrade(block, messageOf(error));
      return;
    }

    // 防串号：渲染期间节点被移除或源码被改写（流式输出）→ 丢弃本次结果。
    if (!block.isConnected || (code.textContent ?? '') !== source) return;
    if (ctx.stateOf(block) === 'degraded') block.removeAttribute(ATTR_STATE);

    present(block, svg);
    ctx.mark(block, 'rendered');
  },
};
