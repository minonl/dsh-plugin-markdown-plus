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
5. **Publishing** happens from a tagged release; the maintainer reviews before any public release.

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
