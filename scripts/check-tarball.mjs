#!/usr/bin/env node
/**
 * 发包内容闸门（发布前跑，本地 `bun run check:tarball` 同款）。
 *
 * 断言 npm 会打进 tarball 的东西刚好是「能装、能用」的那一份：
 *   ① 必需文件在位（宿主半侧、客户端半侧、惰性引擎资产、bundle patch、文档、LICENSE）
 *   ② 不夹带源码 / 测试 / 构建中间目录（.build/）/ CI 配置 / 历史 tarball
 *   ③ 体积在契约区间内（客户端保持轻量，引擎资产确实内联了）
 *
 * 依据：package.json 的 `files` 白名单 + `dsh.bundle.patch` 指向的 cordis.patch.yml（缺它插件装了也不生效）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

let report;
try {
  report = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }));
} catch (error) {
  console.error('✗ npm pack --dry-run 失败：', error.stderr?.toString() ?? error.message);
  process.exit(1);
}

const [info] = report;
const files = info.files.map((file) => file.path);
const sizeOf = (path) => info.files.find((file) => file.path === path)?.size ?? 0;
const total = files.reduce((sum, path) => sum + sizeOf(path), 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const problems = [];

const required = [
  'package.json',
  'dist/index.js',
  'dist/client.js',
  'dist/runtime/mermaid.js',
  pkg.dsh?.bundle?.patch?.replace(/^\.\//, '') ?? 'cordis.patch.yml',
  ...(pkg.files ?? []).filter((entry) => /\.(md|txt)$/i.test(entry)),
];
for (const path of required) {
  if (!files.includes(path)) problems.push(`缺少必需文件：${path}（装上也是坏的）`);
}

const forbidden = /^(src|test|scripts|docs|dev|\.build|\.github|node_modules)\//;
const leaked = files.filter((path) => forbidden.test(path) || path.endsWith('.tgz'));
if (leaked.length > 0) problems.push(`夹带了非发布物：${leaked.join(', ')}`);

if (sizeOf('dist/client.js') === 0) problems.push('dist/client.js 为空');
if (sizeOf('dist/client.js') > 100_000) problems.push(`dist/client.js 过大（${kb(sizeOf('dist/client.js'))}）——应保持轻量并惰性加载引擎`);
if (sizeOf('dist/runtime/mermaid.js') < 200_000) problems.push(`dist/runtime/mermaid.js 过小（${kb(sizeOf('dist/runtime/mermaid.js'))}）——引擎可能没内联`);
if (!files.some((path) => path.startsWith('dist/runtime/'))) problems.push('缺少 dist/runtime/ 惰性资产目录');

if (problems.length > 0) {
  console.error(`✗ tarball 自检未通过：\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

console.log(
  `✓ tarball ${info.name}@${info.version}：${files.length} 个文件 / ${kb(total)}` +
    `（client ${kb(sizeOf('dist/client.js'))} · runtime ${kb(sizeOf('dist/runtime/mermaid.js'))}）`,
);
