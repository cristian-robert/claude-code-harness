# Run receipt

One fenced `yaml` block at the END of `reports/<slug>-implementation-report.md`. It answers
"how was this produced?" after the terminal is gone — the report says WHAT changed, the receipt
says under WHICH harness, at WHICH tier, and WHERE to go back to.

Why it exists: `/evolve` mutates the harness on every cycle. Without a version stamp on the run,
a regression three cycles later cannot be attributed to the harness change that caused it — the
outer loop has no controlled variable. Traces to: audit gap, no per-run attribution
(2026-08-30). The rollback row additionally answers "undo this increment" after a merge, which
nothing else on disk records.

## The block

```yaml
receipt:
  plan: plans/<slug>-plan.md
  item: backlog/<id>-<slug>.md      # or: none
  harness_version: 3.1.0            # or: unpinned
  base: main
  rollback_point: 7f3a91c           # merge-base at branch start
  tier: deep
  knowledge: [knowledge-base/architecture.md, wiki/stack/fastapi/]   # or: []
  deviations: 2
  task_retries: {task-3: 2}         # or: {}
  gate: pending                     # /validate overwrites
  review: pending                   # /review-branch overwrites
```

## Field resolution — every value has a source; none is invented

| Field | Resolve from | Absent |
|---|---|---|
| `plan` | the invocation argument `/implement` ran on | never — no plan, no run |
| `item` | the plan's `item:` frontmatter | `none` |
| `harness_version` | `.claude/.init-meta.json` -> `newVersion` — the version this repo was last initialized or updated to. NOT `previousVersion` (the version it came FROM) and not `firstInstalledVersion` (the adoption point); both are also in that file and both are the wrong answer here | `unpinned` |
| `base` | `.claude/harness.json` `baseBranch`, else `origin/HEAD`, else main/master | — |
| `rollback_point` | `git merge-base HEAD <base>` — short SHA, captured in step 2 BEFORE the first task | — |
| `tier` | the plan's `tier:` frontmatter | `deep` (the plan default) |
| `knowledge` | the plan's `Knowledge to load first:` entries actually read | `[]` |
| `deviations` | count of rows in the report's Deviations section | `0` |
| `task_retries` | per-task attempt counts where >1 (the 3-attempt rule already tracks these) | `{}` |
| `gate` | `/validate` writes `GREEN` or `RED (N)` | `pending` |
| `review` | `/review-branch` writes `PASS (N rounds)` or `REQUEST_CHANGES (N rounds)` | `pending` |

**Deliberately excluded — `cost_usd` and `tools_used`.** Neither is exposed to an agent inside
Claude Code; writing them means guessing, and a guessed number in an audit artifact is worse
than no number (`00-core.md` evidence rule). Autonomous runs DO record real cost per iteration —
the driver reads it from the CLI's own JSON output at `loop/loop.log` (`loop/loop.mjs`). If a
future platform surfaces per-run cost to the session, add the row then, not before.

## Who writes what — three writers, one block, no rewrites

| Stage | Writes |
|---|---|
| `/implement` step 5 | the whole block, with `gate:` and `review:` as `pending` |
| `/validate` | overwrites the `gate:` line only |
| `/review-branch` | overwrites the `review:` line only (final verdict + round count) |

Each later stage edits ONE line. Never regenerate the block — the implement-time fields are the
record of the conditions the code was written under, and rewriting them destroys the attribution
the receipt exists for. A stage that cannot find the report says so in its blocker line rather
than starting a fresh receipt.

## Capturing `rollback_point` early

`/implement` step 2 creates the branch and worktree. Capture the merge-base THERE, before any
code, and hold it for step 5:

```bash
git merge-base HEAD "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||' || echo main)" | cut -c1-7
```

Captured after the work, this SHA is still correct (merge-base is stable against a branch that
only added commits) — but capturing it at branch time also proves the branch point was read
rather than reconstructed.

## Reading a receipt back

- **Regression triage:** compare `harness_version` across the last few reports. A defect class
  that appears only above a version is a harness regression, not a model one — take it to
  `/evolve` as an incident with the version delta as evidence.
- **Rollback:** `git revert --no-commit <rollback_point>..HEAD` on the merged branch, or
  `git worktree remove .worktrees/<slug>` if it never merged.
- **Tier calibration:** `deviations` and `task_retries` high at `build` tier across several runs
  is the signal that the plan's `tier:` hint is being set too low.
