/**
 * 惰性资产：Markdown 图表引擎运行时。
 *
 * 该文件被单独构建为**自包含 ESM**（`dist/runtime/mermaid.js`），由宿主半侧的
 * `ctx.webServer` 路由按需供出，客户端半侧在首次遇到 Mermaid 代码块时才拉取。
 * 引擎版本在 `package.json` 的 `devDependencies` 中**精确锁定**，构建期内联，
 * 因此插件本身没有运行时 npm 依赖（不触发依赖构建脚本授权流程）。
 */
import mermaid from 'mermaid';

export default mermaid;
