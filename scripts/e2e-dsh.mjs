#!/usr/bin/env bun
/**
 * 真实 DSH 集成 e2e：构建 tarball → 临时 profile 安装 → 启动真实 `dsh web` → 浏览器验证。
 *
 * 与 `scripts/e2e.mjs` 的分工：那个跑 vite dev harness（模块源码级）；本脚本跑**真实宿主**，
 * 覆盖只会在真实集成里走到的链路——插件客户端半侧被 DSH 当作 Cordis 插件挂载
 * （缺少 `name` / `apply` 时浏览器会报 `invalid plugin`，整个插件加载失败）。
 *
 * 安全纪律：只关闭自己创建的浏览器实例、只按 PID 关闭自己拉起的 dsh，绝不 pkill。
 *
 * 环境变量：
 *   MDP_TGZ=<path>      复用已有 tarball（否则执行 `bun run build && npm pack`）
 *   MDP_DSH_PORT=<port> 覆盖 dsh web 端口（默认 3080；被占用会直接失败，脚本不会复用别人的实例）
 *   E2E_CHANNEL=chromium CI 用 Playwright 自带 chromium（默认复用系统已装 Edge）
 *
 * 产物（.gitignore 忽略）：artifacts/e2e-dsh/<时间戳>/{app.png,toc.png,mermaid.png,report.json}
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(root, 'artifacts/e2e-dsh', stamp);
mkdirSync(outDir, { recursive: true });

const PORT = Number(process.env.MDP_DSH_PORT ?? 3080);
const portExplicit = process.env.MDP_DSH_PORT !== undefined && process.env.MDP_DSH_PORT !== '';
const profile = `mdp-e2e-${Math.random().toString(36).slice(2, 8)}`;
const profileDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', profile);
const channel = process.env.E2E_CHANNEL ?? 'msedge';

const results = [];
const consoleErrors = [];
const pageErrors = [];
let bootLog = '';

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** 同步执行短命令；失败时把 stderr 尾部带进错误信息（便于直接定位）。 */
function sh(cmd, args, options = {}) {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  } catch (error) {
    const stderr = String(error.stderr ?? '').trim().split('\n').slice(-8).join('\n');
    throw new Error(`${cmd} ${args.join(' ')} 失败：${stderr || error.message}`);
  }
}

/** tarball：优先 MDP_TGZ，否则现场构建 + 打包。 */
function prepareTarball() {
  const given = process.env.MDP_TGZ;
  if (given !== undefined && given !== '') {
    const abs = resolve(root, given);
    if (!existsSync(abs)) throw new Error(`MDP_TGZ 指向的 tarball 不存在：${abs}`);
    return abs;
  }
  console.log('· 构建（bun run build）…');
  sh('bun', ['run', 'build'], { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log('· 打包（npm pack）…');
  const packed = sh('npm', ['pack', '--silent']);
  const name = packed.split('\n').map((line) => line.trim()).filter((line) => line.endsWith('.tgz')).pop();
  if (name === undefined) throw new Error(`npm pack 未产出 tarball：${packed.trim()}`);
  return resolve(root, name);
}

function portInUse(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (busy) => {
      socket.destroy();
      done(busy);
    };
    socket.setTimeout(800);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** 从启动日志里解析 `dsh web: http://…/?token=…`。 */
function urlOf(text) {
  return /dsh web:\s+(https?:\/\/\S+)/.exec(text)?.[1] ?? null;
}

async function waitForUrl(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = urlOf(bootLog);
    if (url !== null) return url;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`dsh 启动即退出：${bootLog.trim().split('\n').slice(-5).join(' | ')}`);
    }
    await sleep(500);
  }
  throw new Error(`等待 dsh 打印 Web URL 超时：${bootLog.trim().split('\n').slice(-5).join(' | ') || '(无输出)'}`);
}

/** 轮询 HTTP 直到服务就绪（带 token 的入口会 303，均视为就绪）。 */
async function waitForHttp(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      /* 还没起来 */
    }
    await sleep(400);
  }
  throw new Error(`dsh web 在 ${timeoutMs}ms 内未就绪`);
}

/** 只关自己拉起的 dsh：先 SIGTERM，超时再 SIGKILL。 */
async function stopDsh(child) {
  if (child === null || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((done) => child.once('exit', () => done(true)));
  child.kill('SIGTERM');
  const stopped = await Promise.race([exited, sleep(6000).then(() => false)]);
  if (!stopped) child.kill('SIGKILL');
}

const redact = (text) => String(text).replace(/token=[A-Za-z0-9._~-]+/g, 'token=***');

let browser = null;
let context = null;
let page = null;
let child = null;
let tarball = null;
let profileCreated = false;
let failed = false;

try {
  // ——— 0. 前置检查：端口必须空闲（绝不碰别人的实例）———
  if (await portInUse(PORT)) {
    throw new Error(`端口 ${PORT} 已被占用（脚本不会复用/关闭别人的实例；可设 MDP_DSH_PORT=<空闲端口>）`);
  }

  tarball = prepareTarball();
  console.log(`· tarball: ${relative(root, tarball)}`);

  // ——— 1. 临时 profile + 安装插件 ———
  console.log(`· 创建 profile: ${profile}`);
  sh('dsh', ['--profile', profile, '--from-default-profile', 'web', '--dump-config']);
  profileCreated = true;
  sh('dsh', ['plugin', '--profile', profile, 'add', tarball]);

  // ——— 2. 启动真实 dsh web ———
  const args = ['--profile', profile, '--no-open'];
  if (portExplicit) args.push('--port', String(PORT));
  console.log(`· 启动 dsh（端口 ${PORT}）…`);
  child = spawn('dsh', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const collect = (chunk) => {
    bootLog = (bootLog + String(chunk)).slice(-200_000);
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const url = await waitForUrl(child, 90000);
  await waitForHttp(url);
  console.log(`· Web 就绪：${redact(url)}`);

  // ——— 3. 浏览器：真实宿主 ———
  browser = await chromium.launch(channel === 'chromium' ? { headless: true } : { channel, headless: true });
  console.log(`· 浏览器: ${channel}`);
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  // 应用外壳就绪：Root 有内容
  await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, null, { timeout: 30000 });
  await page.screenshot({ path: join(outDir, 'app.png'), fullPage: false });

  // ——— 断言 b：客户端半侧真的执行了（样式注入是 boot() 的副作用）———
  let styles = false;
  try {
    await page.waitForFunction(() => document.getElementById('mdp/styles') !== null, null, { timeout: 30000 });
    styles = true;
  } catch {
    /* 由下面的 record 记录失败 */
  }
  record('客户端半侧已执行（#mdp/styles 存在）', styles, styles ? '#mdp/styles' : '30s 内未出现');

  // ——— 断言 a：回归门 —— 不能出现 invalid plugin 报错 ———
  await page.waitForTimeout(500);
  const invalidPlugin = [...consoleErrors, ...pageErrors].filter((text) => /invalid plugin/i.test(text));
  record('插件挂载无 invalid plugin 报错', invalidPlugin.length === 0, invalidPlugin[0] ?? 'none');

  // ——— 断言 c：文档级模块（TOC）在真实应用里工作 ———
  await page.evaluate(() => {
    const fixture = document.createElement('main');
    fixture.id = 'mdp-fixture';
    fixture.innerHTML = '<h1>A</h1><h2>B</h2><h3>C</h3>';
    document.body.prepend(fixture);
  });
  await page.waitForTimeout(1500);
  let tocReady = true;
  try {
    await page.waitForFunction(
      () => document.querySelector('[data-mdp-toc]') !== null && document.querySelectorAll('[data-mdp-toc-item]').length >= 3,
      null,
      { timeout: 10000 },
    );
  } catch {
    tocReady = false;
  }
  const toc = await page.evaluate(() => ({
    panels: document.querySelectorAll('[data-mdp-toc]').length,
    count: document.querySelectorAll('[data-mdp-toc-item]').length,
    texts: [...document.querySelectorAll('[data-mdp-toc-item]')].map((item) => item.textContent),
  }));
  record('toc：真实宿主里生成大纲且条目 ≥ 3', tocReady && toc.panels === 1 && toc.count >= 3, `panels=${toc.panels} count=${toc.count} texts=${JSON.stringify(toc.texts)}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(outDir, 'toc.png'), fullPage: false });

  // ——— 断言 d：块级模块（Mermaid）真实渲染 + 降级 ———
  await page.evaluate(() => {
    const wrap = document.createElement('div');
    wrap.id = 'mdp-mermaid-fixture';
    const pre = document.createElement('pre');
    pre.id = 'mdp-mermaid-ok';
    const code = document.createElement('code');
    code.className = 'language-mermaid';
    code.textContent = 'flowchart TD\n  A-->B';
    pre.append(code);
    wrap.append(pre);
    document.body.append(wrap);
  });
  let mermaidOk = true;
  try {
    await page.waitForFunction(() => document.querySelector('#mdp-mermaid-fixture .mdp-figure svg') !== null, null, { timeout: 30000 });
  } catch {
    mermaidOk = false;
  }
  const mermaid = await page.evaluate(() => {
    const svg = document.querySelector('#mdp-mermaid-fixture .mdp-figure svg');
    return {
      svg: svg !== null,
      viewBox: svg?.getAttribute('viewBox') ?? null,
      state: document.getElementById('mdp-mermaid-ok')?.getAttribute('data-mdp-state') ?? null,
    };
  });
  record('mermaid：合法图渲染为 SVG', mermaidOk && mermaid.svg && mermaid.state === 'rendered', `viewBox=${mermaid.viewBox} state=${mermaid.state}`);

  // 坏语法：注入后等降级提示（保留源码 + 可读原因）
  await page.evaluate(() => {
    const pre = document.createElement('pre');
    pre.id = 'mdp-mermaid-bad';
    const code = document.createElement('code');
    code.className = 'language-mermaid';
    code.textContent = 'flowchart TD\n  A-->';
    pre.append(code);
    document.getElementById('mdp-mermaid-fixture')?.append(pre);
  });
  let degradedOk = true;
  try {
    await page.waitForFunction(
      () => /Parse error/.test(document.querySelector('#mdp-mermaid-fixture .mdp-note-label')?.textContent ?? ''),
      null,
      { timeout: 30000 },
    );
  } catch {
    degradedOk = false;
  }
  const degraded = await page.evaluate(() => {
    const block = document.getElementById('mdp-mermaid-bad');
    return {
      note: block?.nextElementSibling?.querySelector('.mdp-note-label')?.textContent ?? '',
      state: block?.getAttribute('data-mdp-state') ?? null,
      sourceVisible: block !== null && getComputedStyle(block).display !== 'none',
      sourceText: block?.querySelector('code')?.textContent ?? '',
    };
  });
  record(
    'mermaid：坏语法降级且源码可见',
    degradedOk && /Parse error/.test(degraded.note) && degraded.state === 'degraded' && degraded.sourceVisible && degraded.sourceText.includes('A-->'),
    `note=${degraded.note} state=${degraded.state} sourceVisible=${degraded.sourceVisible}`,
  );

  await page.locator('#mdp-mermaid-fixture').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, 'mermaid.png'), fullPage: false });
} catch (error) {
  failed = true;
  record('e2e 执行', false, String(error).split('\n')[0]);
  try {
    await page?.screenshot({ path: join(outDir, 'failure.png'), fullPage: false });
  } catch {
    /* 截图失败不影响结论 */
  }
} finally {
  try {
    await browser?.close();
  } catch {
    /* 忽略 */
  }
  await stopDsh(child);
  if (profileCreated) rmSync(profileDir, { recursive: true, force: true });
}

const ok = results.length > 0 && results.every((item) => item.ok) && !failed;
writeFileSync(
  join(outDir, 'report.json'),
  JSON.stringify(
    {
      stamp,
      ok,
      tarball: tarball === null ? null : relative(root, tarball),
      profile,
      port: PORT,
      channel,
      results,
      consoleErrors: consoleErrors.map(redact),
      pageErrors: pageErrors.map(redact),
      dshLog: redact(bootLog).slice(-20000),
    },
    null,
    2,
  ),
);
console.log(`\n${ok ? '✅ e2e-dsh 全部通过' : '❌ e2e-dsh 有失败'} → ${relative(root, outDir)}`);
process.exit(ok ? 0 : 1);
