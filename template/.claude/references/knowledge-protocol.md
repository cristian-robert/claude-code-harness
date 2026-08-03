# Knowledge protocol — two stores, one boundary rule

How every knowledge-touching skill/agent RETRIEVEs before acting and CAPTUREs after. Load on cite.

## The boundary rule (replaces "one sole source of truth")

| Store | Where | Holds | Tracked |
|---|---|---|---|
| LOCAL | `knowledge-base/` in THIS repo | project-scoped: architecture, ADRs, runbook, credential pointers, capture, cited research | git — reviewed, travels with the code branch |
| SHARED | an Obsidian vault: `.claude/harness.json` → `knowledge.shared` (only `mode: "existing"` counts) | evergreen: `wiki/`, `agent-kb/`, `wiki/stack/<tool>/`, `inbox/research/` | untracked |

**Promotion MOVES.** When a local fact generalizes, `/evolve` moves it to the shared store,
DELETES the local file, and leaves a one-line pointer in `knowledge-base/_index.md`. Exactly one
copy of any fact exists — this is not a mirror. Never write project knowledge into
`<shared>/projects/` — it belongs in that repo's own `knowledge-base/`.

## Retrieval ladders — one per store, never both rungs, never skip local

- LOCAL: `knowledge-base/_index.md` → the file it names. Plain `Read`/`Glob`. No CLI; in-repo
  files are cheap. No `knowledge-base/` → say so (`no knowledge-base/ — answering from the code`).
- SHARED: `obsidian` CLI on PATH → `obsidian search:context query="<q>" path=<folder> limit=5`
  scoped to `wiki/` or `agent-kb/`; `obsidian read path=<note>` for a hit. ANY error or CLI
  absent → `_index.md` walk (vault `_index.md` → folder `_index.md` → file).
- No shared store configured → skip every shared step and SAY SO (`no shared store — skipping <step>`).

## Write policy

- Mid-work auto-writes go to `knowledge-base/` — the right core file, or `inbox/` when raw. Every
  write updates that folder's `_index.md` in the same change (Index Law) and uses Obsidian
  conventions: frontmatter, `[[wikilinks]]` (the global `obsidian-markdown` skill when available).
- `knowledge-base/` is git-TRACKED and may be published: `resources.md` holds credential POINTERS
  only. `npx perfect-harness-engineering kb-check` gates it at `/validate` and again at `/evolve`'s
  apply step, because the KB commit happens at `/evolve`.
- Shared-store writes (`wiki/`, `agent-kb/`) and any rule change: ask-first, via `/evolve` only.
- `knowledge-base/` is committed as ONE `docs(kb):` commit at `/evolve`, on the feature branch —
  a work artifact like `plans/` and `reports/`, not a tracking-root file.

## Per-stage table

| Stage / agent | RETRIEVE before acting | CAPTURE after |
|---|---|---|
| `/backlog` refine | `knowledge-base/decisions.md` for prior art + conflicts; shared `wiki/` search | — (item Log stays canonical) |
| `/plan-work` | `knowledge-base/architecture.md` + `decisions.md`; product is an AI agent → shared `agent-kb/`. Record BOTH in the plan's `Knowledge to load first:` | — |
| `/implement` | the plan's `Knowledge to load first:` files, BEFORE Task 1 | the report's Knowledge row |
| debugging | `knowledge-base/runbook.md` failure classes BEFORE diagnosing | confirmed root cause appends to `runbook.md` |
| `/validate` | `knowledge-base/runbook.md` (how to drive the app) → `qa-evaluator` | `kb-check` runs as a gate command |
| `/review-branch` | BASE-branch KB only (`git show <base>:knowledge-base/…`) — the KB commit lands at `/evolve`, after review | — |
| `/evolve` | — | THE gate: distil `plans/`+`reports/` into the KB; generalizes → MOVE to shared, ask-first |
| `architect-agent` | `knowledge-base/_index.md` → `architecture.md` (+ `decisions.md`) | RECORD writes both |
