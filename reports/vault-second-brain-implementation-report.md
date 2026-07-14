Plan: plans/vault-second-brain-plan.md

# vault-second-brain — implementation report

Branch: `feat/vault-second-brain` (single-checkout mode in the primary folder, at user direction).
Implementation commit: `882b5d5`.

## Task status

| Task | Status | Validation evidence |
|---|---|---|
| 1 · vault-protocol.md reference | done | `wc -l` → 39 (≤45); ledger total unchanged at 1639 after write |
| 2 · session-start vault line + fixtures | done | TDD: fixture RED first (`vault configured -> vault line present` FAIL), then GREEN — smoke test 94 passed, 0 failed (92 baseline + 2 new) |
| 3 · /backlog refine step 0 RETRIEVE | done | backlog SKILL.md 75 lines (≤100); ledger exit 0 |
| 4 · /plan-work agent-kb bullet | done | plan-work SKILL.md 92 lines (≤100); ledger exit 0 |
| 5 · debugging RETRIEVE/CAPTURE section | done | debugging-this-repo 50 lines (≤70 self-cap — no placeholder pruning needed); ledger exit 0 |
| 6 · /validate runbook → qa-evaluator | done | both edits applied; ledger exit 0 |
| 7 · architect-agent ladder + agent-kb | done | smoke test agent-frontmatter checks all PASS |
| 8 · evolve gate + 00-core + AGENTS.md in place | done | ledger: AGENTS.md 59 (≤60), 00-core 45 (≤45), total 1656 (≤2000) |
| 9 · docs 05 subsection + full gate | done | docs/05 at 119 lines (≤130); `npm test` all suites 0 failed; `grep -rn vault-protocol template/ \| wc -l` → 9 (≥7) |

## End-to-end verification

1. Smoke test: 94 passed, 0 failed — both vault fixtures green.
2. CLI rung: `obsidian search:context query="stop gate" path=projects/perfectHarnessEngineering limit=3` returned runbook.md + decisions.md hits. Fallback rung: with `PATH=/usr/bin:/bin` the CLI is absent; the documented `_index.md` chain (vault `_index.md` → project `_index.md` → `runbook.md`) resolved the same note (`Stop gate loops` row found at runbook.md:61).
3. `grep -n "isolated" template/.claude/references/vault-protocol.md` → line 37, review-branch row present — reviewer isolation preserved.

## Deviations

| Deviation | Why |
|---|---|
| Feature branch based on `fix/skill-name-collision`, not `main` | Plan + spec were already committed there (3895d1e), and the files this plan edits (`plan-work`, `review-branch` skills) only exist under those names on that branch. The /implement skill's assumed state (uncommitted plan on base) did not hold. |
| Skill step 2's `mv plans/… && commit "plan: <slug>"` skipped | The plan was already committed on the base — nothing to move. |
| Worktree `../wt-vault-second-brain` created, then removed; run finished in the primary checkout (skill's documented single-checkout fallback) | User directive mid-run: all work happens in `/Users/…/perfectHarnessEngineering`, no sibling folders. Work was committed on the branch before removal; nothing lost. |
| Executed in-session (superpowers:executing-plans), not subagent-driven | Fresh post-/clear session; nine small tightly-coupled edits with exact text in the plan — per-task dispatch buys nothing here. |
| Per-stage table not byte-for-byte "verbatim" from spec | Two rows carried spec-internal references ("decision 2") meaningless to template adopters; replaced with self-contained wording. Acceptance criteria (all rows present, review-branch says isolated) still met. |

## Files changed

| Task | Files |
|---|---|
| 1 | `template/.claude/references/vault-protocol.md` (new) |
| 2 | `template/.claude/hooks/session-start.mjs`, `template/.claude/hooks/smoke-test.mjs` |
| 3 | `template/.claude/skills/backlog/SKILL.md` |
| 4 | `template/.claude/skills/plan-work/SKILL.md` |
| 5 | `template/.claude/skills/debugging-this-repo/SKILL.md` |
| 6 | `template/.claude/skills/validate/SKILL.md`, `template/.claude/agents/qa-evaluator.md` |
| 7 | `template/.claude/agents/architect-agent.md` |
| 8 | `template/.claude/skills/evolve/SKILL.md`, `template/.claude/rules/00-core.md`, `template/AGENTS.md` |
| 9 | `docs/05-knowledge-layer.md` |

## Follow-ups (recorded, not fixed)

- **/implement isolation step creates a sibling `../wt-<slug>` folder — user explicitly objects.** Change the skill to an in-repo `.worktrees/<slug>` (gitignored) or branch-in-place default. Needs /evolve + PO decision; traces to this run's mid-implementation interrupts.
- Pre-existing IDE diagnostics in `cli/init.js` / `cli/update.js` / `cli/migrations.js` (unused vars, unreachable code at init.js:399) — out of scope, untouched.

## Plan

`plans/vault-second-brain-plan.md` — the contract this report answers.
