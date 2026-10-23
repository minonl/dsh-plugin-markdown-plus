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
  rafPending: boolean;
}

const state: TocState = {
  panel: null,
  list: null,
  entries: [],
  activeIndex: -1,
  collapsed: readCollapsed(),
  onScroll: null,
  rafPending: false,
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

/** 收集标题：排除代码块、导航、以及本插件自己的产物。 */
function collectHeadings(doc: Document): TocEntry[] {
  const scope: ParentNode = doc.querySelector('main') ?? doc.body;
  if (scope === null) return [];
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

function ensurePanel(doc: Document): { panel: HTMLElement; list: HTMLElement } {
  const existing = doc.querySelector<HTMLElement>(`[${PANEL_ATTR}]`);
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
  doc.body.append(panel);

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

function bindScroll(): void {
  if (state.onScroll !== null) return;
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
  globalThis.addEventListener?.('scroll', handler, { passive: true });
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
      setActive(index);
      scrollToEntry(entry);
    });
    li.append(button);
    fragment.append(li);
  });
  list.replaceChildren(fragment);
}

function teardown(): void {
  if (state.onScroll !== null) {
    globalThis.removeEventListener?.('scroll', state.onScroll);
    state.onScroll = null;
  }
  state.panel?.remove();
  state.panel = null;
  state.list = null;
  state.entries = [];
  state.activeIndex = -1;
}

export const tocModule: DocModule = {
  id: 'toc',

  refresh(doc: Document): void {
    const entries = collectHeadings(doc);
    if (entries.length < MIN_HEADINGS) {
      teardown();
      return;
    }
    const { list } = ensurePanel(doc);
    state.entries = entries;
    renderList(doc, list, entries);
    state.activeIndex = -1;
    bindScroll();
    updateActiveByScroll();
  },

  dispose(): void {
    teardown();
  },
};
