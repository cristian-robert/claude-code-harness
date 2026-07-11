# <Project Name>

<One sentence: what this product is and who uses it. Fresh copy? Run `/harness-init` — it interviews the repo, fills every <placeholder>, arms the gate, and configures work tracking. A placeholder in a live AGENTS.md is a bug.>

<!-- Vault users: paste your vault's pointer block here (its system/pointer-block.md; /harness-init can scaffold one), then delete this comment. -->

## Commands

| Task | Command |
|---|---|
| Dev server | `<cmd>` |
| Unit tests | `<cmd>` |
| Lint | `<cmd>` |
| Typecheck | `<cmd>` |
| Full gate | `/validate` runs all of the above and reports GATE GREEN/RED |

## Pipeline (PIV+E)

| Stage | Command | Writes to disk |
|---|---|---|
| Backlog | `/backlog` new·refine·board·next | `backlog/<id>-<slug>.md` — the single home of acceptance criteria |
| Plan | `/plan backlog/<id>-<slug>.md` (or brain dump) | `plans/<slug>-plan.md` |
| Implement | `/implement plans/<slug>-plan.md` | code + `reports/<slug>-implementation-report.md` |
| Validate | `/validate` | verdict (GATE GREEN/RED) |
| Review | `/review` | `reports/<slug>-review.md` |
| Accept | `/accept backlog/<id>-<slug>.md` | per-criterion evidence → item `accepted` |
| Evolve | `/evolve` | rule/vault updates (ask-first); scrum: this is the retro |
| Sprint (scrum mode) | `/sprint` plan·close | `sprints/<n>.md` |

**Roles are hats, not personas** — the user is **PO** (backlog priorities) and **Stakeholder** (`/accept` verdict); BA/PM draft, refine, and PROPOSE backlog order (the PO decides priority and order), the Architect hat designs in `/plan`, Dev owns `/implement`, QA owns `/validate` + runtime checks, the reviewer agent brings fresh eyes (with a security lens on sensitive diffs — `/review` invokes the global `security-audit` skill when available, else the reviewer's security checklist). Full role + ceremony map (standup, refinement, sprint planning, review/demo, retro, DoD → command): `.claude/references/delivery-org.md`. Tracking backend/method: `.claude/harness.json` → `.claude/references/work-tracking.md`.

Plan and Implement run in **separate sessions** (`/clear` between): a fresh context executing a written plan beats a long session's accumulated bias. Plans must pass the no-prior-knowledge test — executable by an agent that never saw this conversation.

**Execution discipline inside every stage: the superpowers plugin.** The pipeline commands invoke its skills — brainstorming → writing-plans → using-git-worktrees → subagent-driven-development → test-driven-development → verification-before-completion → requesting-code-review → /accept (delivery layer, when item-linked) → /evolve → finishing-a-development-branch. Bugs start with superpowers:systematic-debugging, never with a fix. On conflict, THIS repo's rules win.

## Hard rules (each names its enforcer — do not work around them)

- **Secrets**: never read/write `.env*` or key files — enforced by `.claude/hooks/guard.mjs` + permission denies. Use `.env.example`; the user manages real values.
- **No recursive deletes** (`rm -rf`, `find -delete`, `git clean -d`) — enforced by `guard.mjs`. Delete specific files explicitly.
- **Never commit/push code on `main`/`master`** — enforced by `guard.mjs`. Branch first: `{type}/{description}`. Sole exception it permits: `track(<id>)` commits staging only `backlog/`/`sprints/` (item state lives on the tracking root).
- **A turn cannot end with the stop gate red** — enforced by `.claude/hooks/stop-gate.mjs` running the checks in `.claude/harness.json`.
- **Done = evidence**: show the command run and its real output. "Looks done" is not a state.

## Context tiers (don't preload — lazy context loads itself)

- Path-scoped rules and subdirectory `AGENTS.md` auto-load on matching file reads (native on Claude Code; injected by a hook on Codex).
- Knowledge skills: consult **architecture-map** BEFORE placing new code; **debugging-this-repo** BEFORE diagnosing any bug or test failure.
- Touching the harness itself (hooks/rules/skills)? Read `.claude/references/harness-maintenance.md` FIRST.
- **Navigate by symbol, not grep**: the `codebase-search` MCP (`where_is`/`find_references`/`outline`, Python — if wired) + LSP diagnostics (`.lsp.json`) come before text search — `.claude/references/symbol-navigation.md`.
- **Doc-grounded work**: building against an external tool/library? Consult its docs for your pinned version — `wiki/stack/<tool>/` first, else `/research` (context7 + official docs). Never code an API from memory.

## Compact instructions

When compacting, always preserve: the active plan path (`plans/*.md`), the last gate verdict, the current branch + dirty-file list, and unanswered questions to the user. After compaction, disk artifacts (`plans/`, `reports/`) are ground truth over the summary — re-read them.

## Conventions (only what code can't tell you)

- <Rule Claude got wrong once — the ratchet: every line here traces to a real failure.>
- <Non-obvious gotcha, e.g. "route order matters in <file>: static before dynamic".>
