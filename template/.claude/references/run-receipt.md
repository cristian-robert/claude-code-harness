# Run receipt

One fenced `yaml` block in `reports/<slug>-implementation-report.md`, after the report's section
table, with `receipt:` at column 0 — never inside a table cell and never indented. `/validate`
finds it with `grep -q '^receipt:'`, so a nested or indented block reads as absent and fails the
gate. It need not be the last thing in the file: autonomous `/evolve` appends a `## Assumptions`
section after it, which is expected and harmless — position never matters, column 0 does.

It answers "how was this produced?" after the terminal is gone — the report says WHAT changed,
the receipt says under WHICH harness and at WHICH tier, and which branch to undo.

Why it exists: `/evolve` mutates the harness on every cycle. Without a version stamp on the run,
a regression three cycles later cannot be attributed to the harness change that caused it — the
outer loop has no controlled variable. Traces to: audit gap, no per-run attribution (2026-08-30).

## The block

```yaml
receipt:
  plan: plans/<slug>-plan.md
  item: backlog/<id>-<slug>.md      # or: none
  harness_version: 3.1.0            # or: unpinned
  branch: feat/auth-refresh
  tier: deep
  knowledge: [knowledge-base/architecture.md, wiki/stack/fastapi/]   # or: []
  deviations: 2
  task_retries: {task-3: 2}         # or: {}
  gate: pending                     # /validate writes; always the LATEST result
  review: pending                   # /review-branch writes
```

## Field resolution — every value has a source; none is invented

| Field | Resolve from | Absent |
|---|---|---|
| `plan` | the invocation argument `/implement` ran on | never — no plan, no run |
| `item` | the plan's `item:` frontmatter | `none` |
| `harness_version` | `<tracking-root>/.claude/.init-meta.json` -> `newVersion`. **Resolve the tracking root first**, space-safely: `git worktree list --porcelain \| head -1 \| cut -d' ' -f2-` (the human-readable `git worktree list` is space-padded, so `awk '{print $1}'` truncates `/Dev/My Repo` to `/Dev/My` and the read then misses SILENTLY). This file is CLI-written and usually untracked, so `git worktree add` does not materialize it and a worktree-relative read always misses. NOT `previousVersion` (that is the ADOPTER APP's own package version, not a harness version — `cli/update.js` reads it via `getVersion(projectRoot)`) and not `firstInstalledVersion` (the adoption point). No file → `unpinned`, which is honest and expected on a repo that never ran `init` | `unpinned` |
| `branch` | `git branch --show-current` in the worktree — the branch this increment lives on | never |
| `tier` | the plan's `tier:` frontmatter | `deep` (the plan default) |
| `knowledge` | the plan's `Knowledge to load first:` entries actually read | `[]` |
| `deviations` | how many departures you recorded in the report's Deviations cell — you wrote them, so you know the count. Not a derived number: if the cell says `none`, this is `0` | `0` |
| `task_retries` | per-task attempt counts where >1 (the 3-attempt rule already tracks these) | `{}` |
| `gate` | `/validate` writes `GREEN` or `RED (N)` | `pending` |
| `review` | `/review-branch` writes `PASS (N rounds)` or `REQUEST_CHANGES (N rounds)` | `pending` |

**No computed git fields, by design.** An earlier draft recorded a `rollback_point` merge-base and
resolved the base branch, both via a shell snippet living in this file. Two review rounds found
the same defect class twice — `cmd | cut` and `cmd | sed` mask the real exit status, so `||`
fallbacks never fire and the field silently recorded an empty or wrong value. Executable logic in
a prose reference is untested by construction; ADR-007 already says such logic belongs in a
tested `.mjs`, not a markdown fence. `branch` replaces it: the agent reads it from git it is
already standing in, and it is enough to find the increment (see Rollback below).

**Also excluded — `cost_usd` and `tools_used`.** Neither is exposed to an agent inside Claude
Code; writing them means guessing, and a guessed number in an audit artifact is worse than no
number (`00-core.md` evidence rule). Autonomous runs DO record real cost per iteration, but that
driver ships with the FRAMEWORK repo, not with an adopted payload — do not expect its log inside
a harnessed project.

## Who writes what — three writers, one block, no rewrites

| Stage | Writes |
|---|---|
| `/implement` step 5 | the whole block, with `gate:` and `review:` as `pending` |
| `/validate` | the `gate:` line only |
| `/review-branch` | the `review:` line — and refreshes `gate:` if a step-4 round re-ran it |

Each later stage edits ONE line. Never regenerate a block that EXISTS — the implement-time fields
record the conditions the code was written under, and rewriting them destroys the attribution the
receipt exists for.

**`gate:` always holds the LATEST gate result, never a stale snapshot.** `/review-branch`'s fix
loop re-runs the full gate each round, so it refreshes `gate:` alongside `review:`. A receipt must
never end `gate: RED` under `review: PASS` — that pair describes a tree that no longer exists.

**Missing block on a current run — the fix is to write it, not to waive it.** "Never regenerate"
protects an existing block; it does not forbid creating an absent one. `/validate` finds no
receipt → the remedy is to write the block from the report and plan you already have (every field
above resolves from disk), then re-run the gate. That is completing a missing artifact, not
weakening a check.

## Adopting this on an existing repo

Nothing to backfill. `/validate` checks the receipt **only on the report for the run it is
validating** — the one step 0 resolved — and never scans other reports, so pre-receipt reports
sitting in `reports/` are simply never looked at. The one case that bites is deliberately
re-validating an old branch whose report predates the receipt: record it as a `Note:` line, say
the run predates the spec, and do not fail the gate for it.

## Reading a receipt back

- **Regression triage:** compare `harness_version` across the last few reports. A defect class
  that appears only above a version is a harness regression, not a model one — take it to
  `/evolve` as an incident with the version delta as evidence.
- **Rollback, unmerged:** `git worktree remove .worktrees/<slug>` and delete `branch`.
- **Rollback, merged:** revert THIS increment via its merge commit —
  `git log --merges --ancestry-path --oneline <branch>..HEAD` finds it, then `git revert -m 1 <sha>`.
  Squash-merged instead: revert the single squash commit. Never revert a `<sha>..HEAD` range on a
  shared base: it spans every other branch merged since, and aborts on merge commits.
- **Tier calibration:** `deviations` and `task_retries` high at `build` tier across several runs
  is the signal that the plan's `tier:` hint is being set too low.
