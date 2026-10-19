import { defineConfig } from 'vite';
import { join } from 'node:path';

/**
 * 本地独立调试用的 vite 配置（**不参与 npm 发布**）。
 *
 * root 保持仓根，这样 `/src/**` 能直接以 TS 源提供（改代码即热更新）；
 * 调试台页面在 `/dev/harness.html`，宿主路由 `/dsh-markdown-plus/runtime/mermaid.js` 由中间件模拟。
 */
export default defineConfig({
  root: join(import.meta.dirname, '..'),
  // 不自动打开浏览器：调用方（人或 e2e）自己决定，避免干扰正在使用的浏览器
  server: { port: 5183, open: false, strictPort: false },
  plugins: [
    {
      name: 'mdp-dev-runtime-route',
      configureServer(server) {
        // 模拟宿主半侧的 `ctx.webServer` 路由：现场用 vite 构建引擎（不写盘）
        server.middlewares.use('/dsh-markdown-plus/runtime/mermaid.js', async (_req, res) => {
          try {
            const { build } = await import('vite');
            const result = await build({
              configFile: false,
              logLevel: 'silent',
              build: {
                write: false,
                lib: {
                  entry: join(import.meta.dirname, '../src/runtime/mermaid.ts'),
                  formats: ['es'],
                  fileName: () => 'mermaid.js',
                },
                minify: false,
                target: 'es2022',
                rollupOptions: { output: { inlineDynamicImports: true } },
              },
            });
            const output = Array.isArray(result) ? result[0] : result;
            const chunk = output.output.find((item) => item.type === 'chunk');
            res.setHeader('content-type', 'text/javascript; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.end(chunk?.code ?? '');
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end(`dev runtime build failed: ${String(error)}`);
          }
        });
      },
    },
  ],
});
