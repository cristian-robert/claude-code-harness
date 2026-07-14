# Perfect Harness Engineering (PHE)

A harness-engineering framework for Claude Code: the context, enforcement, workflows, and knowledge wiring that make a coding agent work like an engineer on your team — your processes enforced, your standards applied.

"Perfect" here means **continuously re-fitted**, not maximal. Every rule traces to a real failure (the ratchet principle), every enforcement point is a tested hook, and the framework ships its own pruning mechanism (`/evolve`) because harnesses don't shrink as models improve — they move. Heavyweight prescriptive frameworks are the named failure mode this design avoids.

Synthesized from 17 sources across three research rounds: Anthropic's harness-design and context-engineering posts, the official Claude Code platform contracts, Cole Medin's harness-engineering repos (cloned in this folder), the author's own AIDF framework (v0.8) and its hard-won defect history, an Obsidian knowledge vault in production use, and the community state of the art (Ralph, 12-factor agents, superpowers, PRP). Full provenance: `docs/99-sources.md`.

## Layout

| Path | What it is |
|---|---|
| `docs/` | The distilled discipline: layer model, context engineering, enforcement vs guidance, loops, model policy, knowledge layer, sources |
| `template/` | **The payload** — copy into any project: `AGENTS.md` (canonical instructions), `CLAUDE.md` (a `@AGENTS.md` import shim for Claude Code), `.claude/` (hooks, rules, skills, agents, references, `statusline.mjs`), `plans/`, `reports/`. `.claude/state/` holds runtime snapshots — gitignored by `/harness-init` |
| `template/.claude/hooks/` | 6 tested Node hooks (guard, post-edit + hook self-test, stop-gate + verdict persistence, session-start, pre-compact, verdict-gate) + `smoke-test.mjs` |
| `template/.claude/agents/` | `scout` (read-only exploration), `code-reviewer` (project memory across reviews), `qa-evaluator` (drives the running app), `research-gatherer` (doc-grounded research for `/research`) |
| `template/.claude/skills/` | PIV+E pipeline + `/research` (doc-grounded) + `/handoff` (reset-with-artifact) + `/harness-init` (guided adoption) + agile layer (`/backlog`, `/sprint`, `/accept`) + 2 knowledge skills (`architecture-map`, `debugging-this-repo`) |
| `template/.claude/references/` | Load-on-cite: plan template, harness maintenance, `dispatch-protocol`, `output-contract`, `item-template`, `work-tracking`, `autonomous-mode` |
| `backlog/` + `sprints/` (convention) | Optional work tracking in adopted projects: one item per `backlog/<id>-<slug>.md`, `sprints/<n>.md` in scrum mode; the board is derived by grep, never committed (`docs/06-delivery-org.md`) |
| `loop/` | Ralph-style autonomous loop driver (`loop.mjs`) + prompt template + doctrine |
| `tools/` | `context-ledger.mjs` — measures the always-loaded context tax vs budget |
| `global/` | Opt-in `~/.claude` hardening layer (global guard hooks) — read its README before applying |

## The four layers

1. **Session context** (advisory, tiered — Tier 0 always → Tier 3 explicit, per `docs/01`): root `CLAUDE.md` ≤60 lines; unscoped rules; two model-invoked knowledge skills; `paths:`-scoped rules and subdirectory `CLAUDE.md` load lazily; references load only when cited.
2. **Enforcement** (deterministic): PreToolUse guard (secrets, recursive deletes, protected branches — survives `--dangerously-skip-permissions`); advisory post-edit lint that also self-tests hook edits; a Stop gate that blocks a turn from ending red and persists its verdict; a PreCompact snapshot so plan/gate state survives compaction; a SubagentStop verdict gate on the reviewer; `statusline.mjs` shows branch, context pressure, and gate state at a glance.
3. **Loops** (state on disk): PIV+E pipeline — `/plan-work → /implement → /validate → /review-branch → /evolve` — with the superpowers plugin as the execution discipline inside each stage, `/handoff` for mid-task resets, an autonomous loop for well-specified mechanical work, and an optional agile delivery layer (`/backlog`, `/sprint`, `/accept`) with roles as hats and a files-or-GitHub backend.
4. **Knowledge** (cross-project): pointer-block wiring to an Obsidian vault; doc-grounded work via `/research` (tool docs cached once at `wiki/stack/<tool>/`, reused everywhere, always current for your pinned version); `/evolve` harvests session lessons and prunes.

## Install

```bash
# in your project directory
npx perfect-harness-engineering init      # installs .claude/, CLAUDE.md, .mcp.json, .lsp.json (existing files backed up as .backup)
npx perfect-harness-engineering update    # refreshes the payload (existing files backed up as .backup)
```

`init` asks **which harness you use — Claude Code, Codex, or both** — and records it in `.claude/harness.json`, so `update` re-emits the right payload without asking again.

**One source, two harnesses.** Canonical content lives once, under `.claude/` and `AGENTS.md`. When Codex is a target, PHE *derives* the trees Codex reads:

| Generated | Derived from | Read by |
|---|---|---|
| `.agents/skills/` | `.claude/skills/` | Codex (`$plan-work`, `$implement`, …) |
| `.codex/agents/*.toml` | `.claude/agents/*.md` | Codex subagents |
| `.codex/config.toml` | (framework) | Codex |
| `CLAUDE.md` | `AGENTS.md` (imports it) | Claude Code (`/plan-work`, `/implement`, …) |

**These trees are committed**, exactly like `.claude/` — "generated" means *overwritten by `update`, never hand-edited*, not gitignored or temporary. A fresh `git clone` of a Codex project must work without running the CLI first.

**Never hand-edit `.agents/` or `.codex/`** — they are overwritten on every `init`/`update`. Edit `.claude/`.

Codex support in this release is **guidance-only**: instructions, skills, and subagents port; the enforcement hooks do not yet. They arrive next.

**Adopting over an existing harness?** Every existing file is saved as `<file>.backup` before the payload is written, and nothing you own that PHE doesn't ship (your own skills/agents/rules) is touched. Your team `.claude/settings.json` is then **deep-merged** automatically — your hooks and permissions are unioned with PHE's, not replaced (deterministic, re-runnable via `npx perfect-harness-engineering merge-settings`). `CLAUDE.md` and rules need judgment, so `/harness-init` reconciles them against the `.backup` (see below).

Then open Claude Code and run **`/harness-init`** — it detects your stack, reconciles any backed-up `CLAUDE.md`/rules, fills every `CLAUDE.md` placeholder, arms the stop gate, optionally scaffolds an Obsidian vault, and configures work tracking. Requires Node ≥18.

## Workflow

Day zero, once per project: `npx perfect-harness-engineering init`, then `/harness-init` inside Claude Code. After that there is no manual "prime" step — the `session-start.mjs` hook injects branch, dirty files, the latest plan, and gate state into every new session.

Per work item — the PIV+E loop. Every stage's state lives on disk, never in the chat window:

| Step | Command | Writes to disk |
|---|---|---|
| 0 · Track (optional) | `/backlog` new → refine → next | `backlog/<id>-<slug>.md` — the single home of acceptance criteria |
| 1 · Plan | `/plan-work backlog/<id>-<slug>.md` (or a brain dump) | `plans/<slug>-plan.md` |
| 2 · Reset | `/clear` | — (fresh session; the plan file IS the handoff) |
| 3 · Implement | `/implement plans/<slug>-plan.md` | code on a feature branch + `reports/<slug>-implementation-report.md` |
| 4 · Validate | `/validate` | GATE GREEN/RED verdict |
| 5 · Review | `/review-branch` | `reports/<slug>-review.md` — PASS / REQUEST_CHANGES |
| 6 · Accept | `/accept backlog/<id>-<slug>.md` | per-criterion evidence; the human verdict |
| 7 · Evolve | `/evolve` | rule/vault deltas — the harness learns |

Merge/PR happens after review PASS (superpowers `finishing-a-development-branch` owns the mechanics). Scrum mode adds `/sprint plan` / `/sprint close` around the loop. The superpowers plugin is the execution discipline inside each stage; skills degrade to inline fallbacks without it.

Anytime:

- `/handoff` — context running low mid-task: write the handoff artifact, `/clear`, resume fresh.
- `/research <tool>[@version]` — before coding against an external library; caches docs in the vault.
- `/models` — when session-start warns the model map is stale.
- A diff you can describe in one sentence skips the ceremony entirely (routing rule in `00-core.md`).

## Maintain

- Any hook change → `node .claude/hooks/smoke-test.mjs` (hooks that read argv instead of stdin fail *silently* — this test exists because that happened).
- Any rule/CLAUDE.md change → cite the incident it traces to; run the context ledger; adding may mean cutting.
- Any model upgrade → ablation pass: remove one harness component at a time and observe what's still load-bearing (`docs/03-loops.md`).
