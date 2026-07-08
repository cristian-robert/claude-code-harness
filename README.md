# Perfect Harness Engineering (PHE)

A harness-engineering framework for Claude Code: the context, enforcement, workflows, and knowledge wiring that make a coding agent work like an engineer on your team — your processes enforced, your standards applied.

"Perfect" here means **continuously re-fitted**, not maximal. Every rule traces to a real failure (the ratchet principle), every enforcement point is a tested hook, and the framework ships its own pruning mechanism (`/evolve`) because harnesses don't shrink as models improve — they move. Heavyweight prescriptive frameworks are the named failure mode this design avoids.

Synthesized from 17 sources across three research rounds: Anthropic's harness-design and context-engineering posts, the official Claude Code platform contracts, Cole Medin's harness-engineering repos (cloned in this folder), the author's own AIDF framework (v0.8) and its hard-won defect history, an Obsidian knowledge vault in production use, and the community state of the art (Ralph, 12-factor agents, superpowers, PRP). Full provenance: `docs/99-sources.md`.

## Layout

| Path | What it is |
|---|---|
| `docs/` | The distilled discipline: layer model, context engineering, enforcement vs guidance, loops, model policy, knowledge layer, sources |
| `template/` | **The payload** — copy into any project: `CLAUDE.md`, `.claude/` (hooks, rules, skills, agents, references, `statusline.mjs`), `plans/`, `reports/`. `.claude/state/` holds runtime snapshots — gitignored by `/harness-init` |
| `template/.claude/hooks/` | 6 tested Node hooks (guard, post-edit + hook self-test, stop-gate + verdict persistence, session-start, pre-compact, verdict-gate) + `smoke-test.mjs` |
| `template/.claude/agents/` | `scout` (read-only exploration), `code-reviewer` (project memory across reviews), `qa-evaluator` (drives the running app) |
| `template/.claude/skills/` | PIV+E pipeline + `/handoff` (reset-with-artifact) + `/harness-init` (guided adoption) + agile layer (`/backlog`, `/sprint`, `/accept`) + 2 knowledge skills (`architecture-map`, `debugging-this-repo`) |
| `template/.claude/references/` | Load-on-cite: plan template, harness maintenance, `dispatch-protocol`, `output-contract`, `item-template`, `work-tracking`, `autonomous-mode` |
| `backlog/` + `sprints/` (convention) | Optional work tracking in adopted projects: one item per `backlog/<id>-<slug>.md`, `sprints/<n>.md` in scrum mode; the board is derived by grep, never committed (`docs/06-delivery-org.md`) |
| `loop/` | Ralph-style autonomous loop driver (`loop.mjs`) + prompt template + doctrine |
| `tools/` | `context-ledger.mjs` — measures the always-loaded context tax vs budget |
| `global/` | Opt-in `~/.claude` hardening layer (global guard hooks) — read its README before applying |

## The four layers

1. **Session context** (advisory, tiered — Tier 0 always → Tier 3 explicit, per `docs/01`): root `CLAUDE.md` ≤60 lines; unscoped rules; two model-invoked knowledge skills; `paths:`-scoped rules and subdirectory `CLAUDE.md` load lazily; references load only when cited.
2. **Enforcement** (deterministic): PreToolUse guard (secrets, recursive deletes, protected branches — survives `--dangerously-skip-permissions`); advisory post-edit lint that also self-tests hook edits; a Stop gate that blocks a turn from ending red and persists its verdict; a PreCompact snapshot so plan/gate state survives compaction; a SubagentStop verdict gate on the reviewer; `statusline.mjs` shows branch, context pressure, and gate state at a glance.
3. **Loops** (state on disk): PIV+E pipeline — `/plan → /implement → /validate → /review → /evolve` — with the superpowers plugin as the execution discipline inside each stage, `/handoff` for mid-task resets, an autonomous loop for well-specified mechanical work, and an optional agile delivery layer (`/backlog`, `/sprint`, `/accept`) with roles as hats and a files-or-GitHub backend.
4. **Knowledge** (cross-project): pointer-block wiring to an Obsidian vault; doc-grounded work via `/research` (tool docs cached once at `wiki/stack/<tool>/`, reused everywhere, always current for your pinned version); `/evolve` harvests session lessons and prunes.

## Install

```bash
# in your project directory
npx claude-code-harness init      # installs .claude/, CLAUDE.md, .mcp.json, .lsp.json (existing files backed up)
npx claude-code-harness update    # updates the payload, preserving your customizations (three-way merge)
```

Then open Claude Code and run **`/harness-init`** — it detects your stack, fills every `CLAUDE.md` placeholder, arms the stop gate, optionally scaffolds an Obsidian vault, and configures work tracking. Requires Node ≥18.

Then work through the pipeline: `/plan` a ticket, `/clear`, `/implement` the plan file, `/validate`, `/review`, `/evolve`. The superpowers plugin is the execution discipline inside each stage (skills degrade to inline fallbacks without it).

## Maintain

- Any hook change → `node .claude/hooks/smoke-test.mjs` (hooks that read argv instead of stdin fail *silently* — this test exists because that happened).
- Any rule/CLAUDE.md change → cite the incident it traces to; run the context ledger; adding may mean cutting.
- Any model upgrade → ablation pass: remove one harness component at a time and observe what's still load-bearing (`docs/03-loops.md`).
