<!-- TEMPLATE: adapt paths and rules to your stack during setup; every rule you keep must trace to a real failure. Delete rules that merely restate defaults. -->
<!-- Copy this file to <frontend-dir>/AGENTS.md — that is the content, read directly by Codex. For Claude Code, also copy frontend.CLAUDE.md alongside it as <frontend-dir>/CLAUDE.md — a one-line `@AGENTS.md` shim (Claude Code reads CLAUDE.md, not AGENTS.md). Lazy-loads only when a file under this directory is read — zero context cost otherwise. The split: .claude/rules/*.md with paths: = file-TYPE guidance across the whole tree (any *.tsx anywhere); this file = guidance about a PLACE (this dir's layout, commands, local traps). Never duplicate type rules here. -->
# <frontend-dir>

| Dir | Responsibility |
|---|---|
| `app/` | Routes + layouts; server components own data fetching |
| `components/ui/` | Generated primitives (shadcn) — regenerate via CLI, never hand-edit |
| `components/` | Product components composed from primitives |
| `lib/` | Client-safe utilities only; no server-only imports |
| `styles/` | Tokens + globals — the only place raw color values may live |

## Local commands

| Task | Command |
|---|---|
| Dev server | `<cmd>` |
| Component preview / Storybook | `<cmd>` |
| Visual + E2E tests | `<cmd>` |

## Gotchas (each traces to a real failure)

- `components/ui/*` is CLI-regenerated — hand edits were silently overwritten.
- `lib/analytics.ts` must stay client-safe: importing it from a server component broke the build.
- Route groups `(marketing)` vs `(app)` carry different layouts — a page in the wrong group lost auth.
