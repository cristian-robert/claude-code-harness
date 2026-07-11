---
name: accept
description: "Stakeholder acceptance: verify every acceptance criterion with evidence, then the human decides. Moves items to accepted."
disable-model-invocation: true
argument-hint: "[backlog/<id>-<slug>.md]"
---

# /accept — the Stakeholder ceremony

`/validate` proves the checks pass; `/review` proves the code is correct; `/accept` proves the increment does what the story asked. That verdict belongs to a human.

## 1 · Read the item

Item discovery: the invocation argument if given; else the `item:` frontmatter of the plan referenced by the newest `reports/*-review.md` (or `*-implementation-report.md`); none → blocker: name the item. Read that item FILE, resolving it against the TRACKING ROOT (first line of `git worktree list` — `backlog/` lives only there, not in a worktree); all status/Log writes below commit there as `track(<id>): <event>`. Files are canonical in BOTH backends (optional github cross-check: `gh issue view <issue#>` from the item's `issue: #<n>` Log line). Status precondition: the item must be `status: done` (a recorded `/review` PASS). Not `done` → blocker: `item <id> is <status>, not done — run /review to PASS it before acceptance` (the state machine forbids skipping review). `## Acceptance criteria` missing or empty → blocker: item has no acceptance criteria — `/backlog refine <id>` first. The criteria ARE the contract; without them there is nothing to accept.

## 2 · Evidence pass (QA hat)

Verify EVERY criterion observably — each was written to be checkable:

| Criterion kind | How to verify |
|---|---|
| Command/test observable | Run the exact command yourself; capture exit code + output tail |
| Runtime behavior (drive the app) | Dispatch `qa-evaluator` (`.claude/agents/qa-evaluator.md`, `model: opus`) with the criteria list pasted into the brief + the entrypoint (its spec source accepts either a plan path or a criteria list) |
| Browser UI flow | `~/.claude/agents/tester-agent/AGENT.md` exists → dispatch it via the Agent tool, including that AGENT.md path in the brief, and grade from its evidence; absent → `UNVERIFIABLE (no browser driver)` — the human exercises it manually |
| Static only (config/doc presence) | Cite `file:line` |

Per criterion, exactly one verdict — `PASS` / `FAIL` / `UNVERIFIABLE (<why>)` — plus evidence: the command and its real output tail, or a `file:line` citation. **NEVER mark a criterion PASS on code inspection alone when it can be executed** — inspection shows intent; only running shows behavior. `UNVERIFIABLE` is honest; an inferred PASS is not.

## 3 · The human decides (Stakeholder)

Present the full table:

| # | Criterion | Verdict | Evidence |
|---|---|---|---|

ASK: **approve / reject / partial** (name which criteria miss expectations). The human decision IS the ceremony — never proceed without it. Autonomous mode (per `.claude/references/autonomous-mode.md` — never self-inferred): approve ONLY if ALL criteria are PASS with evidence (any FAIL or UNVERIFIABLE → reject path), and record the decision under `## Assumptions` in the item.

## 4 · On approve

- Item → `status: accepted`; append to `## Log` ONE line per criterion (`<YYYY-MM-DD> accept #<k>: PASS — <command + output tail, or file:line>`) then the decision line `<YYYY-MM-DD> accepted by <human|autonomous> — <N>/<N> criteria PASS`. The evidence must survive the session — the terminal table dies with it.
- GitHub mode: close + strip the stale status label per work-tracking.md — `gh issue close <issue#> -r completed -c "<one-line evidence summary>"; gh issue edit <issue#> --remove-label status:done` (the done precondition guarantees this is the live label) (`<issue#>` from the item's `issue: #<n>` Log line, NEVER the backlog id); degrade rules apply.
- Scrum mode: append an acceptance note for this id to the current sprint file `sprints/<n>.md`.

## 5 · On reject / partial

- Item → `status: ready`; append a Log line per rejected criterion: expected vs observed, in the stakeholder's words (github mode: set-status op per work-tracking.md — `--add-label status:ready --remove-label status:done`; degrade rules apply).
- Route the gap: needs re-thinking → `/plan backlog/<id>-<slug>.md`; small known fix → `/implement` against the existing plan.

## Output contract

The per-criterion table IS this ceremony's terminal artifact (the human reads it); the item is updated on disk. End with exactly one line:

- approve: `Accepted <id> · Next: /evolve`
- reject/partial: `Returned <id> to ready · Next: /plan backlog/<id>-<slug>.md`

A blocker (no criteria, human decision pending, autonomous with non-PASS verdicts) REPLACES that line.
