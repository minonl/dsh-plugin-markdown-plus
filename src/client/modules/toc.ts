/**
 * 大纲（TOC）模块 —— 在页面右侧提供可折叠的文档大纲。
 *
 * 设计取舍：
 *  - **整页作用域**而非"每篇文档一个面板"：宿主把 Markdown 渲染在会话消息/文档预览等多个位置，
 *    按容器挂面板会碎片化；整页大纲与市场同类实现（右侧大纲条）行为一致。
 *  - **不改宿主 DOM 属性**：不给标题补 id、不改 hash，避免与宿主的锚点/路由机制冲突；
 *    定位直接用 `scrollIntoView`。
 *  - **幂等**：同一文档只存在一个面板；内容变化时复用面板、替换列表项，保留折叠状态。
 *  - **降级**：标题不足 2 个、或计算失败 → 移除面板，不留空壳。
 */
import type { DocModule } from '../docs.js';

const PANEL_ATTR = 'data-mdp-toc';
const ITEM_ATTR = 'data-mdp-toc-item';
const ACTIVE_ATTR = 'aria-current';
const MIN_HEADINGS = 2;
const SCROLL_OFFSET_PX = 80;
const STORAGE_KEY = 'mdp:toc:collapsed';

interface TocEntry {
  readonly el: HTMLElement;
  readonly level: number;
  readonly text: string;
}

interface TocState {
  panel: HTMLElement | null;
  list: HTMLElement | null;
  entries: TocEntry[];
  activeIndex: number;
  collapsed: boolean;
  onScroll: (() => void) | null;
  scrollTarget: (HTMLElement | Window) | null;
  rafPending: boolean;
  /** 标题结构签名：用于「结构没变就不重写 DOM」，避免自己的写入再触发刷新。 */
  signature: string | null;
  /** 当前面板所属的预览容器：容器一变就必须重建（多 tab / 宿主重渲染）。 */
  scope: HTMLElement | null;
}

const state: TocState = {
  panel: null,
  list: null,
  entries: [],
  activeIndex: -1,
  collapsed: readCollapsed(),
  onScroll: null,
  scrollTarget: null,
  rafPending: false,
  signature: null,
  scope: null,
};

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    /* 隐私模式下不可写：忽略 */
  }
}

/**
 * 作用域：**只看 Markdown 预览容器**（DSH 右侧文档面板 `[data-sidebar-right-tab]`）。
 * 绝不扫描整页 —— 否则会话列表/聊天区也会被当成一篇文档，出现"到处是大纲"的噪音。
 * dev harness 与单测没有该容器时回退到 `main`。
 */
function collectHeadings(container: ParentNode): TocEntry[] {
  const scope: ParentNode = container;
  const nodes = scope.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
  const entries: TocEntry[] = [];
  for (const el of nodes) {
    if (el.closest(`[${PANEL_ATTR}]`) !== null) continue;
    if (el.closest('pre, code, nav, [aria-hidden="true"]') !== null) continue;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    entries.push({ el, level: Number(el.tagName.slice(1)) || 6, text });
  }
  return entries;
}

/** 标题结构签名：层级 + 文案；结构相同即无需重写列表。 */
/**
 * 找到"该给哪个容器生成大纲"：
 *  1. DSH 右侧文档预览的 tab 容器（`[data-sidebar-right-tab]`，且标题数达标）
 *  2. 回退到 `<main>`（dev harness / 单测）
 *  3. 都没有 → 不生成（宁可不做，也不要在整页乱贴大纲）
 */
function findScope(doc: Document): HTMLElement | null {
  const qualifies = (el: HTMLElement): boolean =>
    el.querySelectorAll('h1,h2,h3,h4,h5,h6').length >= MIN_HEADINGS;
  for (const pane of doc.querySelectorAll<HTMLElement>('[data-sidebar-right-tab]')) {
    if (qualifies(pane)) return pane;
  }
  const main = doc.querySelector<HTMLElement>('main');
  return main !== null && qualifies(main) ? main : null;
}

/** 找容器内真正滚动的元素（scroll spy 要听它，而不是 window）。 */
function scrollTargetFor(scope: HTMLElement): HTMLElement | Window {
  // 1) 容器内部的滚动区（DSH 文档正文在 `.scrollport` 里滚，而不是 window）
  const inner =
    scope.querySelector<HTMLElement>('[class*="scrollport"]') ??
    [...scope.querySelectorAll<HTMLElement>('div,section')]
      .slice(0, 300)
      .find((el) => {
        const cs = getComputedStyle(el);
        return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
      }) ??
    null;
  if (inner !== null) return inner;
  // 2) 祖先链
  let el: HTMLElement | null = scope;
  while (el !== null && el !== document.body) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
    el = el.parentElement;
  }
  return window;
}

function signatureOf(entries: readonly TocEntry[]): string {
  return entries.map((entry) => `${entry.level}\u0000${entry.text}`).join('\u0001');
}

function ensurePanel(doc: Document, container: HTMLElement): { panel: HTMLElement; list: HTMLElement } {
  const existing = container.querySelector<HTMLElement>(`[${PANEL_ATTR}]`);
  if (existing !== null) {
    const list = existing.querySelector<HTMLElement>(`.mdp-toc-list`);
    if (list !== null) {
      state.panel = existing;
      state.list = list;
      return { panel: existing, list };
    }
    existing.remove();
  }

  const panel = doc.createElement('nav');
  panel.setAttribute(PANEL_ATTR, '');
  panel.className = 'mdp-toc';
  panel.setAttribute('aria-label', '文档大纲');

  const header = doc.createElement('div');
  header.className = 'mdp-toc-header';

  const title = doc.createElement('span');
  title.className = 'mdp-toc-title';
  title.textContent = '大纲';

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mdp-toc-toggle';
  toggle.setAttribute('aria-expanded', String(!state.collapsed));
  toggle.textContent = state.collapsed ? '展开' : '收起';
  toggle.addEventListener('click', () => {
    state.collapsed = !state.collapsed;
    writeCollapsed(state.collapsed);
    applyCollapsed();
  });

  header.append(title, toggle);

  const list = doc.createElement('ol');
  list.className = 'mdp-toc-list';

  panel.append(header, list);
  // 挂在容器内部、内容之前：不遮挡正文，滚动时随内容一起离开视口
  container.prepend(panel);

  state.panel = panel;
  state.list = list;
  applyCollapsed();
  return { panel, list };
}

function applyCollapsed(): void {
  if (state.panel === null) return;
  state.panel.classList.toggle('mdp-toc-collapsed', state.collapsed);
  const toggle = state.panel.querySelector<HTMLButtonElement>('.mdp-toc-toggle');
  if (toggle !== null) {
    toggle.textContent = state.collapsed ? '展开' : '收起';
    toggle.setAttribute('aria-expanded', String(!state.collapsed));
  }
}

function setActive(index: number): void {
  if (state.list === null || index === state.activeIndex) return;
  const items = state.list.querySelectorAll<HTMLElement>(`[${ITEM_ATTR}]`);
  items.forEach((item, i) => {
    if (i === index) item.setAttribute(ACTIVE_ATTR, 'true');
    else item.removeAttribute(ACTIVE_ATTR);
  });
  state.activeIndex = index;
  const active = items[index];
  if (active !== undefined && typeof active.scrollIntoView === 'function') {
    // 只让大纲自身滚动，不影响页面
    active.scrollIntoView({ block: 'nearest' });
  }
}

function scrollToEntry(entry: TocEntry): void {
  if (typeof entry.el.scrollIntoView === 'function') {
    entry.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** 滚动定位：取"最后一个已越过视口上沿"的标题。 */
function updateActiveByScroll(): void {
  if (state.entries.length === 0) return;
  let index = 0;
  for (let i = 0; i < state.entries.length; i += 1) {
    const rect = state.entries[i]!.el.getBoundingClientRect();
    if (rect.top - SCROLL_OFFSET_PX <= 0) index = i;
    else break;
  }
  setActive(index);
}

function bindScroll(target: HTMLElement | Window = window): void {
  if (state.onScroll !== null && state.scrollTarget === target) return;
  if (state.onScroll !== null && state.scrollTarget !== null) {
    state.scrollTarget.removeEventListener?.('scroll', state.onScroll);
    state.onScroll = null;
  }
  const handler = (): void => {
    if (state.rafPending) return;
    state.rafPending = true;
    const run = (): void => {
      state.rafPending = false;
      updateActiveByScroll();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(run);
    else setTimeout(run, 16);
  };
  state.onScroll = handler;
  state.scrollTarget = target;
  target.addEventListener?.('scroll', handler, { passive: true });
}

function renderList(doc: Document, list: HTMLElement, entries: TocEntry[]): void {
  const minLevel = Math.min(...entries.map((entry) => entry.level));
  const fragment = doc.createDocumentFragment();
  entries.forEach((entry, index) => {
    const li = doc.createElement('li');
    li.className = 'mdp-toc-entry';
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute(ITEM_ATTR, String(index));
    button.className = 'mdp-toc-item';
    button.style.paddingInlineStart = `${(entry.level - minLevel) * 12 + 8}px`;
    button.textContent = entry.text;
    button.title = entry.text;
    button.addEventListener('click', () => {
      // 按索引取当前元素：流式重渲染可能已替换 DOM 节点，闭包里的旧引用会指向游离节点。
      const target = state.entries[index];
      if (target === undefined) return;
      setActive(index);
      scrollToEntry(target);
    });
    li.append(button);
    fragment.append(li);
  });
  list.replaceChildren(fragment);
}

function teardown(): void {
  for (const stale of document.querySelectorAll(`[${PANEL_ATTR}]`)) stale.remove();
  if (state.onScroll !== null) {
    state.scrollTarget?.removeEventListener?.('scroll', state.onScroll);
    state.onScroll = null;
  }
  state.panel?.remove();
  state.panel = null;
  state.list = null;
  state.entries = [];
  state.activeIndex = -1;
  state.signature = null;
}

export const tocModule: DocModule = {
  id: 'toc',

  refresh(doc: Document): void {
    const scope = findScope(doc);
    if (scope === null) {
      teardown();
      return;
    }
    const entries = collectHeadings(scope);
    if (entries.length < MIN_HEADINGS) {
      teardown();
      return;
    }
    // **结构没变就不重写 DOM**：文档级 observer 观察整页子树，自己的写入会被再次观察到，
    // 不设这道闸就会每 250ms 刷新一次、永不停止（实测：一次宿主写入引发 6 次 refresh）。
    const signature = signatureOf(entries);
    // 面板必须「还活着、还挂在这个 scope 里、结构未变」才算无需重建；
    // 宿主重渲染（保存/主题切换/流式）会让旧面板脱离文档，此时必须重建（B1/B2）。
    const unchanged =
      state.panel !== null &&
      state.list !== null &&
      state.scope === scope &&
      state.panel.isConnected &&
      state.panel.parentElement === scope &&
      state.signature === signature;
    state.entries = entries;
    if (!unchanged) {
      const { list } = ensurePanel(doc, scope);
      renderList(doc, list, entries);
      state.activeIndex = -1;
      state.signature = signature;
      state.scope = scope;
    }
    bindScroll(scrollTargetFor(scope));
    updateActiveByScroll();
  },

  dispose(): void {
    teardown();
  },
};
