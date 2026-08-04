# 05 · Knowledge Layer — local `knowledge-base/` + a shared store

## Two stores, one boundary rule

| Store | Holds | Question it answers | Lifetime |
|---|---|---|---|
| Repo harness (`AGENTS.md`, rules, references, `plans/`, `reports/`) | How to work HERE: commands, conventions, enforcement, pipeline artifacts | "How do I change this code safely?" | Lives and dies with the repo |
| LOCAL `knowledge-base/` (in the repo, git-tracked) | What we KNOW about THIS product: architecture, ADRs, runbook, credential pointers, capture, cited research | "What do we know about this product?" | Travels with the code branch; survives a clone |
| SHARED store (an Obsidian vault) | Evergreen, cross-project: `wiki/`, `agent-kb/`, `wiki/stack/<tool>/` | "What do we know about this pattern / tool?" | Outlives any repo |

**The boundary rule replaces the old "sole source of truth" doctrine.** Project-scoped facts live
local; generalized facts live shared; **promotion MOVES**. `/evolve` deletes the local file on
promotion and leaves a one-line pointer in `knowledge-base/_index.md`. Exactly one copy of any
fact exists — this is not the mirror ADR-001 forbade, because no fact is ever in both stores.

This reverses ADR-001 (ADR-014). What it buys: portability (the KB survives a clone, which
ADR-001 recorded as its own downside), reviewability (the KB lands in the PR diff), and
verifiable relative `sources:` paths. What it does NOT buy: automatic harvest — `/evolve` stays
ask-first. Spec: `docs/design/2026-08-03-project-local-knowledge-base.md`.

## Shape

```
knowledge-base/
  _index.md          contents map (Index Law) + the "promoted out" pointer list
  architecture.md    module map, ## Boundaries, data flow    <- architect-agent writes
  decisions.md       ADRs                                     <- architect-agent writes
  resources.md       credentials INDEX (pointers only), links
  runbook.md         how to drive the app, known failure classes
  inbox/             raw project capture
  research/          project research + the cited briefs
  .obsidian/         gitignored, created by the operator on first open
```

Shipped as `template/.claude/references/knowledge-base-scaffold/`; `/harness-init` copies it to
`./knowledge-base/` and fills it. No `.obsidian/` ships — the folder is Obsidian-openable, and the
operator opens it.

## Linkage — one config key, no pointer block

`.claude/harness.json` → `knowledge`, written once by `npx perfect-harness-engineering init`:

```json
"knowledge": {
  "local": "knowledge-base",
  "shared": { "mode": "existing", "path": "/abs/path/to/vault" },
  "migratedAt": null
}
```

The pointer block is gone. It existed to name a vault path inside prose that had to be pasted and
kept in sync per repo; one config key does the same job and is machine-readable.
`session-start.mjs` emits one orientation line per store from it.

## The Index Law — the correctness invariant, unchanged

**Every folder that holds notes has an `_index.md`. At any depth. No exceptions** (`.obsidian/`,
`.git/` and `.claude/` are exempt — named plumbing, not a dotfile bypass). Whenever you add,
rename, move or delete a note, you update that folder's `_index.md` **in the same change**: fix
the contents map, bump `updated:`. This is the one KB property `kb-check` mechanically checks.

Navigation stays at 2–3 reads locally (`knowledge-base/_index.md` → the file) and 3–4 reads in the
shared store (`CLAUDE.md` → `_index.md` → folder `_index.md` → the note).

## Enforcement — three rungs

| Rung | Mechanism |
|---|---|
| Guidance | `AGENTS.md` knowledge bullet + `00-core.md`'s two routing rows; `.claude/references/knowledge-protocol.md` on cite |
| Evidence | `plan-template.md`'s `Knowledge to load first:` requires BOTH stores or a literal `none — <reason>`; `/implement`'s report table carries a Knowledge row; `kb-check` gates the KB itself, never the plan field |
| Hook | `guard.mjs` denies `Write(<shared>/projects/**)` once `migratedAt` is stamped — except the `projects/_index.md` registry row — and any secret-shaped `Write(knowledge-base/**)`, line-wise, honouring the `<!-- kb-check:allow -->` hatch |

`npx perfect-harness-engineering kb-check` (`tools/kb-check.mjs`) makes exactly three claims,
because exactly three are decidable: **(a)** every KB folder has an `_index.md`, **(b)** no file is
byte-identical to the shipped scaffold placeholder, **(c)** no secret-shaped strings. "The
`_index.md` is ACCURATE" is semantic and is deliberately not claimed. It runs in `/validate` AND
in `/evolve`'s apply step, because `/validate` is pipeline step 4 and the KB commit happens at
step 7 — the gate has to be where the commit is.

The evidence rung is a nudge, not a guarantee: `none — <reason>` passes by design. It is also
**not mechanically gated** — `kb-check` checks the KB, not the plan. The spec's "gates on
presence" line was scoped out: a plan's `Knowledge to load first:` field lives in `plans/`, which
`/validate` does not own, and gating on a field the planner can satisfy with `none — <reason>`
buys nothing a review does not. Recorded as a deliberate deviation in ADR-014.

## Branch semantics

`knowledge-base/` travels with the code branch — a work artifact like `plans/` and `reports/`, NOT
a tracking-root file (ADR-010 does not cover it). Mid-work writes dirty the tree during
`/implement`; `/evolve` stages and commits them as one `docs(kb):` commit on the feature branch,
merging with the PR. A finding on an abandoned branch dies with it — the same property `plans/`
already has, and the accepted cost.

The reviewer reads the **base-branch** KB (`git show <base>:knowledge-base/…`), because
`/review-branch` diffs `<base>...HEAD` at step 5 while the KB commit lands at step 7. ADR-015
reverses ADR-003/ADR-012's reviewer-isolation scope for exactly this file set; "reviewed" in the
decision log means human PR review.

## Knowledge flow — `/evolve` is the bridge

Two harvest triggers, cleanly divided. `/evolve` owns **session lessons**. `/research` owns
**external-tool knowledge**, which — being inherently cross-project — writes straight to the
shared `wiki/stack/<tool>/` and never lands locally. Detail:
`.claude/references/research-and-docs.md`.

## Claude Code auto-memory — complement, not replacement

Auto-memory holds MACHINE-LOCAL facts: env quirks, ports, local workarounds. `knowledge-base/`
holds team knowledge. Rule of thumb: would a teammate need it? → `knowledge-base/`. Would only
this agent, on this machine, need it? → auto-memory.

## Secrets

NEVER a value, anywhere. `resources.md` carries a credentials **index**: record *where* each
secret lives (1Password, the platform's secret manager), never the value. `knowledge-base/` is
git-tracked and a harnessed repo may be public, so this is enforced twice — `guard.mjs` denies the
write, `kb-check` fails the gate.

## Sources

- `docs/design/2026-08-03-project-local-knowledge-base.md` — the spec, its 28 locked decisions,
  and the adversarial review that shaped them.
- The Vault — Index Law, frontmatter schema, and the `agent-kb/` harvest failure that this design
  explicitly does NOT fix (known limit 1). Research brief:
  `~/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md`.
- Cole Medin `second-brain-starter` — memory routing table; the "durable domain memory vs harness
  ephemera" split the auto-memory section keeps. Research brief: `second-brain-starter.md`.
- Claude Code docs — auto-memory limits. Research brief:
  `~/Dev/The Vault/inbox/research/phe-harness/claude-code-docs.md`.
