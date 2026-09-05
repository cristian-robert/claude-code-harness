# Core discipline — always-on rules beyond AGENTS.md; each traces to a real failure

## Context economy

- Broad exploration (codebase survey, multi-file grep, research) → dispatch a subagent: it burns tokens in its own window and returns a summary. `/clear` between unrelated tasks — leftover context biases the next.
- Context past ~120k tokens (statusline `ctx`), or a stage boundary in a long plan → `/handoff` then `/clear` (beats compacting — that loses paths-scoped rules + subdir CLAUDE.md; windows run 200k–1M, so a percentage says nothing). Two failed corrections on one issue → stop patching; `/clear` and restart with a rewritten prompt. (traces to: 2026-09-05 — three 40–96 KB dumps read in one turn with no trigger to hand off)

## Task routing

| Situation | Route |
|---|---|
| Bug, test failure, unexpected behavior | superpowers:systematic-debugging BEFORE any fix; facts from `knowledge-base/runbook.md` (knowledge-protocol.md) |
| Feature or multi-file change | PIV pipeline — not ad-hoc edits |
| Diff describable in one sentence | Skip ceremony: edit, verify, done |

## Dispatch

Every brief has four elements — objective · output format + size cap · tool guidance · boundaries — and pins `tier:` + `effort:`. Full protocol: `.claude/references/dispatch-protocol.md`.

| Work | Dispatch |
|---|---|
| Locate/trace a SYMBOL (def, callers, module API) | `codebase-search` MCP (`where_is`/`find_references`/`outline`) if wired; LSP diagnostics for type errors — NOT grep (see `.claude/references/symbol-navigation.md`) |
| Locate files / text / patterns | built-in Explore (`scout` tier; skips CLAUDE.md) |
| Understand / synthesize | `scout` agent (`build` tier) |
| Architecture — where new code goes / what a change touches, before a new module/route/table/endpoint | `architect-agent` (`deep`); reads `knowledge-base/architecture.md`, /evolve RECORDs back |
| External tool/library docs & how-to | `/research <tool>[@version]` — cache-first at `wiki/stack/<tool>/`, then context7 + official docs (dispatches `research-gatherer`); never code an external API from memory |
| Implement | general-purpose — the plan's `tier:` |
| Code review | `code-reviewer` at the SIBLING tier (deep↔build) — never the model that wrote the code |
| Runtime check (drive the app) | `qa-evaluator` |

- Returns are summaries — ≤30 lines, paths not contents. File-mutating subagents run sequentially unless the plan marks disjoint `Wave:` groups; parallel is for read-only work.

## Answers to the user

- Never claim done/fixed/passing without the command and its real output. Applies to subagent reports too — re-run, don't relay.
- Concise by default: outcome first, each fact once, no narration of your own process or of paths not taken. Concise is NOT lossy — every decision, result, evidence line, and open question stays in; the walkthrough lives in the artifact (plan/report) and expands only when the user asks for detail. (traces to: 2026-09-05, a ~40-line fix recap — the operator asked for the short form)

## Memory

Auto-memory holds MACHINE-LOCAL facts only: env quirks, ports, local workarounds. Team knowledge (conventions, gotchas, commands) → AGENTS.md/rules via /evolve — never duplicate into memory. Task state lives in plans/ + reports/, never in memory.

## Harness changes

Touching hooks, rules, skills, or AGENTS.md/CLAUDE.md → read `.claude/references/harness-maintenance.md` FIRST. After any hook edit: `node .claude/hooks/smoke-test.mjs`.
