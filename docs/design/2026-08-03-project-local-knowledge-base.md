# 2026-08-03 · Project-local `knowledge-base/` — knowledge moves into the repo

PO directive: "I need that this harness enforce a folder in the project `knowledge-base` where we
should keep it from now on." Three scenarios: clean project · harness-installed project whose
knowledge sits in the shared vault · project that had local knowledge, migrated OUT to the vault,
and now migrates BACK (reconciliation, including legacy folders under arbitrary names).

This design reverses ADR-001. It was adversarially reviewed before adoption (5 hostile lenses +
per-lens refutation, 2026-08-03); every finding that survived refutation is folded in below, and
the survivors that were *not* fixed are named in "Known limits".

## Current wiring (audited 2026-08-03)

PHE stores **zero** project knowledge in the repo. `docs/05-knowledge-layer.md:10` decides the vault
is "the SOLE source of truth for project knowledge", explicitly rejecting mirrors ("mirrors drift,
and the first divergence silently forks the truth"). Linkage is one config key —
`.claude/harness.json → vault {mode, path}` — written once by `cli/init.js:471`, never re-asked on
`update`, never validated against the filesystem, and consumed by exactly one line of runtime code
(`template/.claude/hooks/session-start.mjs:68-79`). Everything else is prose:
`template/.claude/references/vault-protocol.md` (39 lines) is cited by ~15 template files, and
`architect-agent.md:9` hardcodes "your knowledge base is the project's wiki IN THE OBSIDIAN VAULT —
not a copy inside the repo".

## Decisions locked (PO, 2026-08-01 → 08-03)

| # | Decision |
|---|---|
| 1 | **Hybrid**: local `knowledge-base/` for project-scoped knowledge; the shared store survives for evergreen only |
| 2 | `knowledge-base/` is **git-tracked and reviewed** |
| 3 | Vault-copy disposition asked **per run**: move / copy / archive+move |
| 4 | Scope: `template/` + `cli/` + `docs/` + dogfood PHE itself |
| 5 | Enforcement is **layered**: rule + structural gate + hook on the old path |
| 6 | KB shape: four core files + `inbox/` + `research/` |
| 7 | Obsidian conventions kept (frontmatter, Index Law, wikilinks); folder is Obsidian-openable |
| 8 | Reconciliation **merges**, writes a report, asks only on genuine conflicts |
| 9 | Legacy detection: curated candidates **plus** full root inventory, always confirmed |
| 10 | Shared store = the same vault, gutted: `projects/` leaves, `wiki/` + `agent-kb/` + `stack/` stay |
| 11 | Rollout: `update` flips config + arms a marker; Claude reconciles at next `/harness-init` |
| 12 | Retrieval: local `_index.md` walk (no CLI); shared keeps the existing ladder |
| 13 | Inbox splits: project capture local, tool-research staging stays shared |
| 14 | Promotion **MOVES**; the local file is deleted and `_index.md` keeps a pointer line |
| 15 | Secrets: pointer index stays; a mechanical scan guards it |
| 16 | Writes happen mid-work; one `docs(kb):` commit at `/evolve` |
| 17 | `knowledge-base/` **travels with the code branch** — a work artifact like `plans/`+`reports/`, NOT a tracking-root file |
| 18 | Reviewer isolation **reversed** — the reviewer reads `knowledge-base/` |
| 19 | Raw research: import only the **cited** briefs; uncited stay in the shared `inbox/` |
| 20 | `architecture-map` / `debugging-this-repo` skills become thin pointers; the KB holds the content |
| 21 | Reads are enforced by **evidence**, via the plan's existing knowledge field |
| 22 | Vault cleanup fixes what the Index Law requires, and reports it |
| 23 | `knowledge-base/` sits **beside** `plans/reports/backlog/sprints`; `/evolve` is the bridge |
| 24 | No `.obsidian/` shipped; gitignored; the operator opens the folder |
| 25 | Backup is **mandatory** before the first byte is written |
| 26 | Wikilinks rewritten to KB-relative during migration; unresolvable ones reported |
| 27 | Migration surface: a new `/knowledge-migrate` skill; the CLI does detection, backup and ledger |
| 28 | A **leak gate** blocks migration while personal markers remain in the import set |

## Verified platform facts (2026-08-03)

- `github.com/cristian-robert/claude-code-harness` is **PUBLIC** (`gh repo view`). `knowledge-base/`
  being tracked means its contents are published.
- `guard.mjs:26` protects `main`/`master`; `:220` permits base-branch commits staging only
  `backlog/`|`sprints/`; `:224` denies otherwise. Reproduced live: staging `knowledge-base/*` on the
  base branch → `permissionDecision: deny`.
- `work-tracking.md:23` — the tracking root "stays on the base branch", and "`plans/` and `reports/`
  are work artifacts: they travel WITH the code branch and merge with it." Decision 17 puts
  `knowledge-base/` in the second sentence, so **no `guard.mjs` change is required**.
- `cli/index.js` dispatches `init|update|emit|merge-settings|file-size-check`; `:69` is
  `Unknown command → exit 1`. A new subcommand is required for the CLI half to be reachable.
  `cli-hardening.test.js:255` matches `/kb-search|lean-index|Knowledge base tools/i` — which
  `knowledge-migrate` does not trip.
- `plan-template.md:22` already carries `Knowledge to load first:`; `plan-work/SKILL.md:44` already
  requires it be filled. No new plan block is needed.
- `git grep knowledge-base` → zero hits. The name is unclaimed.
- The vault is **1.9 MB, 179 files, and not a git repo** — no `.git`, no remote, no history.
- Ledger today: `AGENTS.md` 59/60, `00-core.md` 45/45 (at cap), total 1656/2000 (**WARN 83%**).

## Architecture — two stores, one boundary rule

| Store | Location | Holds | Tracked |
|---|---|---|---|
| LOCAL | `<repo>/knowledge-base/` | project-scoped: architecture, ADRs, runbook, resources, capture, cited research | git, reviewed |
| SHARED | the vault, gutted of `projects/` | `wiki/`, `agent-kb/`, `wiki/stack/<tool>/`, `inbox/research/` | untracked |

**Boundary rule replacing "sole source of truth":** project-scoped facts live local; generalized
facts live shared; **promotion MOVES**. Exactly one copy of any fact exists — `/evolve` deletes the
local file on promotion and leaves a one-line pointer in `knowledge-base/_index.md`. This is not the
mirror ADR-001 forbade, because no fact is ever in both stores.

```
knowledge-base/
  _index.md          contents map (Index Law)
  architecture.md    module map, boundaries, data flow   <- architect-agent writes
  decisions.md       ADRs                                 <- architect-agent writes
  resources.md       credentials INDEX (pointers only), links
  runbook.md         how to drive the app, known failure classes
  inbox/             raw project capture
  research/          project research + the cited briefs
  .obsidian/         gitignored, created by the operator on first open
```

## Components — seven units

| Unit | Kind | Responsibility |
|---|---|---|
| `cli/knowledge-config.js` | Node | `harness.json.knowledge` read/write + init prompt. Ports `vault-config.js` merge discipline verbatim: refuse to write through a `harness.json` it cannot parse |
| `cli/knowledge-migrate.js` | Node | **Deterministic only**: detect candidates, leak-scan, backup, dry-run plan, apply moves, write ledger, guarantee idempotency. Never judges content. Reachable via a new `cli/index.js` case |
| `skills/knowledge-migrate/SKILL.md` | Skill | **Judgment only**: classify candidates, merge prose, ask on real conflicts, rewrite wikilinks, write the report |
| `references/knowledge-protocol.md` | Reference | Replaces `vault-protocol.md`. Two-store ladder, per-stage RETRIEVE/CAPTURE table, promotion-MOVE rule. Load-on-cite |
| `references/knowledge-base-scaffold/` | Payload | The local KB skeleton. `vault-scaffold/` loses `system/pointer-block.md` + the 5 `project-template/` files, and 7 doctrine lines in its `CLAUDE.md` are rewritten |
| `agents/architect-agent.md` | Agent | Resolution chain repointed at `knowledge-base/architecture.md` + `decisions.md` (relative — no pointer block). Without this, **the two files this design exists to hold have no writer**, and `:17-19` fails silently as `NO VAULT KB` |
| `tools/kb-check.mjs` | Script | The three mechanical gate checks, with real exit codes. Added to the AGENTS.md Commands table |

Also edited: `session-start.mjs:76-78` (emits a pointer to the deleted reference),
`code-reviewer.md:36` (names `architecture-map/SKILL.md#Boundaries` by path),
`harness-init/SKILL.md:68,81` + its pinned `cli-hardening.test.js` literal, `evolve/SKILL.md:31`,
`00-core.md:14,27`, `AGENTS.md:5,27,50`, `implement/SKILL.md` report table, `cli/update.js`,
`cli/migrations.js`, `cli/protected-files.js`, `package.json:4,8,18,20`.

## Data flow

```
capture ──> knowledge-base/{right file, inbox/}
              ├─ /evolve: distil plans/ + reports/ into the KB          [ask-first]
              └─ /evolve: generalizes? ──MOVE──> shared wiki/|agent-kb/ [ask-first]
                                                  local keeps a pointer line

/research <tool> ──> shared inbox/research/ (staging) ──> shared wiki/stack/<tool>/
```

**Retrieval ladder** — one ladder per store, never both rungs, never skip local:

- LOCAL: `knowledge-base/_index.md` → the file. Plain `Read`/`Glob`. No CLI; in-repo files are cheap.
- SHARED: `obsidian search:context` → `_index.md` walk on any error. Unchanged from today.

## Enforcement

| Rung | Mechanism | Notes |
|---|---|---|
| Guidance | `00-core.md:14,27` route lines rewritten in place | net-zero lines |
| Evidence | `plan-template.md:22`'s existing `Knowledge to load first:` extended to require both stores or a literal `none — <reason>`; one knowledge row added to `implement/SKILL.md`'s report table; `kb-check.mjs` gates on presence | An Evidence-rung nudge, not a guarantee — `none — <reason>` passes by design |
| Hook | `guard.mjs` deny on `Write(<shared>/projects/**)` after migration, plus a deny on `Write(knowledge-base/**)` matching secret shapes (model on `BASH_SECRET` at `:24`) | New smoke fixtures per the repo's hard rule |

`tools/kb-check.mjs` runs in `/validate`: **(a)** every KB folder has an `_index.md`, **(b)** no file
is byte-identical to the shipped scaffold placeholder, **(c)** no secret-shaped strings. Only these
three are decidable — "accurate `_index.md`" is semantic and is deliberately not claimed.

**Secrets guard where the commit is**: the scan also runs in `/evolve`'s apply step, because
`/validate` is pipeline step 4 and the KB commit happens at step 7.

**Branch semantics**: `knowledge-base/` travels with the code branch. Mid-work writes dirty the tree
during `/implement`; `/evolve` stages and commits them as one `docs(kb):` commit on the feature
branch, merging with the PR. A finding on an abandoned branch dies with it — the same property
`plans/` and `reports/` already have.

**Reviewer**: ADR-003/ADR-012 scope reversed. The brief gains "read `knowledge-base/decisions.md` +
`architecture.md`; flag any diff that contradicts a recorded decision." Because `/review-branch`
diffs `<base>...HEAD` at pipeline step 5 and the KB commit lands at step 7, the reviewer reads the
**base-branch** KB (`git show <base>:knowledge-base/…`); decision 2's "reviewed" means human PR review.

## Migration — one pipeline, three scenarios

The three scenarios are the same pipeline with different inputs, not three code paths:

- **Clean project** — steps 0/1 find nothing, 2/2b have nothing to ask, and the run collapses to
  "scaffold `knowledge-base/`, write the ledger". No backup is taken because nothing is at risk.
- **Vault knowledge only** — the shared project folder is the import set; no local candidates.
- **Out-and-back** — both the shared folder and the detected local folders are inputs; step 5 is the
  only step that does real work beyond the other two scenarios.

| # | Step | Who |
|---|---|---|
| 0 | **LEAK GATE (read-only)** — run `plans/vault-bootstrap-plan.md:16`'s regex over the import set and classify every hit: absolute home paths are marked *auto-genericizable*; other-project names (`bzroo`, `SentrOS`, `Monitoro`) are marked *needs-decision*. **Refuse to proceed while any needs-decision hit is unresolved.** The gate evaluates the **planned copy** — the import set as it will be written, with genericization and any decisions already recorded in the ledger applied — **not the source**. So a recorded decision clears the gate, and the shared store is never rewritten to satisfy it. Nothing is rewritten here either; rewriting happens at step 5, on the copy, after the backup | CLI + human |
| 1 | **DETECT** — shared project folder + repo-root inventory: curated candidates (`docs/ wiki/ knowledge/ notes/ ai_docs/ context/ PRPs/ specs/ .ai/ memory-bank/ adr/ decisions/`) plus every other root dir containing markdown, each with a content verdict | CLI (read-only) |
| 2 | **CONFIRM** — present the set; the human picks. Nothing is auto-moved | Skill → human |
| 2b | **DISPOSITION** — ask move / copy / archive+move **before** anything destructive | Skill → human |
| 3 | **BACKUP** — verified tarball of the shared store **and every confirmed local candidate** (they are often gitignored, so git is not a fallback), written to `~/.phe-backups/`; refuse if the path resolves inside the repo or the vault | CLI |
| 4 | **DRY-RUN PLAN** — every move, every vault edit, written before anything is applied | CLI |
| 5 | **RECONCILE** — merge non-overlapping; ask only on genuine contradictions. Apply step 0's genericization **to the imported copy only** — source files are never rewritten by the leak gate. **Any imported claim with a command behind it is re-derived by running the command, never merged from prose** | Skill |
| 6 | **REWRITE LINKS** — resolution order: exact path → basename → **report, never guess**. Skip fenced regions and HTML comments; honor `\|` | Skill |
| 6b | **VERIFY LINKS** — re-run the resolver; fail the migration if any previously-resolving link stopped resolving | CLI |
| 7 | **VAULT CLEANUP** — all five doctrine locations (`$V/CLAUDE.md:38`, `projects/_index.md:12,34,39-42`, `system/pointer-block.md`), per-project qualified; the registry row is marked `migrated`, not deleted; inbound links from `agent-kb/patterns/` and `inbox/research/` repointed. `archive/` is created with its `_index.md` stub if disposition needs it | Skill |
| 8 | **LEDGER (finalize)** — `.claude/state/knowledge-migration.json` flips to `status: done`. The ledger is **opened at step 3 and appended after every subsequent step** — per-step status plus a manifest of what moved from where — so a crash at any point leaves a resumable state rather than an ambiguous one. Step 8 only closes it | CLI |
| 9 | **REPORT** — `reports/knowledge-reconciliation.md`: every decision, the backup paths, every unresolved link | Skill |

`npx phe update` rewrites the config key and drops `status: pending`; `/harness-init` gains one line
routing to `/knowledge-migrate`.

**Errors.** No shared store → skip shared steps and say so (parity with today's `NO VAULT`). Backup
fails → refuse, change nothing. Leak hits remain → refuse. Malformed `harness.json` → refuse.
Unresolvable conflict → both preserved and reported, never silently dropped. **Autonomous mode →
REFUSE**: steps 2 and 2b are human-only; log a blocker and stop.

## Doctrine changes — ADRs to write

| ADR | Change |
|---|---|
| new | Reverses ADR-001. Records the boundary rule (project-scoped local · generalized shared · promotion MOVES) as the replacement invariant |
| new | Reverses the reviewer-isolation scope of ADR-003/ADR-012 for `knowledge-base/`, with the base-branch read qualifier |
| amend | ADR-010's tracking root explicitly does **not** cover `knowledge-base/` |

## Budget

Net always-loaded change: **≈ 0, −1 line**. The only saving is the `AGENTS.md:5` pointer-block
comment (~27 est. tokens of 1656); `00-core.md:14,27` and `AGENTS.md:27,50` are rewritten in place;
everything new is `references/` or skill bodies, which the ledger does not count. The two skill
shrinks are ledger-neutral — only their frontmatter is always-loaded. **The ledger stays WARN 83%**;
this design does not improve it.

## Acceptance

- `node tools/context-ledger.mjs template` — before/after numbers recorded; no regression
- `node template/.claude/hooks/smoke-test.mjs` green, with new fixtures for both guard denies
- `cli/knowledge-config.test.js` — the 24 asserts ported from `vault-config.test.js` (count is what
  `node cli/vault-config.test.js` reports, not a grep — grep over-counts the `assert` helper's own
  definition line)
- `cli/knowledge-migrate.test.js` — detection, leak gate refuses, backup refuses on bad path,
  dry-run, **idempotency after a simulated crash at each step**, malformed `harness.json` refuses
- `cli/migrations.test.js` — legacy `vault` key → `knowledge`; re-run is a no-op
- `cli/cli-hardening.test.js` — updated for the new subcommand and the `harness-init` grep literal
- `cli/skill-preview-guards.test.js` — the floor of 7 live previews survives the skill shrinks
- Dogfood: install the harness at `$R` first (it is **not** currently wired — `.claude/` holds only
  `settings.local.json` and `agent-memory/`), then migrate and run `/validate`

## Delivery order — three increments, each independently shippable

This is too large for one plan. Each increment gets its own `/plan-work → /implement → /validate →
/review-branch` cycle, and each leaves the repo green.

| # | Ships | Contains | Value on its own |
|---|---|---|---|
| 1 | **The local KB** | `knowledge-config.js` + rename, `knowledge-base-scaffold/`, `knowledge-protocol.md`, `architect-agent.md` repoint, the two skill shrinks, `tools/kb-check.mjs` + gate wiring, `session-start.mjs`, `code-reviewer.md`, `AGENTS.md`/`00-core.md`, `docs/05` rewrite, the three ADRs | Scenario 1 works end to end: a clean project gets an enforced, gated `knowledge-base/`. No migration exists yet, so nothing can be lost |
| 2 | **The migration** | `knowledge-migrate.js` + `cli/index.js` case, the `/knowledge-migrate` skill, `migrations.js`, the `update` nudge, leak gate, backup, ledger, link resolver + verifier | Scenarios 2 and 3. Depends on 1 for a target to migrate *into* |
| 3 | **Dogfood** | Wire the harness at `$R` (it is not wired today), run the migration on PHE's own knowledge, `/validate` green | Proves 1+2 against a real 179-file vault before any adopter sees it |

Increment 1 is also the natural stopping point if the design proves wrong in practice: it adds a
folder and a gate, and reverting it removes both without having touched the vault.

## Known limits (accepted, not fixed)

1. **This does not fix harvest.** `docs/05:52` records the real failure as "manual 'harvest later'
   doesn't happen"; four of five `agent-kb/` folders are still empty. This buys portability (ADR-001's
   own recorded downside), clone survival, reviewability, and verifiable relative `sources:` paths.
   It does not make capture automatic — `/evolve` stays ask-first.
2. **No CI benefit today.** `.github/` does not exist; nothing reads knowledge in CI.
3. **The evidence rung is a nudge, not a guarantee.** `none — <reason>` passes.
4. **Findings on abandoned branches are lost** — the accepted cost of decision 17.
5. **The corpus being imported is already self-inconsistent** — `_index.md:41` says "49/49 hook
   fixtures", `runbook.md:23` says "19+", and `smoke-test.mjs` actually reports 97. Step 5's
   re-derivation rule exists precisely for this class and cannot cover claims with no command behind
   them.
6. **Codex never sees the protocol** — `cli/emit-codex.js` mirrors `.claude/skills/*` and
   `.claude/agents/*` but never `.claude/references/`. Pre-existing, zero-delta, out of scope.
