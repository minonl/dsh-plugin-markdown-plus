import { defineConfig } from 'vite';

/**
 * 宿主（host）半构建：`src/index.ts` → `dist/index.js`（**ESM**，由 Node 侧 import）。
 *
 * 契约（官方 `@deepseek-ai/dsh-client-modules` README，运行版 0.2.0-rc.2）：
 *  - 宿主半侧必须是**真会激活**的条目（`export const name` + `apply(ctx)` 真用 ctx），
 *    否则浏览器半侧**永不被请求**（静默失效）；
 *  - `exports["."]` 指向本产物。
 */
export default defineConfig({
  build: {
    lib: { entry: { index: 'src/index.ts' }, formats: ['es'] },
    sourcemap: true,
    emptyOutDir: false,     // 与客户端半构建共用 dist/
  },
});
