# CLAUDE

Root operating manual for this Obsidian vault. **Read this file first, every session, before reading or writing anything else.**

## Vault Conventions

_Last reviewed: 2026-08-03_

> [!danger] DO NOT TOUCH
> Plumbing and cold storage — never write notes into these:
> - `.obsidian/` — Obsidian app config.
> - `.claude/` — agent plumbing (if present).
> - `system/` — machine-readable plumbing (index template, frontmatter schema). Edit its files *deliberately* when changing conventions; never dump notes here.
> - `**/archive/` — cold storage. Wikilinks keep resolving from archive, so links never break. Don't curate it; just let stale notes land there.

## What this vault is

A single, unified knowledge base for **building applications and AI agents**. What belongs where:

- **Paste raw information** → `inbox/`
- **Keep project knowledge in its repo** → that repo's own git-tracked `knowledge-base/`, never here
- **Distill evergreen knowledge** → `wiki/` (general) and `agent-kb/` (agent-building know-how)

Mental model — **staging → evergreen**, with project knowledge living OUTSIDE this vault:

```
<repo>/knowledge-base/  ──MOVE on generalization──>  wiki/  +  agent-kb/
project-scoped, git-tracked                          evergreen distillation
                      inbox/  →  wiki/ + agent-kb/
                      staging     evergreen
```

Raw material lands in `inbox/`. Project-scoped facts never land here at all — they live in that repo's `knowledge-base/`. When a lesson generalizes past one project, `/evolve` **MOVES** it here (and deletes the local copy, leaving a pointer line): exactly one copy of any fact exists.

## Vault Structure

Top-level folders — **each has its own `_index.md`; read that before working inside it**:

- **`inbox/`** — Staging. Untriaged capture + research. Subfolders: `raw/` (paste zone), `research/` (deep-dive briefs), `snippets/` (reusable code). Has `archive/`.
- **`projects/`** — the **registry only**. `projects/_index.md` records, per product, where its repo and its `knowledge-base/` live. No project knowledge is stored here; a project subfolder is a migration leftover, not the shape.
- **`wiki/`** — Evergreen. Cross-project knowledge: patterns, stack references, how-tos, decisions that generalize.
- **`agent-kb/`** — Evergreen knowledge domain for **building AI agents**: `prompts/`, `evals/`, `models/`, `patterns/`, `tooling/`. Reusable across every agent project.
- **`system/`** — Plumbing. `templates/` (the `_index.md` template), `schemas/` (frontmatter contract). DO NOT TOUCH as a note dump.

## THE INDEX LAW

> [!danger] Non-negotiable
> **Every folder that holds notes has an `_index.md`. At any depth. No exceptions** except the DO-NOT-TOUCH plumbing (`.obsidian/`, `.claude/`) and `**/archive/` (which gets only a one-line stub).

`_index.md` is the load-bearing convention of this vault — it doubles as **Obsidian navigation** and the **agent SOP for that folder**. Per-folder context lives in `_index.md`, **never** in scattered `CLAUDE.md` files inside subfolders.

**Create trigger.** The moment you create a folder — top-level or nested, any depth — you create its `_index.md` in the *same* change. A folder without an `_index.md` is a bug.

**Update trigger.** Whenever you add, rename, move, or delete a note in a folder, you update that folder's `_index.md` in the *same* change: fix its contents map and bump `updated:`. A parent folder's `_index.md` must also link to any new child folder's `_index.md`.

**Content contract** — every `_index.md` contains, in order:

1. Frontmatter: `type: index`, `folder: <path>`, `updated: YYYY-MM-DD`.
2. **Purpose** — one line: what belongs in this folder (and what doesn't).
3. **Contents** — a map of this folder's notes and subfolders, each a wikilink + one-line description. Subfolders link to their own `_index.md`.
4. **Agent SOP** — what an agent should read/do when it lands here, and where to go next.

Use the template at `[[system/templates/index-template|index-template]]`. Reference other indexes with **pathed** wikilinks to avoid ambiguity: `[[inbox/_index|inbox]]`, not `[[_index]]`.

**Recursion.** Subfolders get their own `_index.md`; the parent links down, the child can link back up. This keeps navigation to 3–4 reads no matter how deep the tree grows.

> [!warning] Verification gate
> Before you claim any vault task done, confirm **every folder you touched has an accurate `_index.md`**. New folder → new index. Changed contents → updated index + bumped date. This is part of "done," not an optional polish step.

## Navigation Pattern

Each navigable folder's `_index.md` maps its contents and serves as the agent SOP for that folder. To find anything, an agent reads in this order — **3–4 reads regardless of vault size**:

1. Read this **`CLAUDE.md`** for conventions.
2. Read the root **`_index.md`** for the vault map.
3. Read the **target folder's `_index.md`** (and any nested subfolder's `_index.md` if going deeper).
4. Read the **specific file**.

## Project Knowledge Doctrine — it is NOT here

Each product keeps its own knowledge in its own repo, at `<repo>/knowledge-base/`: `_index.md`,
`architecture.md`, `decisions.md`, `resources.md`, `runbook.md`, `inbox/`, `research/`. It is
git-tracked, reviewed in the PR, and travels with the code branch — so it survives a clone,
and every `sources:` path in it is relative and verifiable.

This vault holds the EVERGREEN half only. When a lesson generalizes past one project, `/evolve`
**MOVES** it here and deletes the local copy, leaving a one-line pointer in the repo's
`knowledge-base/_index.md`. Never copy: a fact in two stores is a fork waiting to happen.

Record every product as a row in [[projects/_index|projects/_index.md]] — repo path and status,
not knowledge.

## Wiki Doctrine (evergreen)

`wiki/` is the post-graduation home for knowledge that outlives any single project. Harvest into it after a project teaches you something general. Organize by topic subfolders (each gets an `_index.md`). If a lesson is specifically about *building agents*, it belongs in `agent-kb/` instead.

External-tool/library docs live tool-keyed under `wiki/stack/<tool>/`, cached and reused across projects via `/research` (see the repo's `.claude/references/research-and-docs.md`).

## Agent-KB Doctrine

`agent-kb/` compounds your agent-building expertise across projects:

- `prompts/` — reusable system prompts, prompt patterns, snippets.
- `evals/` — eval sets, results, regressions worth remembering.
- `models/` — model notes: capabilities, pricing, quirks, when-to-use.
- `patterns/` — architectures (tool loops, RAG, multi-agent, memory).
- `tooling/` — MCP servers, frameworks, SDK references.

Individual agent *products* keep their knowledge in their own repo's git-tracked `knowledge-base/`; `agent-kb/` is the cross-project reference they draw from.

## How a repo reaches this vault

A harnessed repo records the absolute path to this vault in its own
`.claude/harness.json` → `knowledge.shared` (`{ "mode": "existing", "path": "<ABSOLUTE_VAULT_PATH>" }`),
written once by `npx perfect-harness-engineering init`. There is no pointer block to paste and
nothing to keep in sync: the repo's agents read `wiki/` and `agent-kb/` from that path, and once
that repo has migrated out, its `guard.mjs` denies writes into `projects/` beyond the registry.

## Taxonomy (frontmatter)

The frontmatter contract for every note type lives in `[[system/schemas/frontmatter|system/schemas/frontmatter.md]]`. Core fields:

- `type:` — `index` | `note` | `research` | `snippet` | `reference` | `adr`.
- `updated:` — `YYYY-MM-DD`, bumped on every meaningful edit.
- `doc-sources:` — documentation provenance (URL+version) for `research`/`reference` notes; distinct from `sources:` (repo file paths).

## Maintenance

- Every top-level folder except `system/` has (or gets) an `archive/` subfolder for 7-day-stale material. Wikilinks keep resolving from archive.
- Re-read this file at the top of each session; update _Last reviewed_ when you change a convention.
