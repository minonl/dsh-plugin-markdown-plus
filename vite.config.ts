import { defineConfig } from 'vite';

/**
 * 宿主（host）半构建：`src/index.ts` → `dist/index.js`（ESM，由 Node 侧 import）。
 *
 * 注意：宿主半侧跑在 Node 里（需要读取本包内的惰性资产），因此这里必须按 **SSR/Node** 目标构建，
 * 否则 Vite 会按浏览器处理并把 `node:*` 内置模块外部化成浏览器桩（构建期直接报错）。
 */
export default defineConfig({
  define: { __MDP_BUILD_ID__: JSON.stringify(process.env.MDP_BUILD_ID ?? 'dev') },
  build: {
    ssr: true,
    target: 'node20',
    lib: { entry: { index: 'src/index.ts' }, formats: ['es'] },
    sourcemap: true,
    emptyOutDir: false,
    rollupOptions: { external: [/^node:/] },
  },
});
