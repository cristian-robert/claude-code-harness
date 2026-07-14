---
name: implement
description: "Dev hat: execute a plan file task-by-task with per-task validation. Writes reports/<slug>-implementation-report.md."
disable-model-invocation: true
argument-hint: "plans/<slug>-plan.md"
---

# /implement — execute the plan on disk

Superpowers skills below are invoked via the Skill tool. If the plugin is unavailable, use the
inline fallback given per step. On conflict, this repo's rules win.

## 1 · Load the contract

Read the plan file named by **the invocation argument** (the text typed after the command). Missing, unreadable, or no argument → stop; final line becomes:

```
BLOCKED: plan file <path> missing or unreadable — run /plan-work first
```

Never implement from memory of a conversation. The plan on disk is the contract — if the plan and
your recollection disagree, the plan wins; if the plan is wrong, record a deviation (step 4).
Then load the plan's **Knowledge to load first** entries NOW — invoke the listed knowledge
skills, read the listed files — the planner's context does not survive `/clear`.
Dev hat: plan has `item:` → (1) confirm the item is `status: ready` (not still `backlog` — refine skipped, AC unapproved); `backlog` → blocker `item <id> not PO-approved — /backlog refine <id> first`. (2) Kanban WIP check FIRST: count existing `doing` items in the tracking root — at/over `workTracking.wipLimit` → surface `WIP <n>/<limit> — finish in-flight work first` and confirm with the user before proceeding. (3) THEN set `status: doing` + Log line `implement: started` in the TRACKING ROOT copy of the item (resolve: first line of `git worktree list`; commit there as `track(<id>): doing`; Log line format `<YYYY-MM-DD> implement: started` — guard permits tracking-only commits on any branch). Items live outside code branches; plans/ and reports/ travel WITH this branch. Details: `.claude/references/work-tracking.md`.

## 2 · Isolation

`/plan-work` left `plans/<slug>-plan.md` as an uncommitted file in the primary checkout (the tracking root, on its base branch) and created no branch. Create the feature branch + worktree from base — ALWAYS inside the project root at `.worktrees/<slug>` (sibling folders like `../wt-*` are guard-blocked: a folder appearing outside the repo surprises the user); TELL the user what folder you are creating before creating it:

1. Keep it out of status, then add: `git check-ignore -q .worktrees || echo '.worktrees/' >> "$(git rev-parse --git-common-dir)/info/exclude"`, then `git worktree add -b {type}/<slug> .worktrees/<slug>` (new branch off base). Invoke `superpowers:using-git-worktrees` for the mechanics/cleanup.
2. `mkdir -p .worktrees/<slug>/plans; mv plans/<slug>-plan.md .worktrees/<slug>/plans/` — bring the plan into the worktree (it was untracked in the primary checkout, so it will not appear there on its own).
3. Commit it there (`git -C .worktrees/<slug> add plans/<slug>-plan.md && git -C .worktrees/<slug> commit -m "plan: <slug>"`), then **`cd .worktrees/<slug>`** — every later step (report write, code, task validation) uses paths relative to THIS worktree, so the cwd must actually be here; item-status writes still target the tracking root via `git worktree list`. Fallback (worktrees unavailable): `git switch -c {type}/<slug>` in place, `git add`+commit the plan — single-checkout mode; merge promptly.

The plan must exist in THIS working copy before any code. The item file stays in the tracking root — never copy it into the worktree.

## 3 · Execute task-by-task

| Plan shape | Skill |
|---|---|
| Multi-task plan, dispatch per task | `superpowers:subagent-driven-development` |
| Whole plan in this session (fresh context) | `superpowers:executing-plans` |
| Inside every task, either mode | `superpowers:test-driven-development` (RED→GREEN→REFACTOR) |

Dispatcher rules for subagent-driven mode:

- Implementer subagents get the task text **verbatim** plus the closest `AGENTS.md` (imported by `CLAUDE.md` on Claude Code) and scoped rules — no paraphrasing; pass the plan's `tier:` explicitly (default `deep`).
- File-mutating subagents run **sequentially** (parallel worktree agents have collided and leaked edits). Parallelize read-only research only. Sole exception: Wave mode.
- Building against an external tool/library? Consult its `wiki/stack/<tool>/` cache or current docs (the plan should name it) BEFORE writing tool-specific code — do not code the API from memory. Missing/stale → `/research <tool>@<pinned>` first.

Wave mode (plan marks `Wave: N`): tasks in a wave MAY run as parallel dispatches, each in an isolated worktree. Preflight: verify the wave's `Files:` lists are pairwise disjoint — any overlap collapses the wave to sequential. Waves run in order; run the full gate after each.

Fallback (no superpowers), per task:

1. Write the failing test first (RED).
2. Implement the minimum to pass (GREEN), then refactor.
3. Run the task's own Validate command **immediately** and read the output.

Never skip a task's validation to move faster: a skipped check is a hidden regression. A task is
done when its Validate command passes, not when the code is written.

Ask when blocked: mid-task ambiguity, a conflicting plan step, or a failed assumption → stop
and ask, do not guess. 3 failed attempts on one task → blocker (autonomous mode per `.claude/references/autonomous-mode.md`: log it under
`## Assumptions` in the report and move to the next independent task).

## 4 · Verify the whole

1. Run the plan's End-to-end verification section — plan has `item:` → read that item's `## Acceptance criteria` (tracking root) and confirm each is met; the plan references them by path, it does not restate them.
2. Invoke `superpowers:verification-before-completion`. Fallback: re-run every gate command and
   read the real output. Evidence means command output on record — never "looks done".

## 5 · Report (mandatory, to disk)

Write `reports/<slug>-implementation-report.md` (slug from the plan filename), leading with the machine-readable pointer line `Plan: plans/<slug>-plan.md · Item: backlog/<id>-<slug>.md` (same format /review-branch uses — fresh /validate and /review-branch sessions find the plan by this line, not by parsing a table cell):

| Section | Content |
|---|---|
| Task status | Per task: done/failed + one-line validation output summary |
| Deviations | Every departure from the plan, with why |
| Files changed | Paths, grouped by task |
| Follow-ups | Out-of-scope discoveries — recorded, **not** fixed |
| Plan | `plans/<slug>-plan.md` — the contract this report answers (consumers discover the plan through this row) |

Plan has `item:` → report written means the item moves to `status: review` + Log line `<YYYY-MM-DD> implement: reports/<slug>-implementation-report.md`. Edit the TRACKING ROOT copy (resolve: first line of `git worktree list`; commit there as `track(<id>): review` — guard permits tracking-only commits on any branch), NOT the worktree copy (`backlog/` only exists at the root). Github mode: mirror per `.claude/references/work-tracking.md`, degrade rules apply.

## 6 · Scope discipline

Implement the plan and nothing outside it. No preemptive fixes for anticipated review findings,
no gold-plating, no drive-by refactors — `/review-branch` and `/evolve` exist for that. Off-plan work
belongs in Follow-ups.

## Output contract

Artifacts go to disk; do not recap them in the terminal. End the run with exactly one line:

```
Implemented <slug> · Next: /validate (stay in this worktree — reports/ live on the code branch)
```

Blockers replace that line.
