# Work tracking — backend adapter contract

Read by /backlog, /plan-work, /implement, /review-branch, /accept, /sprint before any tracking operation. One canonical item model (`.claude/references/item-template.md`); the backend only changes where state is mirrored. Chosen once at /harness-init.

## Config (`.claude/harness.json`)

```json
"workTracking": { "backend": "files", "method": "kanban", "wipLimit": 3 }
```

| Key | Values | Notes |
|---|---|---|
| backend | `"files"` \| `"github"` \| `"none"` | none → pipeline runs itemless; skip every op below |
| method | `"kanban"` \| `"scrum"` | scrum adds `points`/`sprint` fields, `sprints/<n>.md`, /sprint ceremonies |
| wipLimit | number, optional | kanban advisory — /backlog board warns above it, never blocks |

## Files are canonical in BOTH backends

`backlog/<id>-<slug>.md` is always written and always updated first — github mode ADDS mirroring (labels, milestones, comments) for team visibility. Truth order: code > item file > issue. This is what makes degrading lossless.

## The tracking root — items live OUTSIDE the code branches

`backlog/` and `sprints/` live in the PRIMARY checkout only (the tracking root — first line of `git worktree list`; in a plain checkout that is the cwd). The tracking root **stays on the base branch** (`main`/`master`); feature work lives in worktrees, so item state sits outside every code branch — boards/WIP/sprints read one coherent global view and item files can never merge-conflict. From a worktree, skills edit the item at `<tracking-root>/backlog/...` and commit it there immediately — message `track(<id>): <event>` — which guard.mjs permits on ANY branch (including main) as long as the staged paths are all under `backlog/` or `sprints/`. `plans/` and `reports/` are work artifacts: they travel WITH the code branch and merge with it. (`/plan-work` writes the plan as a plain file and creates no branch — it survives `/clear` on disk; `/implement` creates the feature branch + worktree off base and moves the plan into it as the first commit. The tracking root never leaves base.)

## Operations

| Operation | files mode | github mode (adds, after the files edit) |
|---|---|---|
| create item | Write `backlog/<id>-<slug>.md` per item-template.md + commit `track(<id>): created` | `n=$(gh issue create --title "<id> <title>" --body-file backlog/<id>-<slug>.md --label "type:<type>,status:backlog,priority:<P0\|P1\|P2>" \| grep -oE '[0-9]+$')` — `gh issue create` prints the new issue URL to stdout; take its trailing number as `<n>` and append the mirror line `issue: #<n>` to the item's Log. This capture is load-bearing: every later github op resolves `<issue#>` from it, so if it fails the whole github mirror degrades to files at this first hop (`mirror skipped (no issue number captured)`) |
| type / priority change | edit frontmatter + Log line | `gh issue edit <issue#> --add-label priority:P0 --remove-label priority:P1` (same pattern for type:*) |
| refine (body change) | edit the item file | `gh issue edit <issue#> --body-file backlog/<id>-<slug>.md` — re-mirror the body |
| set status | edit `status:` frontmatter + append Log line | `gh issue edit <issue#> --add-label status:doing --remove-label status:ready` |
| link plan / evidence | append `## Log` line | `gh issue comment <issue#> --body "Plan: plans/<slug>-plan.md"` (same pattern for report/review lines) |
| board | grep frontmatter across `<tracking-root>/backlog/*.md`, group by status; `accepted` collapses to one count line (both backends — the board derives from the CANONICAL files) | `gh issue list --state open ...` is an optional cross-check only — mirror drift → note it |
| sprint create (scrum) | write `sprints/<n>.md` + stamp each committed item's frontmatter `sprint: <n>` | `m=$(gh api repos/{owner}/{repo}/milestones -f title="Sprint <n>" -f due_on="<YYYY-MM-DDT00:00:00Z>" --jq .number)` — capture the returned `.number` and record `milestone: #$m` in `sprints/<n>.md` (this number feeds the sprint-close PATCH — load-bearing, same as the issue-number capture) — then per item `gh issue edit <issue#> --milestone "Sprint <n>"` — there is NO native `gh milestone`; milestones go via `gh api` only |
| sprint close (scrum) | mark `sprints/<n>.md` closed | `gh api -X PATCH repos/{owner}/{repo}/milestones/<milestone-number> -f state=closed` |
| epic link | child carries `parent: <id>` frontmatter (canonical) | native sub-issue link via REST: `gh api --method POST repos/{owner}/{repo}/issues/<epic#>/sub_issues -F sub_issue_id=$(gh api repos/{owner}/{repo}/issues/<child#> --jq .id)` (`-F` sends the child's numeric DATABASE id as a typed integer — `-f` would send a string and 422). Optional — the `parent:` frontmatter is the source of truth; skip the mirror on any API error |
| sprint carry-over / return (scrum) | carry: set `sprint: <n+1>`; return: clear `sprint:` — plus Log line | carry: file-only at close (milestone "Sprint <n+1>" does not exist yet — the attach happens at the next /sprint plan stamp step, which includes carried items); return: `gh issue edit <issue#> --remove-milestone` |
| accept-close | set `status: accepted` + one Log line per criterion (verdict + evidence) | `gh issue close <issue#> -r completed -c "<one-line evidence summary>"; gh issue edit <issue#> --remove-label status:done` — closed = accepted (no `status:accepted` label); drop the stale `status:done` so a closed issue carries no live status label |

**`<issue#>` resolution**: always the `issue: #<n>` Log line inside the item file (grep it) — NEVER the backlog id; no mirror line → that op's precondition fails (files edit stands, append `mirror skipped (no issue mapping)`).

Label bootstrap (once, at /harness-init when backend = github):

```bash
for l in type:epic type:story type:task type:bug; do gh label create "$l" -c "1D76DB" -f; done
for l in status:backlog status:ready status:doing status:review status:done; do gh label create "$l" -c "0E8A16" -f; done
for l in priority:P0 priority:P1 priority:P2; do gh label create "$l" -c "D93F0B" -f; done
```

## Degrade rules (check before EVERY github operation)

Preconditions — all three: (1) `gh` on PATH (`command -v gh`); (2) auth green (`gh auth status` exits 0); (3) a resolvable remote — `git remote get-url origin`, or any remote from `git remote` if `origin` is absent (pass `-R <owner>/<repo>` explicitly when the remote is not `origin`).

- ANY precondition missing → run the files-mode column only and SAY so in one line: `tracking degraded to files: <reason>`. Do not retry, do not install gh, do not prompt for login mid-pipeline.
- A github call that fails anyway (offline, 403/404, rate limit — content creation caps at 80/min · 500/hr) → the files edit already happened; append a Log line `mirror skipped (<error>)` and continue.
- NEVER block work on a tracking failure — tracking is metadata, code is truth. A red gh command is a one-line note, never a stop.
- Fork or multiple remotes → pass `-R <owner>/<repo>` on every `gh issue`/`gh label` call; `gh api` takes NO `-R` — set `GH_REPO=<owner>/<repo>` for that invocation (or substitute owner/repo literally in the path). An unresolvable base repo counts as precondition (3) failing.

## No Projects v2 — deliberate

This harness never touches `gh project`. Projects v2 mutations require the `project` OAuth scope, and `gh auth refresh -s project` opens an interactive browser flow — the scope cannot be granted headlessly, and the default Actions `GITHUB_TOKEN` cannot reach Projects at all. Labels + milestones cover status and sprints with plain repo-write tokens everywhere, including CI; the board is the derived `/backlog board` view.

## Optional backend: Backlog.md CLI

Backlog.md (github.com/MrLesk/Backlog.md) already implements this file-per-item + derived-board shape — `backlog board`, a local web UI, machine-parseable AC markers, an MCP server — and is itself dogfooded by AI agents. A project may adopt it as a drop-in replacement for the files-mode column (its CLI performs the same operations); map its status names to this schema in the project AGENTS.md and keep item files as the source of truth. It is a dependency, not a default — the ratchet must earn it.
