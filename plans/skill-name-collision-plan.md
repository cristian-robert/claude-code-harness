---
complexity: S
confidence: 9/10
tier: build
---

# Rename colliding pipeline skills: /plan → /plan-work, /review → /review-branch

## Context

- Incident: `/plan` is a **native** Claude Code command ("Enable plan mode or view the current session plan"). Verified in the official commands reference and in the 2.1.209 binary (`type:"local-jsx", name:"plan"`). A live TUI reproduction (project skill fixture + PTY capture) showed the project skill **silently replaces** the native command in the slash menu — and that precedence is undocumented, so it can flip in any CLI release. `review` likewise shadows the bundled `review` skill (GitHub PR review); that shadowing is documented but equally silent.
- ADR-003 picked the pipeline names without checking built-in collisions — violating this repo's "platform claims get verified" rule.
- The other 12 template skill names were audited against the current native-command and bundled-skill lists: no collisions.
- Historical artifacts (`plans/*.md`, `docs/design/*.md`, `reports/*.md`) keep the old names — they are records, not living docs.
- CLI tests are self-contained (synthetic fixtures named `plan`) and unaffected.

## Tasks

1. `git mv template/.claude/skills/plan template/.claude/skills/plan-work`; same for `review` → `review-branch`. Update `name:` frontmatter and `# /<name>` headers in both SKILL.md files.
2. Rewrite `/plan` → `/plan-work` and `/review` → `/review-branch` (word-boundary, never touching `/code-review`, `plans/`, `plan-template`) in living files: template skills (accept, backlog, harness-init, implement, research, sprint, validate), `template/.claude/references/*.md`, `template/AGENTS.md`, `template/.claude/agents/code-reviewer.md`, `template/.claude/harness.json` `$comment`, root `CLAUDE.md`, `README.md` (incl. `$plan` Codex forms), `docs/02|03|06|99`, `loop/README.md`, `cli/init.js`.
3. Validate: `npm test` green (cli suites + hook smoke test), `node tools/context-ledger.mjs template` within budgets, and a zero-hit grep sweep for bare `/plan` / `/review` in living files.
4. Evolve: record the decision + the verified platform facts in the vault (project `decisions.md`; cross-project lesson in `wiki/`).

## Out of scope

- Renaming any other skill; prefixing scheme (rejected by PO in favor of minimal rename).
- npm release/version bump (rename reaches consumers only via a release — PO decides when).
- Rewriting historical plans/design docs/reports.

## Verification

- `npm test` exits 0; context ledger reports all budgets green.
- `grep -rnE '(^|[^a-zA-Z-])/(plan|review)([^a-zA-Z-]|$)'` over living files returns only intentional hits (none).
- `template/.claude/skills/plan-work/SKILL.md` has `name: plan-work`; `review-branch` likewise.
