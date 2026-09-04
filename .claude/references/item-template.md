# Work-item template

`/backlog new` writes `backlog/<id>-<slug>.md` — in the TRACKING ROOT (primary checkout; items live outside code branches, see work-tracking.md) — in exactly this shape. The slug is shared with `plans/<slug>-plan.md` and `reports/<slug>-*.md` — item↔plan↔report linkage is free by convention. Comments are guidance — omit them from real items.

```markdown
---
id: 007              # zero-padded next free number in backlog/
type: story          # epic | story | task | bug — epics group children, they are never implemented directly
status: backlog      # owned by pipeline skills (table below) — never hand-advance
priority: P1         # P0 | P1 | P2 — the human's (PO) call; agents propose, never set
points: 3            # scrum mode only — human forecasting aid, never agent-invented
sprint: 2            # scrum mode only — matches sprints/<n>.md
created: YYYY-MM-DD
parent: 003          # epic children only — bare id, never a path
---

# <Title>

## Story
<!-- BA hat writes. "As a <role>, I want <action>, so that <benefit>" — INVEST-sized: one plan→implement cycle. -->

## Acceptance criteria
<!-- BA drafts, PO (human) approves. THE single home of AC — plans reference this section, never duplicate it. -->
<!-- Each criterion must be checkable by running/observing something — "works well" is not a criterion. -->
- [ ] <run `<cmd>` → <expected output>>
- [ ] <observable behavior in the running app>

## Context
<!-- What the planner/implementer needs; every claim cites [Source: file:line or URL] — uncited claims don't belong. -->
- <fact> [Source: src/auth/jwt.ts:42]

## Log
<!-- Append-only evidence trail: one date-prefixed line per event (Dev/QA/review/accept). Never rewrite or delete. -->
- YYYY-MM-DD plan: plans/<slug>-plan.md
- YYYY-MM-DD issue: #42            # github mode only — the issue-number mirror line
```

## Status values — each transition owned by ONE skill

| status | meaning | set by |
|---|---|---|
| backlog | captured, AC not yet PO-approved | /backlog new |
| ready (fresh) | AC approved by the PO — plannable | /backlog refine (on human approval) |
| doing | implementation in flight | /implement (start) |
| review | report written, awaiting review | /implement (end) |
| done | review PASS | /review-branch |
| accepted | human verified evidence per criterion | /accept |
| ready (returned) | acceptance rejected/partial — back in play | /accept (reject path) |

## Example board (derived by /backlog board — never committed)

| status | items |
|---|---|
| ready | 004 dark-mode-toggle · P1 |
| doing | 002 auth-refresh · P0 |
| review | 001 csv-export · P2 |
