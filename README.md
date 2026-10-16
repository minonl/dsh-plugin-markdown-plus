# Markdown+ for DeepSeek Harness

Enhanced Markdown preview for **DeepSeek Harness** — Mermaid diagram rendering with a graceful, always-visible fallback.

> Status: **scaffold** (project skeleton). Feature code lands next.

## What it does

- Renders Mermaid diagrams inside Markdown previews
- Degrades gracefully: if rendering fails, the diagram source stays readable (never a blank block)

## Install

```bash
dsh plugin --profile <profile> add @minonl/dsh-plugin-markdown-plus
# then select the bundle in the profile's `dsh.profile.bundles`
```

## Design

- [Design document](docs/design.md) — plugin model, contracts (C1–C6), boundaries (E1–E10), release gates (G1–G4)
- [Agent guidance](AGENTS.md)

## Development

```bash
bun install
bun run build      # vite lib build → dist/index.js + dist/client.js
bun run typecheck
bun test
```

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | host half (registers the capability in the harness tree) |
| `src/client.ts` | client half (browser-side preview enhancement) |
| `cordis.patch.yml` | bundle patch layer (declared via `dsh.bundle.patch`) |
| `docs/` | design docs |
| `test/` | automated tests |

## License

MIT
