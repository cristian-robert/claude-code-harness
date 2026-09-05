---
name: architecture-map
description: "Codebase map: directory ownership, entry points, module boundaries, where new code belongs. Consult BEFORE creating files, adding routes/modules, or deciding where anything lives."
user-invocable: false
allowed-tools: Bash(find *)
---

# Architecture map — Perfect Harness Engineering

Golden rule: placement is a decision, not a guess — new code lands where this map says, or the map
gets updated first (via `/evolve`).

## Live tree (re-rendered at every invocation — never stale)

!`find . -maxdepth 2 -type d -not -path '*/node_modules*' -not -path '*/.git*' 2>/dev/null | head -40 || echo "(dir scan failed)"`

## What this repo is

A framework repo, not an application: `template/` is the shippable payload, `cli/` delivers and
migrates it, `docs/` is the doctrine. "Where does this go" is nearly always "which layer owns it".

## Four layers

| Layer | What | Owner path |
|---|---|---|
| 1 Context | session memory, attention-budgeted | `template/CLAUDE.md`, `template/.claude/rules/` |
| 2 Enforcement | deterministic hooks + the gate runner | `template/.claude/hooks/`, `template/.claude/tooling/run-check.mjs` |
| 3 Loops | PIV+E pipeline, delivery org, autonomous loop | `template/.claude/skills/`, `loop/` |
| 4 Knowledge | cross-project store + its contract | the vault, `template/.claude/references/knowledge-protocol.md` |

Before a structural change read the source of that model: the module table, data flow and
integration points in `~/Dev/The Vault/projects/perfectHarnessEngineering/architecture.md`, plus the
ADRs in its `decisions.md` (start at that folder's `_index.md`). Never copy them here — a copy forks.

## Owner table (the short form is AGENTS.md "Structure map")

| Area | Owner |
|---|---|
| Shippable project harness | `template/` |
| Root copy of the harness (GENERATED) | `.claude/` |
| Installer, migrations, config readers | `cli/` |
| Framework-only measurement and gates | `tools/` |
| Autonomous loop driver | `loop/` |
| Opt-in `~/.claude` hardening | `global/` |
| Discipline docs | `docs/00…06, 99` |
| Pipeline artifacts | `plans/`, `reports/` |

## Where new code goes

- **Hook logic** → `template/.claude/hooks/`, plus a fixture in `smoke-test.mjs` in the same
  commit. No fixture, no behaviour.
- **Adopter-side tooling** (ships in the payload, runs in an adopter's repo) →
  `template/.claude/tooling/`, with a runner at `cli/*.test.js` wired into `npm test`.
- **Framework-only tooling** (never shipped — check `package.json` `files`) → `tools/`.
- **Install, update, or migration behaviour** → `cli/`: `migrations.js` for renames,
  `harness-config.js` for retired keys. Prose can never carry a migration.
- **Doctrine and rationale** → `docs/`. Rules cite it; it never enforces.
- **A rule, skill, or reference** → `template/.claude/{rules,skills,references}/` under its budget
  (rule ≤45 lines, skill body ≤100, context/knowledge skill ≤70, reference ≤160, template CLAUDE.md
  ≤60); over budget means cutting. Measure: `node tools/context-ledger.mjs template`.

## Boundaries

- Root `.claude/` is GENERATED from `template/.claude/` by `node tools/self-harness.mjs`. Edit the
  template, then sync; `--check` is a stop-gate command, so drift ends the turn red. Root-owned
  exceptions: `harness.json`, `settings.local.json`, `state/`, `agent-memory/`, and this skill plus
  `debugging-this-repo` (project content, copied once, never re-synced).
- Hooks are dependency-free ESM on Node ≥18 reading stdin JSON. They never import from `cli/` —
  they are copied verbatim into repos that have no `node_modules`.
- Executable logic never lives in skill prose. A step that must be verified headlessly is code in
  `cli/` or `tools/` that a skill CALLS.
- `AGENTS.md` is the only cross-harness surface; `CLAUDE.md` merely imports it.

No analogue for what you are adding? Place it beside the closest existing file, name that
`file:line` in the plan, and dispatch a vault RECORD at `/evolve` so it is not re-derived.
