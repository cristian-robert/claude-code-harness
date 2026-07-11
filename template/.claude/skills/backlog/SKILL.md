---
name: backlog
description: "Capture, refine, prioritize work items and run the board (BA + PO + PM hats). Creates/grooms backlog/ items; board + next are the PM hat."
disable-model-invocation: true
argument-hint: "[new <title> | refine <id> | board | next]"
allowed-tools: Bash(ls *) Bash(grep *)
---

# /backlog — one item model, four verbs

Items live at `backlog/<id>-<slug>.md` IN THE TRACKING ROOT (primary checkout — items sit outside code branches; every write commits there as `track(<id>): <event>`), in the exact shape of `.claude/references/item-template.md`. Backend (files|github) and method (kanban|scrum) come from `.claude/harness.json` `workTracking`; every backend operation — including degrade — follows `.claude/references/work-tracking.md`. Route on the invocation argument (the text typed after the command); no subcommand → board.

## Current state

A cwd PREVIEW (from the tracking root this is the board; from a worktree it reads empty — the `board` step below resolves `<tracking-root>/backlog` per work-tracking.md, which is authoritative):

!`ls backlog/ 2>/dev/null || echo "(no backlog/ here — resolve the tracking root)"`

!`grep -o '"workTracking"[^}]*}' .claude/harness.json 2>/dev/null || echo "workTracking unset — defaults: files / kanban"`

## board — PM hat: derive, never store

The board is a VIEW computed now — never a committed index file.

- BOTH backends: read the frontmatter of every `<tracking-root>/backlog/*.md` (the canonical store; resolve the tracking root per work-tracking.md when in a worktree); print ONE table — id · title · type · priority (add points · sprint in scrum mode) — grouped by status in pipeline order, sorted priority then id. `accepted` items collapse to one count line.
- GitHub mode: `gh issue list` is an optional cross-check — mirror drift → note it, files win.
- Kanban: `doing` count >= `workTracking.wipLimit` (at/over capacity — matches `/implement`) → append ONE advisory line (`WIP <n>/<limit> — finish before starting`); advisory only, never blocks.

## new <title> — BA hat: capture as a contract

1. id = highest existing item id + 1 (empty backlog/ or only `.gitkeep` → `001`), zero-padded to 3 digits; slug = kebab-case title. The slug is reused downstream by `plans/<slug>-plan.md` and `reports/<slug>-*.md` — linkage by convention, zero fields to sync.
2. Write `backlog/<id>-<slug>.md` from the item template (Write tool; no terminal echo) with a genesis `## Log` line `<YYYY-MM-DD> created`, then the backend `create item` op per work-tracking.md.
3. INVEST-check the Story: Independent · Valuable · Small (fits one plan→implement cycle) · Testable. Fails Small → `type: epic`, split into children each carrying `parent: <id>`.
4. Draft Acceptance criteria as checkboxes, each observably verifiable — a command to run or a behavior to watch; "works well" is not a criterion. That section is THE single home of AC: plans reference it, never duplicate it.
5. Every Context claim cites `[Source: file:line or URL]` — no citation, no claim. Unsure of the source → leave it out and say so.
6. Priority: ask the human (PO) when present; otherwise write a default marked `# proposed — PO confirms at refine` after the value. Refine's ready-transition requires the human to have confirmed priority alongside AC.
7. Scrum mode: fill `points`/`sprint` only from human input — never invent estimates.

## refine <id> — BA hat drafts, PO (the human) decides

1. Read the item. Tighten Story + AC: vague → observable, oversize → split proposal, uncited Context → sourced pointers.
2. Any scope change (AC added/removed/reworded, split, type change) → present a before/after diff and WAIT for approval before writing.
3. Priority and ordering are ALWAYS the human's call — propose with a one-line reason; never set unilaterally.
4. AC approved by the human (PO) → set `status: ready` in the same write, AND confirm the priority with the human and strip any `# proposed — PO confirms at refine` marker (a `ready` item carries a confirmed priority) — the ONE transition this skill owns (github mode: mirror per work-tracking.md's set-status row — `gh issue edit <issue#> --add-label status:ready --remove-label status:backlog`; degrade rules apply).
5. Scope change from step 2 that altered AC/body → re-mirror the body (github mode: refine/body-change row). Priority changed from the proposed default → mirror it too (github: type/priority-change row — `gh issue edit <issue#> --add-label priority:<new> --remove-label priority:<old>`); degrade rules apply.
6. On write, append a `## Log` line: `YYYY-MM-DD /backlog refine: <what changed>`.

## next — PM hat: recommend, don't start

1. Ship-stamp sweep FIRST: for each `accepted` item whose feature branch is merged into base (`git branch --merged <base>` contains `{type}/<slug>`), append `<YYYY-MM-DD> shipped: <merge-commit>` to its Log if absent, then commit `track(<id>): shipped` — this is the owner of the `shipped:` line, closing the audit trail.
2. Candidates = `status: ready` items (scrum mode: current-sprint items first, then the rest). None ready → blocker line: `No ready items. Refine one: /backlog refine <id>` (list the top `backlog`-status items as candidates to refine).
3. Rank by priority (P0 first), then age (oldest `created` first). Present ONE pick + one-line why, and name the runner-up.
4. Do not start planning — hand off: `Next: /plan backlog/<id>-<slug>.md`.

## Hats here, transitions elsewhere

| Verb | Hat | Decision that stays human (PO/Stakeholder) |
|---|---|---|
| new / refine | BA | AC approval, scope changes, priority, ordering |
| board / next | PM | which item actually starts |

Transitions here: refine sets backlog → ready on PO approval — nothing else. Downstream: /implement → doing then review, /review PASS → done, /accept → accepted (reject path returns items to ready) — table in item-template.md.

## Autonomous mode (activation rules: `.claude/references/autonomous-mode.md` — never self-inferred)

new/refine proceed without asking; set `ready` only when every criterion is observably verifiable; every priority, ordering, scope, or readiness decision taken alone is logged under `## Assumptions` in the item (create the section if absent) — the human PO reviews them at /accept.

## Output contract

Artifacts to disk; the board table is the only permitted terminal output beyond the final line. End with exactly one line:

`<verb-past> <object> · Next: <command>` — e.g. `Created 007-dark-mode · Next: /backlog refine 007`; after refine → ready: kanban `Next: /plan backlog/<id>-<slug>.md`, scrum `Next: /sprint plan`; `Printed board · Next: /backlog next`

Blockers replace that line.
