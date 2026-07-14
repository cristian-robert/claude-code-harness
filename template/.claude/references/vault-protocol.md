# Vault protocol — the second brain contract

How every vault-touching skill/agent RETRIEVEs before acting and CAPTUREs after. Load on cite.

## Resolution

1. Repo `AGENTS.md` → `## Knowledge Vault` pointer block: absolute vault path + `projects/<name>/` name.
2. Fallback: `.claude/harness.json` → `vault` (shape `{mode, path}`; only `mode: "existing"` counts).
3. Neither → NO VAULT: skip every vault step and SAY SO (`no vault configured — skipping <step>`).

## Retrieval ladder

1. `obsidian` CLI on PATH → `obsidian search:context query="<q>" path=<folder> limit=5`, scoped to
   `projects/<name>/`, `wiki/`, or `agent-kb/` per the question; `obsidian read path=<note>` for a hit.
2. ANY CLI error or absence → `_index.md` navigation file reads: vault `_index.md` → folder
   `_index.md` → file.

Never run both rungs for one lookup.

## Write policy

- Auto-append ONLY under `inbox/` and `projects/<name>/` — plain file write or
  `obsidian append path=<note> content=<text>`.
- Every write updates that folder's `_index.md` in the same change (Index Law) and follows vault
  conventions: frontmatter, `[[wikilinks]]` (the global `obsidian-markdown` skill is the reference
  when available).
- `wiki/`/`agent-kb/` promotion and any rule change: ask-first, via `/evolve` only.

## Per-stage table

| Stage / agent | RETRIEVE before acting | CAPTURE after |
|---|---|---|
| `/backlog` refine | prior art + conflicts: `projects/<name>/decisions.md`, wiki search | — (item Log stays canonical) |
| `/plan-work` | existing wiki/stack + architect; product is an AI agent → `agent-kb/` patterns/models/tooling before designing | — |
| debugging (`debugging-this-repo` skill) | `projects/<name>/runbook.md` + vault failure-class search BEFORE diagnosing | confirmed root cause auto-appends to runbook known-failure classes |
| `/validate` + `qa-evaluator` brief | `projects/<name>/runbook.md` (how to drive the app) | — |
| `/review-branch` | none — isolated (reviewer sees only diff + plan + protocol) | — |
| `/evolve` | — | unchanged mechanics; THE promotion gate (inbox/projects → wiki/agent-kb, ask-first) |
| `architect-agent` | adds `agent-kb/` to its RETRIEVE surface; MAY use CLI search as accelerator (same ladder) | RECORD unchanged |
