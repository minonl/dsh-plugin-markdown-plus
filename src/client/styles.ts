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
`;

/** 注入样式（已存在则复用）。 */
export function ensureStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_TAG_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = CSS;
  doc.head.append(style);
}
