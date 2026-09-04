Plan: plans/autonomous-single-path-plan.md · Item: none (ad-hoc, workTracking inactive in this repo)

# Implementation report — autonomous-single-path

| Section | Content |
|---|---|
| Task status | 5/5 done, all validations green |
| Knowledge | Read: `~/Dev/The Vault/projects/perfectHarnessEngineering/{_index,decisions}.md`, `agent-kb/patterns/_index.md`. Written (vault): `decisions.md` ADR-023, `agent-kb/patterns/session-scoped-authority-grants.md` (new), `agent-kb/patterns/_index.md`, project `_index.md` |
| Deviations | 1 — the first version of the scaffold test grepped for the literal string and flagged the migration prose that explains the retirement; rewritten to parse every JSON file for the key (what "no key" means) |
| Files changed | `template/.claude/references/autonomous-mode.md`, `template/.claude/harness.json`, `template/.claude/skills/{harness-init,research}/SKILL.md`, `cli/{harness-config,update,init}.js`, `cli/update-harness-config.test.js`, `loop/{PROMPT.template,README}.md`, `docs/{03-loops,06-delivery-org}.md`, `README.md`, `package.json`, this plan + report |
| Did code ever read the key? | **No.** `grep -o 'cfg\.[A-Za-z]*' template/.claude/hooks/*.mjs` lists stopGate, baseBranch, workTracking, models, knowledge, requireEvolveBeforePush, the gate timeouts and tamper paths — never `autonomous`. `loop/loop.mjs` never opens harness.json. The only code that touched it was the key-agnostic merge in `cli/harness-config.js` (carrying it, not reading it) and one test fixture. It was prose-facing only. |
| Follow-ups | None required. Historical `plans/knowledge-base-migration-plan.md:50` and `docs/design/2026-08-03-…:190` cite the old reference by line range; left as artifacts of their time |

## Per-task status

| Task | Status | Validation evidence |
|---|---|---|
| 1 reference rewrite | done | 41 lines (≤160); `harness.json` named only under "NOT a declaration", with the 2026-09-05 trace |
| 2 retire the key | done | template `harness.json` parses, key absent; `cli/update-harness-config.test.js` → `23 passed, 0 failed` incl. 4 new tests |
| 3 skills cite only | done | 8 skills cite `.claude/references/autonomous-mode.md`; `research` no longer implies "invoked from /plan-work" activates it; harness-init body 99 lines (ledger reports no budget breach) |
| 4 loop + docs | done | `PROMPT.template.md` line 7–8 is a visible operator declaration (was an HTML comment); `loop.mjs --dry-run` unchanged; docs/03 136 (unchanged, one paragraph folded), docs/06 130 |
| 5 version + vault | done | `package.json` 3.3.0 (only version source); `grep -c ADR-023 decisions.md` → 1; both `_index.md` updated in the same change (Index Law) |

## End-to-end verification (all run fresh, output read)

- `grep -rn '"autonomous"'` (reference clones excluded) → 5 hits, all migration text: reference line 17 (incident), harness-init line 61 (notice), `cli/harness-config.js:55` (notice), test lines 194/253.
- Fresh scaffold (`init` via local fallback into the scratchpad): harness.json keys = `$comment, stopGate, selfHostedRunner, localCi, requireEvolveBeforePush, baseBranch, stopGateTimeoutSec, stopGateTotalSec, stopGateTamperPaths, workTracking, models, harness, knowledge` — no `autonomous`.
- Fixture with `"autonomous": true` + `stopGate: ["npm test"]` → `update` printed `harness.json: removed inert "autonomous" key — autonomy is declared per session, in your own words (.claude/references/autonomous-mode.md).` once; after: 0 hits, `stopGate` intact. Clean fixture → notice count 0.
- Emit parity: all 8 autonomy-citing skills byte-identical between `.claude/skills/` and `.agents/skills/`; 0 copies of the reference under `.agents/`/`.codex/` (Codex reads `.claude/references/` in place, so there is one copy to diverge from).
- `npm test` → every suite `0 failed`, `EXIT=0`; hook smoke test `135 passed, 0 failed`.
- `node tools/context-ledger.mjs template` → `1659 / 2000 est. tokens (83%)`, unchanged.

## Assumptions
- Version bumped minor (3.3.0) per the 3.1.0/3.2.0 precedent; a removed config key that no code read is a rule change, not an API break. Operator may prefer 4.0.0.
- `/harness-init` was verified by reading the instruction (a skill runs only inside a Claude session and its interview cannot be driven headlessly); the CLI path that actually runs on every adopter (`init`/`update`) is verified by effect above.
