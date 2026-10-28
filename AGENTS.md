# AGENTS.md — dsh-plugin-markdown-plus

Agent guidance for this repository. Keep it concise and actionable.

## Scope

A **DeepSeek Harness (DSH) plugin**. Two halves:

- `src/index.ts` — host half, bundled to `dist/index.js`
- `src/client.ts` — client half, bundled to `dist/client.js`

`cordis.patch.yml` is the **bundle patch layer**; it is what makes the plugin *selectable and effective*
(a dependency without a bundle patch is reported as `not-bundle` and does not take effect).

## Commands

```bash
bun install          # dependencies (bun + vite)
bun run build        # vite lib build (two entries)
bun run typecheck    # tsc --noEmit
bun test             # automated tests — must pass before every push
```

## Rules

1. **Tests before push**: `bun test` + `bun run typecheck` + `bun run build` must all pass.
2. **Small commits**, imperative subjects.
3. **No secrets, no internal identifiers, no internal paths** in code, docs, tests, or CI config —
   this repository is public.
4. **Docs**: design docs live in `docs/`; update them in the same change as behaviour.
5. **Publishing** goes through the `publish` workflow only: experimental builds come from a manual
   `workflow_dispatch` (`0.0.0-experimental.<run_number>`, dist-tag `experimental`), releases from a `v*`
   tag that matches `package.json`. The maintainer reviews before any public release — see `docs/release.md`.

## 分支与合并纪律（强制）

**main 只保留"已验收"的内容。任何未验收的功能不得直接出现在 main 上。**

| 规则 | 说明 |
|---|---|
| 功能开发 | 一律在 `feat/<主题>` 分支；禁止直接 `git push origin main` |
| 进入 main 的唯一通道 | Pull Request（PR），且 CI 必须绿 |
| 验收 | 每个 PR 的说明必须列出**验收方式**（本地命令 / e2e 截图 / 手工步骤），由维护者确认后才合并 |
| 合并方式 | Squash merge（保持 main 线性、一功能一提交） |
| 发布 | 合并后打 tag `v<version>`，由 CI（Trusted Publishing）发布；**tag 只在 main 上打** |
| 紧急修复 | 同样走 `fix/<主题>` + PR，不允许"临时直推" |
| 回滚 | 用 `git revert` 生成新提交，不 force-push main（自动备份见 `backup/*` tag） |

### 目录约定

```
feat/*   功能分支（TOC、搜索、callout…）
fix/*    修复分支
backup/* 历史备份 tag（如 backup/main-2026-10-19），只读参考
```

### 每次发版

```bash
# 1) 在功能分支上改版本并提交
npm version <version> --no-git-tag-version
# 2) PR → 合并进 main
# 3) 在 main 上打 tag 并推送（CI 自动发布）
git tag v<version> && git push origin v<version>
```

## 客户端契约硬约束（实测踩坑，2026-10-27）

1. **客户端半侧必须是 Cordis 插件**：`src/client.ts` 必须导出 `name` + `apply(ctx)`。
   只导出普通对象/函数集合会报
   `invalid plugin, expect function or object with an "apply" method, received object`，
   整个插件**加载失败**（宿主半侧正常也没用）。
2. **不要依赖"模块级自启动"**：副作用放在 `apply()` 里；模块级副作用会让"能跑但报错"的假象掩盖契约问题。
3. **同版本重装会被 pnpm 跳过**：`dsh plugin add <tgz>` 在版本号不变时输出
   `Lockfile is up to date, resolution step is skipped`，实际仍是旧产物。
   验证新产物必须 `dsh plugin remove <pkg>` 后重新 `add`（或改版本号）。
   判断是否真的更新：`grep -c 'apply:' node_modules/<pkg>/dist/client.js` + `dist/build-id.txt`。
4. **产物形态**：客户端必须是 IIFE 并包装为 `window.__ModuleLoader__.load({id, factory})`；
   宿主半侧必须注册 `ctx.webServer` 路由（否则客户端半侧永不被请求）。构建脚本已内置自检。
