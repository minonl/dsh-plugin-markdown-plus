/** 插件自有样式（**幂等**注入：同一文档只注入一次）。 */
export const STYLE_TAG_ID = 'mdp/styles';

export const CSS = `
.mdp-figure { margin: 8px 0; }
.mdp-figure svg { max-width: 100%; height: auto; }
.mdp-note {
  margin: 4px 0 8px;
  padding: 6px 8px;
  border-left: 3px solid var(--dsw-color-warning, #d97706);
  background: color-mix(in srgb, currentColor 6%, transparent);
  font-size: 12px;
  line-height: 1.6;
  display: flex;
  gap: 8px;
  align-items: center;
}
.mdp-note-label { flex: 1 1 auto; }
.mdp-retry {
  flex: 0 0 auto;
  font: inherit;
  padding: 1px 8px;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.mdp-toggle {
  font: inherit;
  font-size: 12px;
  padding: 1px 8px;
  margin: 2px 0 6px;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.mdp-toc {
  /* 停靠在预览容器内部：sticky 保持可见，float 让正文绕排，不遮挡内容 */
  position: sticky;
  top: 8px;
  float: right;
  margin: 0 0 8px 12px;
  width: 200px;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  font-size: 12.5px;
  line-height: 1.5;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, Canvas 92%, currentColor 8%);
  backdrop-filter: blur(6px);
  z-index: 40;
  overflow: hidden;
}
.mdp-toc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}
.mdp-toc-title { flex: 1 1 auto; font-weight: 600; opacity: .85; }
.mdp-toc-toggle {
  font: inherit; font-size: 11px; padding: 1px 6px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 4px; background: transparent; color: inherit; cursor: pointer;
}
.mdp-toc-list {
  list-style: none; margin: 0; padding: 4px 0;
  overflow-y: auto; overscroll-behavior: contain;
}
.mdp-toc-entry { margin: 0; }
.mdp-toc-item {
  display: block; width: 100%; text-align: start;
  font: inherit; padding: 3px 8px; border: 0; background: transparent; color: inherit;
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: .75;
}
.mdp-toc-item:hover { background: color-mix(in srgb, currentColor 8%, transparent); opacity: 1; }
.mdp-toc-item[aria-current="true"] {
  opacity: 1; font-weight: 600;
  box-shadow: inset 2px 0 0 currentColor;
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.mdp-toc-collapsed .mdp-toc-list { display: none; }
.mdp-toc-collapsed {
  width: fit-content;
  min-width: 92px;
  max-height: none;
}
@media (max-width: 1180px) { .mdp-toc { display: none; } }
`;

/** 注入样式（已存在则复用）。 */
export function ensureStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_TAG_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = CSS;
  doc.head.append(style);
}
