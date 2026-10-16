#!/usr/bin/env bun
/**
 * 构建管线：宿主半（ESM）→ dist/index.js ；客户端半（IIFE）→ 包装成模块注册形式 → dist/client.js
 *
 * 客户端包装的官方依据（`@deepseek-ai/dsh-client-modules` README，运行版 0.2.0-rc.2）：
 *  「宿主向 <head> 注入 window.__ModuleLoader__ queue facade……执行插件 bundle 只注册其 factory；
 *    每个模块主体副作用位于 factory 闭包中，在物化时运行（factory(require) → 导出）」
 *  ⇒ 产物形态 = `window.__ModuleLoader__.load({ id, factory(require) { … return exports } })`。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const raw = join(root, '.build/client/client.iife.js');
const out = join(root, 'dist/client.js');
const run = (args, env) => execFileSync('bunx', args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

// ① build id 先算（用于产物里的版本标识）
const buildId = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() || 'nogit'; } catch { return 'nogit'; } })();

// ② 两半分别构建（先清 dist，避免旧产物残留造成误判）
rmSync(join(root, 'dist'), { recursive: true, force: true });
run(['vite', 'build', '--config', 'vite.config.ts']);
run(['vite', 'build', '--config', 'vite.client.config.ts'], { MDP_BUILD_ID: buildId });
if (!existsSync(raw)) { console.error('✗ 客户端半未产出', raw); process.exit(1); }
const iife = readFileSync(raw, 'utf8');

// ③ 包装成官方要求的注册形式
const wrapped = `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: function (require) {\n${iife}\nreturn typeof __mdpClient !== "undefined" ? __mdpClient : undefined;\n}});\n`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(out, wrapped);
writeFileSync(join(root, 'dist/build-id.txt'), buildId + '\n');

// ④ 产物自检（违反即非 0 退出）
const problems = [];
if (!wrapped.startsWith('window.__ModuleLoader__.load({')) problems.push('缺少 __ModuleLoader__.load 注册包装');
if (!wrapped.includes(JSON.stringify(pkg.name))) problems.push(`注册 id 与包名不一致（应 ${pkg.name}）`);
if (!/factory:\s*function\s*\(require\)/.test(wrapped)) problems.push('缺少 factory(require) 形参');
if (/\bmodule\.exports\b/.test(wrapped)) problems.push('产物引用 module.exports（会导致 Web 界面打不开）');
if (/^\s*(import|export)\s/m.test(iife)) problems.push('IIFE 产物含 ESM 语法（应自包含）');
if (problems.length) { console.error('✗ 产物自检未通过：\n  - ' + problems.join('\n  - ')); process.exit(1); }
console.log(`✓ dist/index.js + dist/client.js（${(wrapped.length / 1024).toFixed(1)} KB，build ${buildId}）自检通过`);
