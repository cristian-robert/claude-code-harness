# Perfect Harness Engineering (PHE)

Framework repo: the harness-engineering framework for Claude Code lives here. `template/` is the shippable payload; `docs/` is the discipline; the three coleam00 clones are read-only reference material.

## Knowledge Vault

This project's knowledge base lives in the unified Obsidian vault at:
`~/Dev/The Vault/`

**Before architecture, design, or planning work, navigate the vault** (3–4 reads, any vault size):
1. Read `~/Dev/The Vault/CLAUDE.md` — vault conventions.
2. Read `~/Dev/The Vault/_index.md` — vault map.
3. Read `~/Dev/The Vault/projects/perfectHarnessEngineering/_index.md` — THIS project's wiki (START HERE), then its `architecture.md`, `decisions.md`, `resources.md`, `runbook.md` as needed.
4. Read the specific file you need.

**Reusable knowledge** beyond this project:
- `~/Dev/The Vault/wiki/` — cross-project engineering knowledge.
- `~/Dev/The Vault/agent-kb/` — AI-agent building know-how (prompts, evals, models, patterns, tooling).

**Write back:** when a decision, architecture change, or reusable lesson emerges, record it in the vault (this project's wiki, or `wiki/`/`agent-kb/` if it generalizes) — and follow the vault's Index Law: any folder you create or whose contents you change, create/update its `_index.md` in the same change.

## Commands

| Task | Command |
|---|---|
| Hook smoke tests | `node template/.claude/hooks/smoke-test.mjs` |
| Context ledger (self-check on template/) | `node tools/context-ledger.mjs template` |
| Loop driver dry run | `node loop/loop.mjs --dry-run` |

## Hard rules

- **Hooks change → smoke test runs**: any edit under `template/.claude/hooks/` (or to installed copies in `~/.claude/hooks/`) requires `node template/.claude/hooks/smoke-test.mjs` green, with a new fixture for any new behavior.
- **Platform claims get verified**: anything asserting Claude Code behavior (hook schemas, frontmatter keys, load order) must match the current official docs — they version and drift. `paths:` not `globs:`; stdin JSON not argv.
- **Budgets are enforced content design**: template CLAUDE.md ≤60 lines, rules ≤45, skill bodies ≤100 (measured by `tools/context-ledger.mjs`); docs ≤130 as a review guideline. Adding means cutting.
- **Ratchet + prune**: every rule added to `template/` needs a traceable incident; every change considers what to remove.
- **Dogfood the pipeline**: non-trivial changes to this repo go through `/plan-work → /implement → /validate → /review-branch → /evolve` with superpowers discipline, like any harnessed project.

## Structure map (details: README.md)

| Area | Owner file |
|---|---|
| Shippable project harness | `template/` (CLAUDE.md + .claude/*) |
| Autonomous loop | `loop/` |
| Global (~/.claude) hardening | `global/` (opt-in, never auto-applied) |
| Measurement | `tools/context-ledger.mjs` |
| Discipline docs | `docs/00…06, 99` |
