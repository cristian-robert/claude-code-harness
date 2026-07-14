---
name: plan-work
description: "Architect hat: turn a ticket or brain dump into an executable plan file. Writes plans/<slug>-plan.md."
disable-model-invocation: true
argument-hint: "<backlog/<id>-<slug>.md | ticket-id | free-form brain dump>"
allowed-tools: Bash(git diff *) Bash(git log *) Bash(git status *) Bash(git merge-base *) Bash(ls *)
---

# /plan-work

Turn **the invocation argument** (the text typed after the command) into an executable plan at `plans/<slug>-plan.md`. No code is written in this stage; `/implement` runs the plan in a fresh session.

## Current state

Injected at invocation — ground truth, do not re-derive. Working tree:

!`git status --porcelain`

Existing plans (pick a slug that does not collide):

!`ls plans/ 2>/dev/null`

## 0. Work item (when workTracking is active)

- The invocation argument is a backlog item path (`backlog/<id>-<slug>.md`) → read the item. Its `## Acceptance criteria` are this plan's success contract: the plan REFERENCES them ("Verification: satisfies AC in backlog/<id>-<slug>.md") and NEVER copies them — the item is their single home. Reuse the item's slug for the plan filename. `plans/<slug>-plan.md` already exists for this item (reject → re-plan round) → REVISE it in place — the item Log preserves prior rounds; the no-collision rule below applies only to NEW slugs.
- Free-text invocation argument while `harness.json` `workTracking` is active → offer to create the item first via `/backlog new`; proceed without one only if the user declines.

## 1. Clarify first — do not guess

Extract goal, affected surfaces, and acceptance criteria from the invocation argument. Collect ALL open questions and ask them in ONE batched, numbered message. Wait for answers before planning — a wrong guess here costs a full implement cycle.

Autonomous mode (activation: `.claude/references/autonomous-mode.md` — never self-inferred) only: skip the questions, pick the most conservative reading, and log every assumption under `## Assumptions` inside the plan's Risks & assumptions section.

## 2. Route by work type

| Work type | Before planning |
|---|---|
| New feature / unexplored design space | Invoke `superpowers:brainstorming` via the Skill tool |
| Bug | Invoke `superpowers:systematic-debugging` via the Skill tool; capture the confirmed root cause in the plan's Context |
| Mechanical (rename, dep bump, config) | Skip straight to step 4 |

## 3. Load knowledge

Match the work against this repo's knowledge skills (architecture-map etc.) and the AGENTS.md on-demand context table; READ every match NOW. Then LIST the consulted knowledge skills and context files in the plan's Context section under `Knowledge to load first:` — `/implement` runs after `/clear` and reloads only what the plan names.

## 4. Explore the codebase

- Locating files/symbols → built-in Explore. Understanding behavior or impact ("how does auth flow?", "what would X touch?") → dispatch `scout` (it loads CLAUDE.md; Explore does not). Comparisons → 2–4 scouts in parallel on DISJOINT questions; this stage is the pipeline's one natural fan-out point. Pin `tier: build` and effort per `.claude/references/dispatch-protocol.md`; scouts return ≤40-line briefs, never dumps.
- External tools/services the plan builds against (major frameworks & services — NOT transitive deps): read `wiki/stack/<tool>/` frontmatter for version + freshness; on a miss/stale/version-mismatch run `/research <tool>@<pinned>`. Cite the `wiki/stack/<tool>/` path in the plan's Context. Never plan tool usage from memory. Detail: `.claude/references/research-and-docs.md`.
- Read directly only what the plan will name: files to be modified (real line numbers), the closest existing analogue, relevant rules/context modules.

## 5. Draft (Architect hat) — superpowers:writing-plans

Invoke `superpowers:writing-plans` via the Skill tool for drafting discipline. ENFORCE the shape in `.claude/references/plan-template.md` regardless of what the skill prefers — repo shape wins on conflict.
Architect hat: before placing new modules/routes/tables/endpoints — `~/.claude/agents/architect-agent/AGENT.md` exists → dispatch it via the Agent tool (include that AGENT.md path; follow its RETRIEVE protocol); absent → rely on the architecture-map knowledge skill alone and say so.

Fallback (plugin unavailable), condensed:
- Decompose into tasks an enthusiastic junior engineer with no project context could execute.
- Per task: Files (exact paths) / Steps / Validate (exact command + expected result) / Acceptance criteria.
- Order by dependency; size each task 2-30 min.
- Fill Context with files-to-read-first, pattern files, pinned library versions.
- Add end-to-end verification proving the feature works, not just that tasks ran.
- State out of scope explicitly — it is mandatory.

## 6. Write to disk

MUST use the Write tool to create `plans/<slug>-plan.md` (slug: kebab-case from ticket or title). This is a required deliverable, not optional — `/implement` reads it from disk, so the file must exist. Do NOT print the plan body to the terminal.

Planning a backlog item → set plan frontmatter `item: backlog/<id>-<slug>.md`, append to the item's `## Log` (in the tracking root): `<YYYY-MM-DD> plan: plans/<slug>-plan.md`, and commit that item edit there as `track(<id>): plan linked` (guard permits tracking-only commits on any branch; github mode: mirror per work-tracking.md, degrade rules apply). Status stays untouched — /plan-work owns no status transition. Item still `status: backlog` → its AC are not PO-approved: the ONLY unblock is `/backlog refine <id>` (refine owns backlog→ready; an in-chat "approved" would never land on disk). Autonomous mode: run the refine transition yourself and log under `## Assumptions`.

## 7. Self-assess

Fill plan frontmatter per the template: `complexity: S|M|L|XL`, `confidence: N/10` (that `/implement` succeeds first-pass), `tier:` implementer hint (`deep` default; `build` only when this plan already specifies the change step by step). /review-branch inverts it to choose the reviewer, so an honest tier matters twice.

- Complexity XL → decompose into milestone plan files; THIS plan covers only the first milestone. Each later milestone gets its own `/plan-work` run when its turn comes.
- Tasks provably independent (pairwise-disjoint `Files:` lists, no ordering) → mark them with the same `Wave: N` per the template rule; otherwise omit Wave — sequential is the default. One judgment, made NOW by the planner, not re-litigated at implement time.

If confidence <= 6: state concretely what would raise it (unanswered question, unexplored subsystem, missing test harness) and ask the user before handing off — do not emit the Next line until resolved.

## Output contract

Artifact to disk; no terminal recap of the plan. End with exactly one line:

No branch, no worktree here — `/plan-work` only writes the plan file and commits the item edit:

1. `plans/<slug>-plan.md` stays as a normal file in the primary checkout (the tracking root, on its base branch). `/clear` resets the conversation, not the filesystem — the file persists for `/implement` to pick up. `/implement` creates the feature branch + worktree and moves the plan into it (do NOT create a branch here — that is what broke the fresh-worktree handoff).
2. The item edit was already committed above as a tracking-only commit on the base branch, keeping the tracking root globally coherent (ADR: `.claude/references/work-tracking.md`).

`Planned <slug> · Next: /clear then /implement plans/<slug>-plan.md`

Blockers replace that line.
