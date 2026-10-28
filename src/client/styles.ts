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
/* —— 大纲轨道：与 DSH 原生「轮次导航」同构（宽 28px、贴右 12px、刻度 + 悬浮预览）—— */
.mdp-toc-rail {
  position: fixed;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  max-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  pointer-events: auto;
}
.mdp-toc-marks {
  position: relative;
  width: 28px;
}
.mdp-toc-mark {
  position: absolute;
  top: 0;
  right: 5px;
  height: 3px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: color-mix(in srgb, currentColor 32%, transparent);
  cursor: pointer;
  transition: background .12s ease, width .12s ease;
}
.mdp-toc-mark:hover,
.mdp-toc-mark:focus-visible {
  background: color-mix(in srgb, currentColor 75%, transparent);
}
.mdp-toc-mark[aria-current="true"] {
  background: currentColor;
  height: 4px;
}
.mdp-toc-preview {
  position: absolute;
  right: 32px;
  max-width: 280px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: color-mix(in srgb, Canvas 92%, currentColor 8%);
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
  opacity: 0;
  pointer-events: none;
  transition: opacity .1s ease;
}
.mdp-toc-preview-visible { opacity: 1; }
@media (max-width: 900px) { .mdp-toc-rail { display: none; } }

`;

/** 注入样式（已存在则复用）。 */
export function ensureStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_TAG_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = CSS;
  doc.head.append(style);
}
