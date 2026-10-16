import { defineConfig } from 'vite';

/**
 * 惰性运行时资产构建：`src/runtime/mermaid.ts` → `dist/runtime/mermaid.js`（**自包含 ESM**）。
 *
 * 该资产由宿主半侧的 `ctx.webServer` 路由按需供出，客户端首次遇到 Mermaid 块时才拉取；
 * 引擎（Mermaid）在此**构建期**内联，因此插件没有运行时 npm 依赖。
 */
export default defineConfig({
  define: { __MDP_BUILD_ID__: JSON.stringify(process.env.MDP_BUILD_ID ?? 'dev') },
  build: {
    lib: { entry: 'src/runtime/mermaid.ts', formats: ['es'], fileName: () => 'mermaid.js' },
    outDir: '.build/runtime',
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'es2022',
    sourcemap: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
