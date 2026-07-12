---
name: review
description: "Reviewer hat: fresh-eyes review of the current branch against its plan. Writes reports/<slug>-review.md."
disable-model-invocation: true
argument-hint: "[plans/<slug>-plan.md]"
allowed-tools: Bash(git diff *) Bash(git show *) Bash(git log *) Bash(git merge-base *)
---

# /review — fresh-eyes verdict on the whole branch

## 1. Gather inputs

- Status precondition (item-linked): the item must be `status: review` (set by `/implement` when the report was written). Not `review` → blocker: `item <id> is <status>, not review — /implement must finish first`.
- Plan: the invocation argument if given; else the plan referenced by the newest `reports/*-implementation-report.md`.
- Base branch: `.claude/harness.json` `baseBranch` if set, else `git symbolic-ref --short refs/remotes/origin/HEAD` (strip `origin/`), else `main`/`master` — whichever exists. Diff the WHOLE branch: `git diff <base>...HEAD` (single commit: `git show HEAD`). Never review per-task slices: cross-task bugs are invisible to per-task lenses (two real incidents).

## 2. Dispatch the reviewer

1. Invoke `superpowers:requesting-code-review` via the Skill tool for the discipline. Plugin unavailable → fallback below.
2. Dispatch the `code-reviewer` subagent (`.claude/agents/code-reviewer.md`) with exactly: the diff (or ref), the plan path, the verdict contract below. Fresh context by design — it sees only diff + plan + protocol, never the reasoning that produced the code.
3. Pin the reviewer's model explicitly: it is the SIBLING of the plan's `tier:` (deep-written → review at `build`; build-written → review at `deep`), always at `effort: xhigh`. Never let the reviewer be the model that wrote the code — it does not find the bug it just made. No plan/tier? Default to `deep`.
4. The reviewer keeps persistent project memory (`.claude/agent-memory/code-reviewer/`): recurring defect classes and past waived findings carry across sessions — but only if recorded (step 4).

## 3. Record the verdict

Write to `reports/<slug>-review.md`: first a machine-readable pointer line `Plan: plans/<slug>-plan.md · Item: backlog/<id>-<slug>.md` (this is what lets a fresh `/accept` or `/evolve` session find the plan and item by content, not by guessing the slug convention), then the reviewer's output VERBATIM below it — no summarizing, no softening.

- On `PASS` (first round or after the step-4 loop) with plan `item:` set → move that backlog item to `status: done` + append Log line `<YYYY-MM-DD> review: PASS reports/<slug>-review.md` — edit the item in the TRACKING ROOT (resolve: first line of `git worktree list`; commit there as `track(<id>): done`), NOT the worktree copy (`backlog/` only exists at the root). Github mode: mirror per `.claude/references/work-tracking.md`, degrade rules apply.

## 4. On REQUEST_CHANGES

Apply `superpowers:receiving-code-review`:

- Verify each finding against the code BEFORE implementing it. Reviewers prompted to find gaps will report some even when the work is sound.
- Push back with evidence when the reviewer is wrong. Fix only what affects correctness or stated requirements.
- Waiving a finding you verified false → TELL the reviewer to record the waiver in its memory (fingerprint, reason, decider) — in the next loop dispatch or a one-line follow-up. An unrecorded waiver is re-litigated next session.
- Loop: fix → **re-run the full gate** (AGENTS.md Commands table — a fix that satisfies the reviewer can still break lint/types/tests) → re-dispatch → until the first line is `PASS`. Append each round's verdict to the report.

## 5. Security lens (when the diff warrants)

Diff touches auth, sessions, crypto, input handling, file/network I/O, deserialization, SQL, secrets management, payments, or PII → run a dedicated security pass, not just the reviewer's checklist line. Invoke the global `security-audit` skill (or `pentest-expert` / `web-security-testing` for their domains) if available; absent → have `code-reviewer` treat the security checklist item as blocking-priority and say the deep skill was unavailable. Dependency/supply-chain: run the audit command from AGENTS.md's Commands table (`npm audit` / `pip-audit` / `uv pip audit`) if `/harness-init` configured one.

## 6. Optional second lens (L/XL changes)

OPTIONAL and external — skip it on a Claude-only / Max-subscription setup (the native `code-reviewer` agent above is the primary review and is fully sufficient). If you separately run a different-vendor backbone (e.g. `/codex:rescue`, requires its own subscription), an adversarial pass catches defect classes a same-model review can miss. Not required.

## Verdict contract (the reviewer MUST follow it; enforce on receipt)

| Verdict | First line (exact) | Body |
|---|---|---|
| Pass | `PASS` | per-category OK notes |
| Block | `REQUEST_CHANGES` | numbered blockers, EACH with a `file:line` reference |

- The verdict-gate hook enforces the first-line contract mechanically — a reviewer response whose first line is neither `PASS` nor `REQUEST_CHANGES` is rejected before it reaches the report.
- Blocking: missing test on behavior change · spec deviation without justification · obvious bug · security issue · silently-skipped spec item.
- Non-blocking, listed separately, prefixed `Note:`: style preferences, theoretical edge cases. Down-rating a CORRECTNESS assumption to a Note requires a concrete adversarial case verifying it first (two real incidents).
- Self-containment: reviewer needs context beyond diff+plan+protocol → `REQUEST_CHANGES` with `missing context: <what>`, never a fabricated verdict.
- When in doubt: block.

## Fallback (superpowers unavailable)

Dispatch code-reviewer with the contract inline. On findings: verify each against the code, fix the real ones, re-dispatch until PASS.

## Output

Report on disk; do not recap it in the terminal. End the run with exactly one line:

`Reviewed <slug>: <PASS|REQUEST_CHANGES> · Next: <command>` — `Next:` on PASS only: plan has `item:` set → `/accept backlog/<id>-<slug>.md` (the Stakeholder ceremony comes BEFORE /evolve); itemless → `/evolve`.

Blockers (an unresolvable REQUEST_CHANGES included) REPLACE that line. After `/evolve`, finish the branch with `superpowers:finishing-a-development-branch`.
