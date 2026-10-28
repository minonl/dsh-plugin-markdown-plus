#!/usr/bin/env bun
/**
 * 端到端验证：真实浏览器（本机 Edge）+ 真实模块 + 真实 Mermaid 引擎。
 *
 * 为什么不自动下浏览器：`playwright-core` + `channel: 'msedge'` 直接复用系统已装 Edge，
 * 无额外下载；**只启动/关闭自己创建的浏览器实例**，不影响用户正在使用的浏览器。
 *
 * 产物（默认被 .gitignore 忽略）：
 *   artifacts/e2e/<时间戳>/{mermaid.png,toc.png,toc-collapsed.png,report.json}
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 5183;
const BASE = `http://localhost:${PORT}`;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = `artifacts/e2e/${stamp}`;
mkdirSync(outDir, { recursive: true });

const results = [];
const consoleErrors = [];
const httpErrors = [];

/** 只把"真正的资源失败"当错误：favicon 之类的浏览器自动请求忽略。 */
function isIgnorable(url) {
  return /\/favicon\.ico$/.test(url);
}

function watch(page, tag) {
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[${tag}] ${msg.text()}`); });
  page.on('pageerror', (err) => consoleErrors.push(`[${tag}] ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400 && !isIgnorable(res.url())) httpErrors.push(`[${tag}] ${res.status()} ${res.url()}`);
  });
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${BASE}/dev/harness.html`);
      if (res.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('dev server 启动超时');
}

const server = spawn('bunx', ['vite', '--config', 'dev/vite.config.ts'], { cwd: process.cwd(), stdio: 'ignore' });
let browser = null;
let failed = false;

try {
  await waitForServer();
  const channel = process.env.E2E_CHANNEL ?? 'msedge';
  browser = await chromium.launch(channel === 'chromium' ? { headless: true } : { channel, headless: true });
  console.log(`  浏览器: ${channel}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(180_000);
  context.setDefaultNavigationTimeout(120_000);

  // ——— 场景 1：Mermaid ———
  {
    const page = await context.newPage();
    watch(page, 'mermaid');
    await page.goto(`${BASE}/dev/e2e/mermaid.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2eReady === true, null, { timeout: 15000 });
    // CI 上引擎资产由 dev 中间件**首次请求时现场构建**（~30s+），先预热，避免占用断言等待窗口
    await page.evaluate(async () => {
      const res = await fetch('/dsh-markdown-plus/runtime/mermaid.js');
      return (await res.text()).length;
    });
    // 等两张图出现（真实引擎需要时间）
    await page.waitForFunction(() => document.querySelectorAll('.mdp-figure svg').length >= 2, null, { timeout: 180000 });

    const stats = await page.evaluate(() => ({
      figures: document.querySelectorAll('.mdp-figure svg').length,
      notes: [...document.querySelectorAll('.mdp-note-label')].map((n) => n.textContent),
      states: [...document.querySelectorAll('main pre')].map((p) => p.getAttribute('data-mdp-state')),
      sizes: [...document.querySelectorAll('.mdp-figure svg')].map((s) => s.getAttribute('viewBox')),
      tsTouched: [...document.querySelectorAll('main pre code.language-ts')].some((c) => c.closest('pre')?.hasAttribute('data-mdp-state')),
    }));
    record('mermaid: 合法图渲染为 SVG', stats.figures === 2, `figures=${stats.figures} viewBox=${stats.sizes.join('|')}`);
    record('mermaid: 语法错误降级并可读', stats.notes.length === 1 && /Parse error/.test(stats.notes[0] ?? ''), `note=${stats.notes[0] ?? '(none)'}`);
    record('mermaid: 块状态正确', JSON.stringify(stats.states) === JSON.stringify(['rendered', 'degraded', null, 'rendered']), `states=${JSON.stringify(stats.states)}`);
    record('mermaid: 非图表块未被误伤', stats.tsTouched === false, `touched=${stats.tsTouched}`);
    await page.screenshot({ path: `${outDir}/mermaid.png`, fullPage: true });
    await page.close();
  }

  // ——— 场景 2：TOC ———
  {
    const page = await context.newPage();
    watch(page, 'toc');
    await page.goto(`${BASE}/dev/e2e/toc.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2eReady === true, null, { timeout: 15000 });
    await page.waitForSelector('[data-mdp-toc]', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-mdp-toc-item]').length === 9, null, { timeout: 15000 });

    const toc = await page.evaluate(() => ({
      count: document.querySelectorAll('[data-mdp-toc-item]').length,
      texts: [...document.querySelectorAll('[data-mdp-toc-item]')].map((i) => i.textContent),
      widths: [...document.querySelectorAll('[data-mdp-toc-item]')].map((i) => parseInt(i.style.width, 10)),
      panels: document.querySelectorAll('[data-mdp-toc]').length,
    }));
    record('toc: 刻度数量与层级宽度', toc.count === 9 && JSON.stringify(toc.widths) === JSON.stringify([18, 15, 12, 12, 15, 12, 12, 9, 15]), `widths=${JSON.stringify(toc.widths)}`);

    // 点击第 5 项 → 页面滚动 + 该项高亮
    const beforeY = await page.evaluate(() => window.scrollY);
    await page.click('[data-mdp-toc-item="4"]');
    await page.waitForTimeout(900);
    const afterClick = await page.evaluate(() => ({
      y: window.scrollY,
      active: [...document.querySelectorAll('[data-mdp-toc-item]')].findIndex((i) => i.getAttribute('aria-current') === 'true'),
    }));
    record('toc: 点击条目滚动并高亮', afterClick.y > beforeY && afterClick.active === 4, `y=${beforeY}→${afterClick.y} active=${afterClick.active}`);

    // 滚到底 → 高亮切换到靠后条目
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    const afterScroll = await page.evaluate(() => [...document.querySelectorAll('[data-mdp-toc-item]')].findIndex((i) => i.getAttribute('aria-current') === 'true'));
    record('toc: 滚动时高亮跟随（scroll spy）', afterScroll >= 6, `active=${afterScroll}`);
    await page.screenshot({ path: `${outDir}/toc.png`, fullPage: false });

    // 悬浮预览（与原生轨道同构的交互）
    await page.hover('[data-mdp-toc-item="2"]');
    await page.waitForTimeout(200);
    const preview = await page.evaluate(() => {
      const el = document.querySelector('.mdp-toc-preview');
      return { text: el?.textContent ?? null, visible: el?.classList.contains('mdp-toc-preview-visible') ?? false };
    });
    record('toc: 悬浮刻度显示标题预览', preview.visible && (preview.text ?? '').length > 0, `preview=${preview.text}`);
    await page.screenshot({ path: `${outDir}/toc-hover.png`, fullPage: false });

    // 幂等：同一内容重复刷新不产生重复面板/条目
    await page.evaluate(() => {
      const main = document.querySelector('main');
      main.innerHTML = main.innerHTML;
    });
    await page.waitForTimeout(700);
    const idem = await page.evaluate(() => ({
      panels: document.querySelectorAll('[data-mdp-toc]').length,
      items: document.querySelectorAll('[data-mdp-toc-item]').length,
    }));
    record('toc: 内容重渲染后仍幂等', idem.panels === 1 && idem.items === 9, `panels=${idem.panels} items=${idem.items}`);
    await page.close();
  }

  record('无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'none');
  record('无资源加载失败（忽略 favicon）', httpErrors.length === 0, httpErrors.slice(0, 5).join(' | ') || 'none');
} catch (error) {
  failed = true;
  record('e2e 执行', false, String(error).split('\n')[0]);
} finally {
  try { await browser?.close(); } catch { /* 忽略 */ }
  server.kill('SIGTERM');
}

const ok = results.every((r) => r.ok) && !failed;
writeFileSync(`${outDir}/report.json`, JSON.stringify({ stamp, ok, results, consoleErrors, httpErrors }, null, 2));
console.log(`\n${ok ? '✅ e2e 全部通过' : '❌ e2e 有失败'} → ${outDir}`);
process.exit(ok ? 0 : 1);
