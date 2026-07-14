---
name: sprint
description: "Scrum ceremonies: plan or close a sprint (PM hat, PO decides scope)."
disable-model-invocation: true
argument-hint: "[plan | close]"
allowed-tools: Bash(ls *) Bash(grep *)
---

# /sprint — plan or close a sprint (scrum mode only)

## 0 · Guard

Ceremonies edit item/sprint files in the TRACKING ROOT (work-tracking.md) — mid-flight items included; code branches never carry item edits, so stamps cannot merge-conflict. Read `.claude/harness.json` → `workTracking.method`. Not `"scrum"` → stop with a blocker: work tracking is kanban — no sprints; `/backlog` drives flow directly (pull the next ready item, no batching ceremony needed).

## Current state (cwd preview — from a worktree resolve `<tracking-root>/sprints` per work-tracking.md; the `/sprint plan` step is authoritative)

!`ls sprints/ 2>/dev/null`

Next sprint `<n>` = highest existing number + 1 (none → 1). The invocation argument (the text typed after the command) picks the ceremony; missing → ask which.

## /sprint plan — PM hat proposes, PO (the human) decides scope

1. Candidates, from the canonical files in BOTH backends: `grep -l "^status: ready" backlog/*.md` PLUS every item already carrying `sprint: <n>` regardless of status (`grep -l "^sprint: <n>" backlog/*.md` — carried mid-flight items enter the scope table with their current status). GitHub `gh issue list` is an optional cross-check — mirror drift → note it. No candidates → blocker: nothing ready — `/backlog refine` first.
2. Draft ONE sprint goal (an outcome sentence, not an item list) + candidate scope: ready items ordered P0 → P1 → P2. Items carry `points` → keep the batch within the last sprint's velocity line (first sprint: size conservatively and say so).
3. ASK the human (PO): goal + candidate table (id · title · priority · points) AND the sprint length (default 2 weeks if they don't specify); they cut/add/reorder. The human owns scope — never commit a sprint unasked. Autonomous mode (per `.claude/references/autonomous-mode.md`): take the proposal as-is, default 2-week length, and record it under `## Assumptions` in the sprint file.
4. Write `sprints/<n>.md` with CONCRETE dates — `start:` = today, `end:` = start + length (never leave the `<YYYY-MM-DD>` placeholder: the github `due_on` is derived from `end:` and a literal placeholder 422s the milestone create):

```markdown
---
sprint: <n>
state: open          # set to closed by /sprint close
goal: "<one sentence>"
start: <YYYY-MM-DD>
end: <YYYY-MM-DD>
milestone: #<m>       # github mode only — the milestone .number (distinct from sprint <n>); empty capture → leave unset and /sprint close skips the milestone PATCH with a note
committed: [<ids>]
---
## Goal
<the sentence, plus what "done" looks like at close>

## Committed
| id | title | priority | points |
```

5. Stamp each committed item in its FILE — frontmatter `sprint: <n>` + a `## Log` line (BOTH backends; files are canonical). GitHub mode additionally creates the milestone and attaches issues per work-tracking.md (capture `.number` per the sprint-create row; `due_on` = the sprint file's `end:` date as `<end>T00:00:00Z`); degrade rules apply — a failed gh call never blocks the ceremony, the files are canonical.

## /sprint close — PM hat reports, PO decides carry-over

1. Sprint Review (the batch increment demo): read each committed item and render one rollup table — id · title · status · accepted?(✓/✗ from the item Log) — read from disk/`gh`, never from memory. This IS the Scrum Sprint Review; per-item acceptance already happened at `/accept`, this is the batch view for the stakeholder.
2. Items not `accepted` → ASK per item: CARRY (set `sprint: <n+1>`, status unchanged — /sprint plan <n+1> re-commits it and re-stamps the milestone) or RETURN (clear `sprint:`, status unchanged whatever it is — ready/doing/review/done items stay where the pipeline left them), each with a Log line. Autonomous mode: return and log the assumption.
3. Append the velocity line to `sprints/<n>.md`: `velocity: <points or item count accepted> (accepted <a>/<c> committed)`.
4. NO retrospective here — **/evolve IS the retrospective.** Hand it this sprint's friction as candidates: carry-overs and why, gate failures, review blockers, criteria that proved unverifiable.

## Output contract

Artifacts to disk; no terminal recap. End with exactly one line:

- plan: `Planned sprint <n> · Next: /plan-work backlog/<top-item>.md` — top item = first committed by priority.
- close: `Closed sprint <n> · Next: /evolve` — only AFTER the backend close: files mode set `state: closed` in `sprints/<n>.md`; github mode close the milestone per work-tracking.md's sprint-close row using the `milestone: #<milestone#>` recorded in the sprint file.

A blocker (kanban mode, no ready items, PO decision pending) REPLACES that line.
