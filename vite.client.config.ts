import { defineConfig } from 'vite';

/**
 * 客户端（client）半构建：`src/client.ts` → IIFE（随后由 `scripts/build.mjs` 包装成注册形式）。
 *
 * ⚠️ 为什么必须 IIFE（官方读得的硬契约）：
 *  - 宿主注入 `window.__ModuleLoader__` facade，插件 bundle 的作用是**注册 factory**
 *    （`factory(require)` → 导出，副作用在物化时才跑）⇒ **ESM 的 import/export 无法放进 factory 函数体**；
 *  - 协议只支持**自包含**产物：入口不能同步 require 另一个相对 `client*.js` 产物
 *    ⇒ 单文件（`inlineDynamicImports`），不做 code splitting；
 *  - 产物**不得引用 `module`/`exports`**（否则整个 Web 界面打不开）。
 */
export default defineConfig({
  define: { __MDP_BUILD_ID__: JSON.stringify(process.env.MDP_BUILD_ID ?? 'dev') },
  build: {
    lib: { entry: 'src/client.ts', name: '__mdpClient', formats: ['iife'], fileName: () => 'client.iife.js' },
    outDir: '.build/client',
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'es2022',
    sourcemap: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
