import { defineConfig } from 'vite';

/**
 * 构建两个入口（DSH 插件的两半）：
 *  - src/index.ts  宿主（host）半：在 cordis 树里注册服务/注入
 *  - src/client.ts 客户端（client）半：浏览器侧 UI 增强
 * 产物：dist/index.js + dist/client.js（ESM）
 */
export default defineConfig({
  build: {
    lib: { entry: { index: 'src/index.ts', client: 'src/client.ts' }, formats: ['es'] },
    sourcemap: true,
    emptyOutDir: true,
  },
});
