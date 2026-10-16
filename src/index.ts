/**
 * 宿主（host）半 —— 在 DSH 的 cordis 树里注册一条惰性资产路由。
 *
 * 为什么宿主半侧必须"真用 ctx"：客户端半侧的产物**只在宿主条目拥有 fiber 时才会被请求**；
 * 空实现 `apply(){}` 会让插件静默失效（装了但没有任何效果）。
 *
 * 官方契约（`@deepseek-ai/dsh-host-webserver` README）：
 *  - `WebServer` 继承 cordis `Service`，`register(route)` 接受 `exact` / `prefix` 路由并返回 disposer；
 *  - `{ kind: 'exact', path, handler(req, res) }`，handler 拥有完整响应生命周期；
 *  - 匹配顺序：精确 → 最长前缀 → 回退；重复 `(kind, path)` 抛错。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PLUGIN_ID, RUNTIME_MERMAID_PATH } from './shared.js';

/** 需要宿主提供的服务。 */
export const inject = ['webServer'];

/** 与 `package.json` 的 `name` 一致（cordis 条目名）。 */
export const name = PLUGIN_ID;

/** 构建产物中的惰性资产位置（与本文件同目录）。 */
const MERMAID_ASSET = new URL('./runtime/mermaid.js', import.meta.url);

/** 一个惰性读取并缓存的静态资产响应。 */
interface CachedAsset {
  readonly body: Buffer;
  readonly etag: string;
}

function etagOf(body: Buffer): string {
  // 内容指纹足够用于条件请求；不引入哈希依赖：长度 + 前 1KiB 的字节和。
  let sum = body.length;
  const head = body.subarray(0, Math.min(body.length, 1024));
  for (const byte of head) sum = (sum * 31 + byte) >>> 0;
  return `"${body.length.toString(36)}-${sum.toString(36)}"`;
}

/**
 * 注册惰性资产路由。
 *
 * 客户端半侧**首次遇到 Mermaid 代码块时**才请求该资产，因此插件的常规加载路径不携带引擎体积；
 * 请求路径带构建戳（`?rev=`），因此可以长期缓存。
 */
export function apply(ctx: { effect: (fn: () => unknown, label?: string) => unknown; webServer: WebServerLike }): void {
  let cached: CachedAsset | null = null;

  const load = async (): Promise<CachedAsset | null> => {
    if (cached !== null) return cached;
    try {
      const body = await readFile(fileURLToPath(MERMAID_ASSET));
      cached = { body, etag: etagOf(body) };
      return cached;
    } catch {
      return null;
    }
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: RUNTIME_MERMAID_PATH,
        async handler(req: { method?: string; headers: Record<string, unknown> }, res: ResponseLike) {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405);
            res.end();
            return;
          }
          const asset = await load();
          if (asset === null) {
            // 缺失资产 = 构建不完整：响亮失败（明确告知，而不是静默空白）。
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('markdown-plus: runtime asset missing; run the package build.\n');
            return;
          }
          if (req.headers['if-none-match'] === asset.etag) {
            res.writeHead(304, { etag: asset.etag });
            res.end();
            return;
          }
          res.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'cache-control': 'public, max-age=31536000, immutable',
            etag: asset.etag,
          });
          res.end(req.method === 'HEAD' ? undefined : asset.body);
        },
      }),
    `${PLUGIN_ID}: runtime route`,
  );
}

/** 官方 `WebRoute.handler` 使用的 `ServerResponse` 子集（只声明用到的部分）。 */
interface ResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown;
  end(body?: unknown): unknown;
}

/** 官方 `HttpServerService` 子集（只声明用到的部分）。 */
interface WebServerLike {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: never, res: never) => void | Promise<void> }): () => void;
}

export default { name, inject, apply };
