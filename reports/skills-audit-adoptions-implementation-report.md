Plan: plans/skills-audit-adoptions-plan.md · Item: none (ad-hoc, workTracking inactive in this repo)

# Implementation report — skills-audit-adoptions

| Section | Content |
|---|---|
| Task status | See per-task table below — 6/6 done, all validations green |
| Knowledge | Read before Task 1: `~/Dev/The Vault/projects/perfectHarnessEngineering/_index.md`, `decisions.md` (ADR-002/007/018/019/020/021), `~/Dev/The Vault/CLAUDE.md`, `system/schemas/frontmatter.md`. KB files changed this run (vault): `agent-kb/tooling/ablation-runner.md` (new), `agent-kb/patterns/declared-file-coupling.md` (new), both folders' `_index.md`, `projects/perfectHarnessEngineering/{decisions,resources,_index}.md` |
| Deviations | 3, all recorded below |
| Files changed | Repo: `template/.claude/hooks/{guard,stop-gate,smoke-test}.mjs`, `template/.claude/harness.json`, `template/.claude/skills/evolve/SKILL.md`, `loop/loop.mjs`, `docs/{00-harness-engineering,99-sources}.md`, `plans/skills-audit-adoptions-plan.md`, this report. Vault: 7 files listed under Knowledge |
| Follow-ups | (1) `permission_denials` is undocumented — consider filing an upstream docs issue (guide-agent recommendation). (2) `second-brain-audit` (stale-fact finder) could someday run against The Vault — noted in the audit, not planned. (3) Installed `~/.claude/hooks` copies (if any adopter exists) pick these up on next re-init, not automatically |
| Plan | `plans/skills-audit-adoptions-plan.md` — the contract this report answers |

## Per-task status

| Task | Status | Validation evidence |
|---|---|---|
| 1 guard env-dump/quote-fold/paths | done | TDD: 9 deny fixtures RED first (121/9), then `134 passed, 0 failed`; 12 new fixtures; commit `9850648` |
| 2 stop-gate tamper check | done | TDD: 2 fixtures RED first (132/2), then `134 passed, 0 failed`; 4 new fixtures; harness.json still valid JSON; commit `7b3d81d` |
| 3 evolve drift bullet | done | diff exactly +1/−0; file 99 lines (≤100); ledger unchanged `1659 / 2000 (83%)`; commit `547c6c9` |
| 4 loop denial surfacing | done | `node --check` clean; `--dry-run` output unchanged; commit `7e49c10` |
| 5 docs sources + anti-scope | done | `grep -c coleam00/skills` → docs/00: 2, docs/99: 1; docs/00 at 82 lines (≤130); commit `42c672c` |
| 6 vault recordings | done | both notes exist; `grep -c ADR-022 decisions.md` → 1; Index Law: tooling/_index, patterns/_index, project _index all updated in the same change; registry row has no date column → untouched; vault is NOT a git repo → files only (plan step 7 anticipated both) |

## End-to-end verification (all run fresh, output read)

1. `node template/.claude/hooks/smoke-test.mjs` → **134 passed, 0 failed** (baseline 118 + 16 new: 12 guard + 4 stop-gate).
2. `node tools/context-ledger.mjs template` → **1659 / 2000 est. tokens (83% WARN)** — identical to pre-change baseline; zero always-loaded movement.
3. `node --check` on guard.mjs, stop-gate.mjs, smoke-test.mjs, loop.mjs → clean; `node loop/loop.mjs --dry-run` → clean, output shape unchanged.
4. `git diff main --stat` → 9 files, all named by the plan (347+/8−).
5. Vault spot-checks per Task 6 Validate → pass (see table).

## Deviations

1. **Task 4 verification outcome: `permission_denials` is real but UNDOCUMENTED.** The claude-code-guide agent found the field only in observed envelopes (anthropics/claude-code#54850, top-level array of `{tool_name, tool_use_id, tool_input}`) — absent from the official headless/CLI docs (checked 2026-09-01). Handled per repo doctrine instead of citing a doc URL: defensive parse (`denials=?` printed when the field is absent, so a rename degrades to "unknown", never a fake zero) plus a new row in docs/99's "Claims we deliberately labeled as unverified" table. The docs/99 row is an extra edit to a file the plan already owned.
2. **Task 4 step 3 comment placement:** the explanatory comment sits at the parse site in the iteration loop rather than in the header SAFETY block — same content, next to the code it explains.
3. **Task 2 state file:** on a tamper block, `.claude/state/last-gate.json` records `verdict: "TAMPER"` (plan didn't specify state handling for this branch; consumers treat the verdict string as opaque/advisory).

## Upstream reference

Adapted (not ported) from github.com/coleam00/skills (MIT): `hooks/pre_tool_use_secrets.py` regex set + quote-normalization rationale; `hooks/stop_tests_must_pass.py` snapshot-once tamper design. Audit record: vault ADR-022, docs/99 source 18.
