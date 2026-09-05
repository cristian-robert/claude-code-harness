# 06 · Delivery Org — Roles as Hats, Work as Files

The optional agile layer: one canonical work-item model, three skills (`/backlog`, `/sprint`,
`/accept`), and a delivery-org role map — with zero new standing agents. `/harness-init`
switches it on (`workTracking` in `harness.json`); projects that skip it lose nothing else.

## The tension, and how the evidence resolves it

The ask is a full delivery org — Architect → PO → PM → BA → Dev → QA → Stakeholder. The
reference implementation of exactly that roster is BMAD-METHOD — also the named
"over-engineered and hard to mold" cautionary example (docs/00). Two findings resolve it
(v3 research brief, `docs/99-sources.md` v0.3 section):

- **BMAD retreated first.** Its own v4→v6 rewrite compressed 10 agent personas to 6 and
  folded Scrum-Master and QA from standing agents into skills — the maintainers' implicit
  admission that role-per-agent was over-specified.
- **Anthropic's economics.** Multi-agent fan-out costs ~15x single-chat tokens and struggles
  "with tasks requiring shared context or heavy inter-agent coordination (like most coding
  work)" — and delivery roles are maximally coupled: every role operates on the same
  artifacts. The one *proven* multi-context win is evaluator separation (self-grading
  reliably skews positive).

Resolution: **authoring roles are hats worn by pipeline phases in one session; checker roles
are fresh subagents at the author↔checker boundary; product decisions stay human.** Skills
name the active hat in their phase headers, so the org is visible in the transcript and in
the work-item file — not in a roster of running personas.

## Role map

| Role | Hat lives in | Human or agent |
|---|---|---|
| Architect | `/plan-work` design step; retrieval delegated to global `architect-agent` KB | agent (phase + KB query) |
| Product Owner | priority calls at `/backlog`, scope cut at `/sprint plan` | **human** |
| Product Manager | `/backlog board` + `/backlog next`, `/sprint` ceremonies | agent (phase) |
| Business Analyst | `/backlog new` + `/backlog refine` (story + criteria drafting) | agent (phase) |
| Dev | `/implement` (the primary session) | agent (phase) |
| QA | `/validate` + `qa-evaluator` + global `tester-agent` | agent (fresh checker) |
| Reviewer | `code-reviewer` agent inside `/review-branch` | agent (fresh checker) |
| Stakeholder | accept/reject verdict at `/accept` | **human** |
| Security | `code-reviewer` checklist + `/review-branch` security lens (global `security-audit` skill when the diff touches auth/crypto/input/secrets/PII) + dependency audit | agent (fresh checker, diff-triggered) |

## Ceremony map — what already existed is not re-encoded

| Ceremony | PHE mechanism | Status |
|---|---|---|
| Standup | session-start orientation (hook prints branch / gate / plan state) | pre-existed |
| Backlog refinement | `/backlog refine` — INVEST + observably verifiable criteria | new: highest-value import |
| Sprint planning | `/sprint plan` (scrum mode only; the human scopes the batch) | new |
| Per-item acceptance (review/demo) | `/accept` — per-criterion evidence table, human verdict | new: the genuine gap |
| Sprint Review (batch increment) | `/sprint close` — accepted/rejected rollup (scrum only) | the batch demo view, distinct from per-item `/accept` |
| Retro | `/evolve` | pre-existed — `/accept` and `/sprint close` feed it, never replace it |
| Definition of Done | Stop gate + `/validate` GREEN, extended by "criteria accepted" | pre-existed — layer adds only the acceptance half |

Ceremonies that only synchronize humans (timeboxes as such) got no mechanism at all;
velocity is recorded at /sprint close as a sizing aid for the next plan — forecasting stays human.

## The story contract (the load-bearing BMAD import)

One work item = one file: `backlog/<id>-<slug>.md` — zero-padded numeric `id`, slug shared
with `plans/<slug>-plan.md` and `reports/<slug>-*.md`, so item↔plan↔report linkage is free
by convention. Frontmatter: `id`, `type: epic|story|task|bug`, `status`,
`priority: P0|P1|P2`, `created`, `parent` (epic children), plus `points`/`sprint` in scrum
mode. Body sections carry ownership — BMAD's per-section write-lock, the one mechanism its
critics and its fans agree earns its cost:

| Section | Writer | Contract |
|---|---|---|
| `## Story` | BA hat | as-a / I-want / so-that |
| `## Acceptance criteria` | BA drafts; PO (human) approves | checkboxes, each observably verifiable; **the single home of AC — plans reference it, never duplicate it** |
| `## Context` | BA/Architect hats | every claim cites `[Source: file:line or URL]` — no invented architecture |
| `## Log` | any pipeline skill, append-only | Dev/QA/review evidence lines; the cross-session memory trail |

Status flow — each transition owned by exactly one skill, never edited ad hoc:

```
backlog --/backlog refine (PO approves AC)--> ready --/implement--> doing
  --(implementation report written)--> review --/review PASS--> done
  --/accept (human verdict)--> accepted
```

`/plan-work` owns no transition — it links `plans/<slug>-plan.md` into the item's Log (and warns when planning an unapproved `backlog`-status item).

Item files live in the TRACKING ROOT (the primary checkout — code branches never edit them; guard permits narrow `track(<id>):` commits on any branch), so boards, WIP counts, and sprint stamps read one coherent global view and item files cannot merge-conflict. Files mode: the owning skill edits `status:` and appends one Log line. GitHub mode:
`gh issue edit --add-label/--remove-label status:*`; `/accept` closes the issue.
`/accept` renders a per-criterion evidence table for the human; in autonomous runs it logs
under `## Assumptions` and proceeds only when every criterion has evidence. Autonomous mode has
ONE activation path — the human's own words, in the current session; no config switch, no
inherited plan text (`template/.claude/references/autonomous-mode.md`; traces to 2026-09-05).

## Kanban vs Scrum — one model, one flag

Kanban is the base flow (states above; WIP limit advisory). Scrum is
`workTracking.method: "scrum"` in `harness.json`: the same item model plus `points`/`sprint`
fields, `sprints/<n>.md` files, and the `/sprint plan|close` ceremonies. Not two
implementations — scrum is "how much of the human-coordination layer to switch on."

## Backend adapter — files or GitHub Issues

The item model is canonical; the backend is an adapter over the same operations, chosen at
`/harness-init` (mechanics and exact commands: `template/.claude/references/work-tracking.md`).

| Backend | Substrate | Degrade rule |
|---|---|---|
| `files` (default) | `backlog/*.md` frontmatter; board = grep at display time | — |
| `github` | Issues + `status:*`/`priority:*` labels + milestones-as-sprints via `gh api` | any `gh`/auth/remote failure → files mode for that operation, noted in Log |

**Sharp edge — why no Projects v2:** Projects needs the `project` OAuth scope, and
`gh auth refresh -s project` opens an interactive browser flow — there is no headless path
to mint it, and the default Actions token cannot reach Projects at all. Labels + milestones
work everywhere with default credentials. The board is always a DERIVED view (grep or
`gh issue list`), never a committed index file — a committed board is a guaranteed
merge-conflict hotspot; per-item files structurally cannot conflict across items.

## What we did NOT build

| Rejected | Evidence line |
|---|---|
| Standing role personas (PO/PM/BA/… subagents) | BMAD v6 folded its own personas into skills; ~15x token multiplier on coupled work (Anthropic) |
| PRD → sharded-doc → story-chain artifacts | same build: 12 min OpenSpec vs 5.5 h BMAD; "$800–2,000+/month per developer" reports |
| Committed board/index file | git merges collide on same-file lines; every surveyed file-per-item tool derives its board at read time |
| Simulated stakeholder / auto-accept | "An AI agent cannot be a Product Owner" (practitioner consensus); verdicts stay human, assumptions logged |
| Required story points | human forecasting artifact; agents don't tire — optional, scrum-only, never agent-invented |

## Sources

- v3 research brief — vault `inbox/research/phe-harness/v3-agile-layer.md` (BMAD deep dive, gh CLI mechanics, file-backlog survey, ceremony distillation)
- BMAD-METHOD — v4.44.1 story-tmpl write-locks + create-next-story; v6 agents→skills compression
- Anthropic — multi-agent research system (15x, coupled-work warning); harness-design (evaluator separation)
- Backlog.md · dstask · taskmd — file-per-item + derived-board convergence
- gh CLI manual + GitHub REST docs — label/milestone/sub-issue mechanics; the Projects-v2 scope constraint
