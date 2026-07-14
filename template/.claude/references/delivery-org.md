# Delivery org — roles as hats, ceremonies as commands

Load-on-cite map of the optional agile layer (activated by `/harness-init`; `workTracking`
in `.claude/harness.json`). Roles are **hats worn by pipeline phases + checker agents** — no
standing personas. The Rosetta stone from agile vocabulary to what this harness actually runs.

## Roles → where the hat lives

| Role | Hat lives in | Human or agent |
|---|---|---|
| Architect | `/plan-work` design step; `~/.claude/agents/architect-agent` KB when present | agent (phase + KB query) |
| Product Owner | priority calls at `/backlog`, scope cut at `/sprint plan` | **human** |
| Product Manager | `/backlog board` + `/backlog next`, `/sprint` ceremonies | agent (phase) |
| Business Analyst | `/backlog new` + `/backlog refine` (story + criteria) | agent (phase) |
| Dev | `/implement` (primary session) | agent (phase) |
| QA | `/validate` + `qa-evaluator` + `~/.claude/agents/tester-agent` | agent (fresh checker) |
| Reviewer | `code-reviewer` agent inside `/review-branch` | agent (fresh checker) |
| Stakeholder | accept/reject verdict at `/accept` | **human** |
| Security | `code-reviewer` checklist + `/review-branch` security lens (global `security-audit` skill when the diff touches auth/crypto/input/secrets/PII) + dependency audit | agent (fresh checker, diff-triggered) |

Human gates (PO priority, sprint scope, Stakeholder acceptance) are never auto-decided unless
autonomous mode is explicitly declared — see `.claude/references/autonomous-mode.md`.

## Ceremonies → the one mechanism each maps to

| Ceremony | Run it with | Notes |
|---|---|---|
| Standup | session-start orientation (auto — branch, gate, board counts) | pre-existed; no command to run |
| Backlog refinement | `/backlog refine <id>` | INVEST + observably-verifiable AC; PO approves → `ready` |
| Sprint planning | `/sprint plan` (scrum mode only) | the human scopes the batch |
| Per-item acceptance (review/demo) | `/accept backlog/<id>-<slug>.md` | per-criterion evidence table, human verdict |
| Sprint Review (batch increment) | `/sprint close` (scrum only) | accepted/rejected rollup of the sprint's items for one stakeholder pass |
| Retrospective | `/evolve` | `/accept` and `/sprint close` feed it, never replace it |
| Definition of Done | Stop gate + `/validate` GREEN, then criteria `accepted` | code-done and product-done are distinct gates |

## Work-item lifecycle (the story contract)

One item = one file `backlog/<id>-<slug>.md` (slug shared with `plans/`/`reports/`). Sections
carry ownership: `## Story` (BA) · `## Acceptance criteria` (BA drafts, PO approves — the SINGLE
home of AC, plans reference it) · `## Context` (`[Source: …]` citations) · `## Log` (append-only
evidence trail). Status, each transition owned by one skill:

```
backlog --/backlog refine (PO approves AC)--> ready --/implement--> doing
  --(report written)--> review --/review PASS--> done --/accept (human)--> accepted
  (reject path: /accept → ready)
```

Items live in the **tracking root** (primary checkout, stays on the base branch) — see
`.claude/references/work-tracking.md` for backend mechanics (files ↔ GitHub) and why boards are
always derived views, never committed files.

Full rationale and the evidence behind every choice: `docs/06-delivery-org.md` in the PHE repo.
