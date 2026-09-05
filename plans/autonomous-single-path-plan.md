---
ticket: ad-hoc
created: 2026-09-05
complexity: M
confidence: 9/10
tier: deep
---

# Autonomous mode — one activation path (retire the `autonomous` harness.json key)

## Goal
Autonomous mode (the harness's single highest-authority grant — it removes the human from PO priority, sprint scope and acceptance decisions) can be activated by exactly one thing: the human's own words in the current session. The `"autonomous"` key in `.claude/harness.json` — a value that, once set, stayed set silently across every future session and topic — is removed at the source, stripped from existing adopters with a notice, and never replaced by an inverted ceiling key.

## Context
- Knowledge to load first: LOCAL: `template/.claude/references/autonomous-mode.md`, `cli/harness-config.js` (the additive merge — why a retired key would otherwise live forever) · SHARED: `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (ADR-002 ratchet, ADR-021 prose-vs-code), written back as ADR-023.
- Incident (adopter repo, 2026-09-05): `/backlog refine` over 21 items resolved ~14 product forks without asking once because the key was true. Nothing malfunctioned; the rule was wrong.
- Read first: `template/.claude/hooks/*.mjs` — confirm no hook reads `cfg.autonomous` (none does; the key was prose-facing only).
- Pattern to follow: `cli/migrations.js` — migrate on `update`, say so in one line, never silently.

## Out of scope
- A replacement `allowed`/`forbidden` ceiling key — YAGNI until a real adopter must forbid autonomy outright.
- Historical `plans/` and `docs/design/` texts that cite the old reference by line number — artifacts of their time; the reference remains the single source of truth.

## Tasks
### Task 1: rewrite the reference to the single path
- Files: `template/.claude/references/autonomous-mode.md`
- Validate: `wc -l` ≤160; the words "harness.json" appear only as a NON-declaration.

### Task 2: retire the key at the source
- Files: `template/.claude/harness.json`, `cli/harness-config.js` (`RETIRED_KEYS` + `stripRetiredKeys`, `installHarnessConfig` returns `notices`), `cli/update.js`, `cli/init.js` (print notices)
- Validate: `node cli/update-harness-config.test.js` → new tests: strip + notice on update, strip on re-init, quiet when absent, fresh scaffold has no key in any JSON file.

### Task 3: skills cite, never restate
- Files: `template/.claude/skills/{harness-init,research}/SKILL.md`; audit backlog, plan-work, accept, evolve, sprint, implement.
- Validate: `grep -rn autonomous-mode.md template/.claude/skills` — every hit is a citation; harness-init body ≤100 lines.

### Task 4: loop + docs + README
- Files: `loop/PROMPT.template.md` (declaration is a visible operator line), `loop/README.md`, `docs/03-loops.md` (≤136, unchanged), `docs/06-delivery-org.md` (≤130), `README.md`
- Validate: `node loop/loop.mjs --dry-run` unchanged; docs line counts within budget.

### Task 5: version + vault
- Files: `package.json` (3.2.0 → 3.3.0; the only version source — `.init-meta.json` and the capabilities manifest derive from it), vault ADR-023, `agent-kb/patterns/session-scoped-authority-grants.md`, both `_index.md`.

## End-to-end verification
- `grep -rn '"autonomous"'` over the repo → hits only in migration text (reference incident line, harness-init notice, CLI notice, its test).
- Scaffold into a scratch dir → `harness.json` keys contain no `autonomous`; no JSON file anywhere in the scaffold has it.
- Fixture with `"autonomous": true` → `update` removes it, keeps `stopGate`, prints the one-line notice exactly once; a clean fixture prints nothing.
- `emit` output: `.agents/skills/<skill>/SKILL.md` byte-identical to `.claude/skills/<skill>/SKILL.md`; zero copies of the reference under `.agents/`/`.codex/`.
- `npm test` green (hook smoke suite included); `node tools/context-ledger.mjs template` unchanged.

## Risks & assumptions
- Assumption: minor bump (3.3.0), matching 3.1.0/3.2.0 precedent for behaviour-changing releases. A major bump is the operator's call if a removed config key counts as breaking.
- Risk: an adopter edits `harness.json` by hand after `update` and re-adds the key. Mitigation: it is inert (no code reads it) and `/harness-init` deletes survivors with the same notice.
