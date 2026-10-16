/**
 * 宿主半侧与客户端半侧共享的常量与契约。
 *
 * 两侧必须就「运行时资产路径」达成一致：宿主半侧注册该路由，客户端半侧按需拉取。
 */

/** 插件身份。与 `package.json` 的 `name`、`cordis.patch.yml` 的 `name` 必须一致。 */
export const PLUGIN_ID = '@minonl/dsh-plugin-markdown-plus';

/** 构建期注入的构建标识（用于运行时资产缓存戳与问题定位）。 */
declare const __MDP_BUILD_ID__: string | undefined;
export const BUILD_ID: string =
  typeof __MDP_BUILD_ID__ === 'string' ? __MDP_BUILD_ID__ : 'dev';

/** 宿主半侧供出的惰性资产目录（浏览器请求路径空间）。 */
export const RUNTIME_BASE = '/dsh-markdown-plus';

/** Markdown 渲染引擎运行时（Mermaid）的请求路径。 */
export const RUNTIME_MERMAID_PATH = `${RUNTIME_BASE}/runtime/mermaid.js`;

/**
 * 需要增强的候选节点标记。引擎只处理未标记的 `<pre><code>`，据此保证幂等
 * （重复扫描、重复挂载都不会二次渲染）。
 */
export const ATTR_STATE = 'data-mdp-state';

/** 候选节点的状态取值。 */
export type BlockState = 'claimed' | 'rendered' | 'degraded';
