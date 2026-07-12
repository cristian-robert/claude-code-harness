# Plan file template

`/plan` writes `plans/<slug>-plan.md` in exactly this shape. Comments are guidance — omit them from real plans.

```markdown
---
ticket: <id or "ad-hoc">
item: backlog/<id>-<slug>.md  # optional — the work item this plan executes; its acceptance criteria are the success contract
created: YYYY-MM-DD
complexity: S|M|L|XL
confidence: N/10          # that /implement succeeds first-pass; <=6 → ask user before handoff
tier: deep                # implementer hint: `deep` (hard logic/architecture) | `build` (this plan already specs it out step by step). /review inverts this to pick the reviewer.
---

# <Title>

## Goal
<!-- One paragraph: what exists when this plan is done, and why it matters. -->

## Context
<!-- The PRP "curated codebase intelligence" — everything /implement needs, nothing more. -->
- Knowledge to load first: <.claude/skills/architecture-map, docs/x.md, ...> # /implement reads these BEFORE Task 1 — they were in the planner's context and died at /clear
- Read first: <file:line> — <why>
- Pattern to follow: <file> — <what it demonstrates>
- Library versions: <name@version, pinned from lockfile>

## Out of scope
<!-- Mandatory. What this plan deliberately does NOT touch. -->
- <excluded item + one-line reason>

## Tasks
<!-- One block per task, dependency order, sized for a junior engineer with no project context. -->
### Task 1: <verb phrase>
- Files: <exact paths to modify/create>
- Wave: <N>  # optional — tasks share a wave ONLY if their Files lists are pairwise disjoint
- Steps: <numbered, concrete actions>
- Validate: `<exact command>` → <expected result>
- Acceptance criteria: <observable condition(s)>

## End-to-end verification
<!-- The proof the FEATURE works, not just that tasks ran: exact commands/flows + expected output. -->
<!-- If item: is set, the end-to-end proof is that item's acceptance criteria — reference them, do not restate them. -->

## Risks & assumptions
<!-- Known risks with mitigations. Autonomous mode logs every unconfirmed guess under ## Assumptions here. -->
```

## Rules

- Task size 2-30 min; split anything bigger into separate tasks.
- Every task independently verifiable: a `Validate:` command with an expected result — no "should work".
- No-prior-knowledge test: executable by an agent that never saw the planning conversation.
- Name exact files. "the auth module" fails; `src/auth/jwt.ts` passes.
- Out of scope is mandatory — scope creep is a planning failure, not an implementation choice.
- Context carries pattern files + pinned versions so `/implement` never re-researches.
- Wave is opt-in and provable: tasks share a wave ONLY if their Files lists are pairwise disjoint — the planner decides once, `/implement` re-checks the intersection mechanically before dispatching.
