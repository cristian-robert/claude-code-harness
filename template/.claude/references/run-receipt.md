# Run receipt

One fenced `yaml` block as the LAST thing in `reports/<slug>-implementation-report.md` — after
the report's section table, at column 0, not inside a table cell. `/validate` finds it with
`grep -q '^receipt:'`, so an indented or table-nested block reads as absent and fails the gate.

It answers "how was this produced?" after the terminal is gone — the report says WHAT changed,
the receipt says under WHICH harness, at WHICH tier, and WHERE to go back to.

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
  gate: pending                     # /validate overwrites — PRE-review snapshot
  review: pending                   # /review-branch overwrites
```

## Field resolution — every value has a source; none is invented

| Field | Resolve from | Absent |
|---|---|---|
| `plan` | the invocation argument `/implement` ran on | never — no plan, no run |
| `item` | the plan's `item:` frontmatter | `none` |
| `harness_version` | `<tracking-root>/.claude/.init-meta.json` -> `newVersion`. **Resolve the tracking root first** (first line of `git worktree list`) — this file is CLI-written and usually untracked, so `git worktree add` does not materialize it and a worktree-relative read always misses. NOT `previousVersion` (that is the ADOPTER APP's own package version, not a harness version — `cli/update.js` reads it via `getVersion(projectRoot)`) and not `firstInstalledVersion` (the adoption point) | `unpinned` |
| `base` | `.claude/harness.json` `baseBranch`, else `origin/HEAD`, else main/master | — |
| `rollback_point` | `git merge-base HEAD <base>` — short SHA, captured in step 2 BEFORE the first task (snippet below) | — |
| `tier` | the plan's `tier:` frontmatter | `deep` (the plan default) |
| `knowledge` | the plan's `Knowledge to load first:` entries actually read | `[]` |
| `deviations` | how many departures you recorded in the report's Deviations cell — you wrote them, so you know the count. Not a derived number: if the cell says `none`, this is `0` | `0` |
| `task_retries` | per-task attempt counts where >1 (the 3-attempt rule already tracks these) | `{}` |
| `gate` | `/validate` writes `GREEN` or `RED (N)` | `pending` |
| `review` | `/review-branch` writes `PASS (N rounds)` or `REQUEST_CHANGES (N rounds)` | `pending` |

**Deliberately excluded — `cost_usd` and `tools_used`.** Neither is exposed to an agent inside
Claude Code; writing them means guessing, and a guessed number in an audit artifact is worse
than no number (`00-core.md` evidence rule). Autonomous runs DO record real cost per iteration,
because the loop driver reads it from the CLI's own JSON output — but that driver ships with the
FRAMEWORK repo, not with an adopted payload, so do not expect its log inside a harnessed
project. If a future platform surfaces per-run cost to the session, add the row then, not before.

## Who writes what — three writers, one block, no rewrites

| Stage | Writes |
|---|---|
| `/implement` step 5 | the whole block, with `gate:` and `review:` as `pending` |
| `/validate` | overwrites the `gate:` line only |
| `/review-branch` | overwrites the `review:` line only (final verdict + round count) |

Each later stage edits ONE line. Never regenerate the block — the implement-time fields are the
record of the conditions the code was written under, and rewriting them destroys the attribution
the receipt exists for.

**`gate:` is the PRE-review snapshot.** `/review-branch`'s fix loop re-runs the full gate on each
round, so a receipt can legitimately end `gate: RED (2)` / `review: PASS (3 rounds)` — the tree
that failed no longer exists. Read `gate:` as "state when validation first ran", and `review:` as
the final word. A review round that re-runs the gate MAY refresh `gate:` to its latest result;
it must not silently leave a stale value while claiming the branch is green.

## Adopting this on an existing repo

Nothing to backfill. `/validate` checks the receipt **only on the report for the run it is
validating** — the one step 0 resolved — and never scans other reports, so pre-receipt reports
sitting in `reports/` are simply never looked at. The one case that bites is deliberately
re-validating an old branch whose report predates the receipt: record it as a `Note:` line, say
the run predates the spec, and do not fail the gate for it.

(An earlier draft grandfathered by comparing mtimes against this file. That was wrong twice over:
every `init`/`update` re-copies the payload with `fs.copyFileSync`, which restamps this file's
mtime to "now" — so the boundary tracked *last install*, not when the spec landed — and `[ -nt ]`
against an absent file is shell-dependent, silently disabling the gate under zsh and failing
every report under sh. Scope beats timestamps.)

## Capturing `rollback_point` early

`/implement` step 2 creates the branch and worktree. Capture the merge-base THERE, before any
code, and hold it for step 5. Resolve `<base>` in the same order the `base` row above uses —
`harness.json` first, so a project on `develop` does not silently record a SHA against `main`:

```bash
base=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(".claude/harness.json","utf8")).baseBranch||"")}catch(e){}')
[ -n "$base" ] || base=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')
for c in "$base" main master; do
  [ -n "$c" ] && git rev-parse --verify -q "$c" >/dev/null 2>&1 && { base=$c; break; }
done
git rev-parse --verify -q "$base" >/dev/null 2>&1 \
  && git merge-base HEAD "$base" | cut -c1-7 \
  || git rev-list --max-parents=0 HEAD | tail -1 | cut -c1-7   # no base ref: first commit
```

Two traps this avoids, both verified by running them:

- `cmd 2>/dev/null | sed ... || echo main` does NOT work. `||` binds to the whole pipeline, whose
  exit status is `sed`'s (always 0), so the fallback never fires and `base` is empty —
  `git merge-base HEAD ""` then dies with "Not a valid object name" in exactly the repos (no
  `origin/HEAD`) the fallback existed for.
- Defaulting to a bare `main` is not enough either: on a `master`-default repo `main` does not
  exist and merge-base dies the same way. Every candidate must be existence-checked with
  `git rev-parse --verify`, which is why this is a loop and not a `${base:-main}`.

Captured after the work, this SHA is still correct (merge-base is stable against a branch that
only added commits) — but capturing it at branch time also proves the branch point was read
rather than reconstructed.

## Reading a receipt back

- **Regression triage:** compare `harness_version` across the last few reports. A defect class
  that appears only above a version is a harness regression, not a model one — take it to
  `/evolve` as an incident with the version delta as evidence.
- **Rollback, unmerged:** `git worktree remove .worktrees/<slug>` and delete the branch.
- **Rollback, merged:** revert THIS increment only. `<rollback_point>..HEAD` is wrong on a shared
  base — it spans every other branch merged since, and aborts on merge commits. Use the merge
  commit: `git revert -m 1 <merge-commit>`. Squash-merged instead: `git revert <squash-commit>`.
  `rollback_point` is what you diff against to see the increment (`git diff <rollback_point>..`),
  not what you revert to.
- **Tier calibration:** `deviations` and `task_retries` high at `build` tier across several runs
  is the signal that the plan's `tier:` hint is being set too low.
