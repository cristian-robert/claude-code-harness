---
name: validate
description: "QA hat: run the full quality gate and report GATE GREEN/RED per command."
disable-model-invocation: true
argument-hint: "[plans/<slug>-plan.md]"
allowed-tools: Bash(git diff *) Bash(git status *) Bash(git merge-base *)
---

# /validate — full quality gate

Runs the FULL gate: every check in the "Commands" table of AGENTS.md (lint, typecheck, unit tests, build when the diff touches app code). Superset of the cheap Stop-hook gate in `.claude/harness.json` — passing that gate is not passing this one.

## Changed files (injected at invocation — best-effort)

!`git diff --name-only HEAD~10...HEAD 2>/dev/null || git diff --name-only 2>/dev/null || echo "(no git diff available)"`

Best-effort snapshot (last ≤10 commits, or working tree on fallback). Re-invoking `/validate` refreshes it.

## 0 · Discover the work item (item-linked runs)

The invocation argument (the text typed after the command) if given, else the plan referenced by the newest `reports/*-implementation-report.md`. Plan has `item:` → hold that item path for the Log append in the Output contract (independent of whether the optional runtime lens in 3b fires) so the QA event always lands in the audit trail.

## 1 · Determine the gate

| Source | Checks |
|---|---|
| AGENTS.md "Commands" table | lint, typecheck, unit tests — always |
| Conditional (step 2) | build, integration/e2e — only when the diff warrants |
| Always, when `knowledge-base/` exists | `npx perfect-harness-engineering kb-check` — index law, unfilled placeholders, secret shapes. Exit 1 is a FAIL row like any other |
| The report for THIS run only (the one step 0 resolved) | it carries a `receipt:` block — `grep -q '^receipt:' <that report>`. Missing → FAIL row, and the fix is to WRITE the block (every field resolves from the report and plan in front of you) then re-run the gate — creating an absent artifact is not weakening a check, and "never regenerate" protects an existing block, not a missing one. Never scan other reports — one run, one receipt. Re-validating an OLD branch whose report predates the spec → `Note:`, not a failure. No report at all (ad-hoc or docs-only diff) → row does not apply; skip it |
| Ratcheted greps (below) | doctrine / dangling-reference checks — always, when the repo defines one |

If the Commands table still has `<cmd>` placeholders, stop: blocker line, ask the user to fill it.

**Ratcheted greps (repo-specific).** Every grep this repo has ratcheted into its gate runs here, required output `clean`. Each traces to a real incident — a doctrine that drifted, a reference that dangled — and is added by `/evolve`, never invented at validate time. None recorded yet → skip this row and say so.

<!-- One fenced bash block per ratcheted grep, each ending `|| echo clean`. Shape:
     grep -rniE "phrase one|phrase two" path/to/scope/ || echo clean -->

## 2 · Detect what changed

Start from the injected "Changed files" list plus uncommitted changes (`git status --porcelain`). Looks truncated or wrong → re-derive against the base branch (`.claude/harness.json` `baseBranch`, else `git symbolic-ref --short refs/remotes/origin/HEAD`, else main/master): `git diff --name-only $(git merge-base HEAD <base>)`. Then:

- App/source code changed → add the build command.
- Only docs/rules/plans changed → lint + typecheck may be the whole gate; say which checks were skipped and why.
- Any check that touches live infrastructure or databases (staging DB, deployed services, paid APIs): **do not run it silently — name it and ASK first.**

## 3 · Run every command

Run each gate command to completion. Capture the real exit status — no inference from output text. One row per command:

| Command | Exit | Verdict |
|---|---|---|
| `<cmd>` | 0 | PASS |
| `<cmd>` | 1 | FAIL |

End verdict is exactly one of — no hedging, no "mostly passing", no "should be fine":

- `GATE GREEN`
- `GATE RED (N failures)`

## 3b · Runtime evaluation (optional lens — fold in BEFORE declaring the verdict)

Plan discovery: the invocation argument if given; else the plan referenced by the newest `reports/*-implementation-report.md`; neither exists → skip this lens and say so. When the diff includes user-facing behavior AND a runtime target exists (dev-server command in AGENTS.md's Commands table, or an app already running): dispatch `qa-evaluator` (`.claude/agents/qa-evaluator.md`, `tier: deep`). Spec source: plan has `item:` → resolve the item (tracking root) and PASTE its `## Acceptance criteria` block into the brief (an item-linked plan only references AC, never contains them — mirror `/accept`); else pass the plan path. Plus the target URL/entrypoint. Also pass `knowledge-base/runbook.md` as the how-to-drive reference when it exists (`.claude/references/knowledge-protocol.md`). It drives the running app and grades those criteria for depth vs stubs.

- `EVAL GAPS (N)` → each gapped criterion becomes a FAIL row in step 3's table. Runtime stubs are gate failures.
- `EVAL-BLOCKED: <reason>` → a report line under the table, NOT a failure — record it verbatim, never infer a pass or fail from it.
- Browser UI flows → `~/.claude/agents/tester-agent/AGENT.md` exists → dispatch it via the Agent tool (include that AGENT.md path); absent → report the flow as unverified for the human.

## 4 · On RED: fix, never weaken

- Obvious failure (typo, missing import): fix, re-run the failed command, then re-run the FULL gate.
- Non-obvious failure: invoke `superpowers:systematic-debugging` via the Skill tool before touching code. Fallback if the plugin is unavailable: reproduce → read the actual error → one hypothesis → test it → fix root cause, not symptom.
- **Hard rule:** never suppress, skip, `--no-verify`, `.skip`, comment out, or loosen a check to reach green. If a check is genuinely wrong (asserts stale behavior the plan changed), say so explicitly and ask before touching it.

## 5 · Evidence discipline

Every FAIL: show the exact command and the tail of its real output (the failing assertion/error, not a paraphrase). GREEN needs the per-command table with real exit codes — "tests pass" without it is not evidence.

## Output contract

Report resolved in step 0 → write the `gate:` line of its `receipt:` block with `GREEN` or `RED (N)` — that ONE line, never the whole block (`.claude/references/run-receipt.md`). Re-running `/validate` overwrites it: `gate:` always holds the LATEST result, never a history. No report (ad-hoc or docs-only run) → nothing to write; this is NOT a blocker and the verdict line below still stands.

The verdict and per-command table ARE this stage's artifact — no extra recap. End with exactly one line:

```
Validated <slug or diff> · Next: /review-branch
```

The item discovered in step 0 has `item:`/is set → append to the item's `## Log` in the TRACKING ROOT (resolve: first line of `git worktree list` — `backlog/` never lives in the worktree; commit there as `track(<id>): validated`): `<YYYY-MM-DD> validate: GATE GREEN` (or `GATE RED (N)`) so the QA event lands in the audit trail (github mode: mirror per the link-evidence row of `.claude/references/work-tracking.md`; degrade rules apply).

A blocker (placeholder commands, ASK pending on live-infra checks, RED you cannot fix) REPLACES that line: state the blocker and what you need.
