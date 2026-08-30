---
ticket: ad-hoc
created: 2026-08-30
complexity: M
confidence: 8/10
tier: deep
---

# Close the harness-engineering article gaps: run receipt, bounded review loop, doctrine additions

## Goal

Every PIV run leaves an attributable receipt (harness version, tier, rollback point, gate and
review outcomes) in its implementation report; the one uncapped loop in the pipeline gains a
round cap; and four doctrine gaps found by auditing PHE against the "Harness Engineering"
article (rari, 2026-08-29) are recorded. After this, checklist items 8, 10 and 12 of that
article pass, and item 3 is partially closed.

## Context

- Source analysis: this session's audit of `template/` against the article's 19 mechanisms.
- Provenance rule: `template/.claude/skills/evolve/SKILL.md:35-38` requires every added rule to
  cite a real incident. These additions cite **structural risk found by audit**, recorded
  honestly as such — no fabricated incidents.
- Budgets (`template/.claude/references/harness-maintenance.md:55-70`): skill <=100,
  reference <=160, docs <=130 guideline, AGENTS.md ~60, rule <=45.
- `implement/SKILL.md` is at 101 lines — ALREADY over budget. Receipt spec must relocate to a
  reference; the skill carries a pointer. Relocate, don't delete (`harness-maintenance.md:106`).
- `.agents/skills/` is derived from `.claude/skills/` on every emit (`cli/emit-codex.js:198-201`)
  — editing SKILL.md is the single source, no Codex parity work.
- Harness version for adopters lives in `.claude/.init-meta.json` (`cli/backup-copy.js:246`).
- Honesty constraint: `cost_usd` and `tools_used` from the article's receipt are NOT reliably
  knowable by an agent inside Claude Code. Excluding them is required by the evidence rule
  (`00-core.md:37`); the autonomous driver already records cost at `loop/loop.log`
  (`loop/loop.mjs:143-149`).

## Out of scope

- Action-class permission denies (network/deploy) — no traceable incident; adding them violates
  the ratchet rule. Recorded as a known gap instead.
- A DATA sensor lens (schema/range/freshness) — out of scope for a code-shaped harness; recorded
  in the anti-scope table.
- Hook changes — nothing in this plan touches `template/.claude/hooks/`.
- `global/`, `cli/`, `loop/` — unchanged.

## Tasks

### Task 1: Add the run-receipt reference
- Files: `template/.claude/references/run-receipt.md` (new)
- Steps: define the receipt block, field-by-field resolution rules, the multi-writer protocol
  (implement writes, validate and review-branch each append one line), and the explicit
  exclusion note for cost/tools.
- Validate: `wc -l` <= 160 and every field has a stated resolution source.
- Acceptance criteria: a fresh agent can produce a receipt from the reference alone.

### Task 2: Wire the receipt into /implement and get back under budget
- Files: `template/.claude/skills/implement/SKILL.md`
- Steps: add a Receipt row to the step-5 report table plus one pointer line; trim redundant
  prose elsewhere to land <=100 lines.
- Validate: `wc -l template/.claude/skills/implement/SKILL.md` -> <= 100
- Acceptance criteria: step 5 names the receipt and points at the reference.

### Task 3: Gate the receipt in /validate (encode twice: guide + check)
- Files: `template/.claude/skills/validate/SKILL.md`
- Steps: add a receipt-presence row to the step-1 gate table; add the `gate:` append to the
  output contract.
- Validate: `wc -l` <= 100; grep shows both the gate row and the append.
- Acceptance criteria: a missing receipt is a FAIL row, not a silent pass.

### Task 4: Cap the review loop and append the review line
- Files: `template/.claude/skills/review-branch/SKILL.md`
- Steps: bound step 4's `fix -> re-gate -> re-dispatch` loop at 3 rounds with an escalation
  blocker; append `review:` to the receipt on verdict.
- Validate: `wc -l` <= 100; grep for the cap.
- Acceptance criteria: the loop can no longer be described as "until PASS" with no bound.

### Task 5: Record the two doctrine additions
- Files: `docs/00-harness-engineering.md`
- Steps: add the failure-surface principle to the principles table; add the DATA-sensor row and
  the action-class-permission row to the anti-scope table.
- Validate: `wc -l docs/00-harness-engineering.md` -> <= 130
- Acceptance criteria: both gaps are recorded with reasons, not silently dropped.

### Task 6: Add the symptom-keyed failure index to /evolve
- Files: `template/.claude/skills/evolve/SKILL.md`
- Steps: add a compact symptom -> destination index above the existing destination ladder.
- Validate: `wc -l` <= 100
- Acceptance criteria: an agent mid-incident can enter the ladder by symptom.

### Task 7: Give the codebase-search MCP a declared failure state
- Files: `template/.claude/references/symbol-navigation.md`
- Steps: state the unavailability signal and the fallback order explicitly.
- Validate: `wc -l` <= 160
- Acceptance criteria: "if wired" is replaced by a stated detection + fallback.

## End-to-end verification

1. `node tools/context-ledger.mjs template` -> always-loaded tax unchanged (no always-loaded
   file was touched), status still WARN at <= 2000.
2. Every touched file within its budget (`wc -l` table).
3. `node template/.claude/hooks/smoke-test.mjs` -> green (proves no collateral damage; no hook
   was edited).
4. `git diff --stat` shows only the seven files above.

## Risks & assumptions

- Risk: the receipt adds ceremony to every run. Mitigation: it is ~10 lines appended to a file
  the stage already writes, and it is gated, not narrated.
- Assumption: adopters re-run `emit` for Codex parity — documented behavior, not this plan's job.
