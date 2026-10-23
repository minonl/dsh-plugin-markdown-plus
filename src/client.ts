/**
 * 客户端（client）半 —— 浏览器侧 Markdown 增强入口。
 *
 * 产物形态：**IIFE 包装成官方模块注册形式**（`window.__ModuleLoader__.load({ id, factory })`），
 * 由 `scripts/build.mjs` 完成包装与自检。模块副作用（引擎启动、样式注入）在 factory 物化时运行。
 */
import { PLUGIN_ID } from './shared.js';
import { resetEngine, startEngine, type Engine, type EnhanceModule } from './client/engine.js';
import { startDocModules, type DocEngine, type DocModule } from './client/docs.js';
import { mermaidModule } from './client/modules/mermaid.js';
import { tocModule } from './client/modules/toc.js';
import { ensureStyles } from './client/styles.js';

/** 模块身份（与包名一致）。 */
export const clientName = PLUGIN_ID;

/** 默认启用的**块级**增强模块（作用于 `pre>code`）。 */
export const defaultModules: readonly EnhanceModule[] = [mermaidModule];

/** 默认启用的**文档级**增强模块（作用于整页结构）。 */
export const defaultDocModules: readonly DocModule[] = [tocModule];

let engine: Engine | null = null;
let docEngine: DocEngine | null = null;

/** 启动增强（**幂等**：重复调用返回同一引擎）。 */
export function boot(modules: readonly EnhanceModule[] = defaultModules): Engine {
  if (engine !== null) return engine;
  if (typeof document === 'undefined') {
    // 非浏览器环境（例如 Node 侧误加载）：不抛错，保持可导入。
    engine = { scan: () => {}, stop: () => {}, modules };
    return engine;
  }
  ensureStyles();
  engine = startEngine(modules);
  docEngine = startDocModules(defaultDocModules);
  return engine;
}

/** 停止并释放（测试 / 热重载）。 */
export function stop(): void {
  docEngine?.stop();
  docEngine = null;
  resetEngine();
  engine = null;
}

/** 测试钩子（不影响生产路径）。 */
export const __test = { boot, stop };

// 模块物化即自启动：插件不依赖任何其它模块的 import（`dsh.client.inject` 为空）。
boot();

export default { clientName, boot, stop, defaultModules, defaultDocModules };
