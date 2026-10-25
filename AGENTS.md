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
