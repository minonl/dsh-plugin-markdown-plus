/**
 * 大纲（TOC）模块 —— 与 DSH 原生「轮次导航」同构的**右侧细轨道**。
 *
 * 为什么改成轨道而不是面板：宿主原生大纲（`nav[aria-label="轮次导航"]`，宽 28px、
 * 贴右边缘 12px、刻度 + 悬浮预览 + 点击跳转 + 边缘渐隐）已经培养了用户习惯；
 * 我们做成同构交互，既不遮挡内容，也不与原生控件打架。
 *
 * 契约：幂等（同页只一条轨道）、降级（标题不足则移除）、scroll spy、防抖重建。
 */
import type { DocModule } from '../docs.js';

const RAIL_ATTR = 'data-mdp-toc';
const MARK_ATTR = 'data-mdp-toc-item';
const ACTIVE_ATTR = 'aria-current';
const MIN_HEADINGS = 2;
const SCROLL_OFFSET_PX = 80;
const MARK_GAP_PX = 10;

interface TocEntry {
  readonly el: HTMLElement;
  readonly level: number;
  readonly text: string;
}

interface TocState {
  rail: HTMLElement | null;
  marks: HTMLElement | null;
  preview: HTMLElement | null;
  entries: TocEntry[];
  signature: string;
  activeIndex: number;
  onScroll: (() => void) | null;
  rafPending: boolean;
}

const state: TocState = {
  rail: null,
  marks: null,
  preview: null,
  entries: [],
  signature: '',
  activeIndex: -1,
  onScroll: null,
  rafPending: false,
};

/** 收集标题：排除代码块、导航、插件自身产物。 */
function collectHeadings(doc: Document): TocEntry[] {
  const scope: ParentNode = doc.querySelector('main') ?? doc.body;
  if (scope === null) return [];
  const entries: TocEntry[] = [];
  for (const el of scope.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
    if (el.closest(`[${RAIL_ATTR}]`) !== null) continue;
    if (el.closest('pre, code, nav, [aria-hidden="true"]') !== null) continue;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    entries.push({ el, level: Number(el.tagName.slice(1)) || 6, text });
  }
  return entries;
}

function ensureRail(doc: Document): { rail: HTMLElement; marks: HTMLElement; preview: HTMLElement } {
  const existing = doc.querySelector<HTMLElement>(`nav[${RAIL_ATTR}]`);
  if (existing !== null) {
    const marks = existing.querySelector<HTMLElement>('.mdp-toc-marks');
    const preview = existing.querySelector<HTMLElement>('.mdp-toc-preview');
    if (marks !== null && preview !== null) {
      state.rail = existing;
      state.marks = marks;
      state.preview = preview;
      return { rail: existing, marks, preview };
    }
    existing.remove();
  }

  const rail = doc.createElement('nav');
  rail.setAttribute(RAIL_ATTR, '');
  rail.className = 'mdp-toc-rail';
  rail.setAttribute('aria-label', '文档大纲');

  const marks = doc.createElement('div');
  marks.className = 'mdp-toc-marks';

  const preview = doc.createElement('div');
  preview.className = 'mdp-toc-preview';
  preview.setAttribute('aria-hidden', 'true');

  rail.append(marks, preview);
  doc.body.append(rail);

  state.rail = rail;
  state.marks = marks;
  state.preview = preview;
  return { rail, marks, preview };
}

function showPreview(entry: TocEntry, mark: HTMLElement): void {
  if (state.preview === null || state.rail === null) return;
  const railRect = state.rail.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  state.preview.textContent = entry.text;
  state.preview.classList.add('mdp-toc-preview-visible');
  const top = Math.max(0, markRect.top - railRect.top - 8);
  state.preview.style.transform = `translateY(${top}px)`;
  state.preview.setAttribute('aria-hidden', 'false');
}

function hidePreview(): void {
  if (state.preview === null) return;
  state.preview.classList.remove('mdp-toc-preview-visible');
  state.preview.setAttribute('aria-hidden', 'true');
}

function setActive(index: number): void {
  if (state.marks === null || index === state.activeIndex) return;
  const marks = state.marks.querySelectorAll<HTMLElement>(`[${MARK_ATTR}]`);
  marks.forEach((mark, i) => {
    if (i === index) mark.setAttribute(ACTIVE_ATTR, 'true');
    else mark.removeAttribute(ACTIVE_ATTR);
  });
  state.activeIndex = index;
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

/** 刻度：层级越深越短（一级最宽），与原生的等宽刻度区分层级。 */
function renderMarks(doc: Document, marks: HTMLElement, entries: TocEntry[]): void {
  const minLevel = Math.min(...entries.map((entry) => entry.level));
  const fragment = doc.createDocumentFragment();
  entries.forEach((entry, index) => {
    const mark = doc.createElement('button');
    mark.type = 'button';
    mark.setAttribute(MARK_ATTR, String(index));
    mark.className = 'mdp-toc-mark';
    mark.dataset.level = String(entry.level);
    const depth = Math.min(entry.level - minLevel, 3);
    mark.style.width = `${18 - depth * 3}px`;
    mark.style.transform = `translate3d(0, ${index * MARK_GAP_PX}px, 0)`;
    mark.setAttribute('aria-label', `跳转到：${entry.text}`);
    mark.addEventListener('mouseenter', () => showPreview(entry, mark));
    mark.addEventListener('mouseleave', hidePreview);
    mark.addEventListener('focus', () => showPreview(entry, mark));
    mark.addEventListener('blur', hidePreview);
    mark.addEventListener('click', () => {
      setActive(index);
      scrollToEntry(entry);
    });
    fragment.append(mark);
  });
  marks.replaceChildren(fragment);
  marks.style.height = `${Math.max(entries.length * MARK_GAP_PX, MARK_GAP_PX)}px`;
}

function teardown(): void {
  if (state.onScroll !== null) {
    globalThis.removeEventListener?.('scroll', state.onScroll);
    state.onScroll = null;
  }
  state.rail?.remove();
  state.rail = null;
  state.marks = null;
  state.preview = null;
  state.entries = [];
  state.signature = '';
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
    const { marks } = ensureRail(doc);
    // 幂等短路：标题结构没变就不碰 DOM（否则会被自己的 MutationObserver 反复触发）
    const signature = entries.map((entry) => `${entry.level}:${entry.text}`).join('|');
    if (signature !== state.signature) {
      state.entries = entries;
      state.signature = signature;
      renderMarks(doc, marks, entries);
      state.activeIndex = -1;
    }
    bindScroll();
    updateActiveByScroll();
  },

  dispose(): void {
    teardown();
  },
};
