#!/usr/bin/env bun
/**
 * 构建管线（三段产物 + 自检）：
 *   ① 宿主半侧  src/index.ts        → dist/index.js          （ESM）
 *   ② 客户端半侧 src/client.ts      → dist/client.js         （IIFE → 包装成官方注册形式）
 *   ③ 惰性运行时 src/runtime/mermaid.ts → dist/runtime/mermaid.js（自包含 ESM，宿主按需供出）
 *
 * 客户端包装的官方依据（`@deepseek-ai/dsh-client-modules` README）：
 *  「宿主向 <head> 注入 window.__ModuleLoader__ queue facade……执行插件 bundle 只注册其 factory；
 *    每个模块主体副作用位于 factory 闭包中，在物化时运行（factory(require) → 导出，记忆化）」
 *  ⇒ 产物形态 = `window.__ModuleLoader__.load({ id, factory: function (require) { … return exports } })`。
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const clientRaw = join(root, '.build/client/client.iife.js');
const runtimeRaw = join(root, '.build/runtime/mermaid.js');
const outClient = join(root, 'dist/client.js');
const outRuntime = join(root, 'dist/runtime/mermaid.js');
const run = (args) => execFileSync('bunx', args, { cwd: root, stdio: 'inherit', env: { ...process.env, MDP_BUILD_ID: buildId } });

const buildId = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() || 'nogit';
  } catch {
    return 'nogit';
  }
})();

rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(root, 'dist'), { recursive: true });

run(['vite', 'build', '--config', 'vite.config.ts']);
run(['vite', 'build', '--config', 'vite.client.config.ts']);
run(['vite', 'build', '--config', 'vite.runtime.config.ts']);

for (const [file, what] of [[clientRaw, '客户端半侧'], [runtimeRaw, '惰性运行时']]) {
  if (!existsSync(file)) {
    console.error(`✗ ${what}未产出：${file}`);
    process.exit(1);
  }
}

const iife = readFileSync(clientRaw, 'utf8');
const wrapped = `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: function (require) {\n${iife}\nreturn typeof __mdpClient !== "undefined" ? __mdpClient : undefined;\n}});\n`;
writeFileSync(outClient, wrapped);

mkdirSync(join(root, 'dist/runtime'), { recursive: true });
copyFileSync(runtimeRaw, outRuntime);
writeFileSync(join(root, 'dist/build-id.txt'), `${buildId}\n`);

const problems = [];
// —— 客户端产物契约 ——
if (!wrapped.startsWith('window.__ModuleLoader__.load({')) problems.push('缺少 __ModuleLoader__.load 注册包装');
if (!wrapped.includes(JSON.stringify(pkg.name))) problems.push(`注册 id 与包名不一致（应 ${pkg.name}）`);
if (!/factory:\s*function\s*\(require\)/.test(wrapped)) problems.push('缺少 factory(require) 形参');
if (/\bmodule\.exports\b/.test(wrapped)) problems.push('产物引用 module.exports（会导致 Web 界面打不开）');
if (/^\s*(import|export)\s/m.test(iife)) problems.push('客户端 IIFE 含 ESM 语法（应自包含）');
// —— 宿主产物契约 ——
if (!readFileSync(join(root, 'dist/index.js'), 'utf8').includes('webServer')) problems.push('宿主半侧未注册 webServer 路由（客户端产物将永不被请求）');
// —— 运行时资产契约 ——
const runtime = readFileSync(outRuntime, 'utf8');
if (!/^\s*export\s/m.test(runtime)) problems.push('运行时资产不是 ESM');
if (/^\s*import\s+[^'"(*]/m.test(runtime) || /from\s*["']\.\//.test(runtime)) problems.push('运行时资产非自包含（存在相对 import）');
if (statSync(outRuntime).size < 200_000) problems.push(`运行时资产过小（${statSync(outRuntime).size} 字节）——引擎可能未内联`);

if (problems.length > 0) {
  console.error(`✗ 产物自检未通过：\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `✓ dist/index.js ${kb(statSync(join(root, 'dist/index.js')).size)} · dist/client.js ${kb(statSync(outClient).size)}` +
    ` · dist/runtime/mermaid.js ${kb(statSync(outRuntime).size)}（build ${buildId}）自检通过`,
);
