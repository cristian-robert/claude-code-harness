# CLAUDE

Root operating manual for this Obsidian vault. **Read this file first, every session, before reading or writing anything else.**

## Vault Conventions

_Last reviewed: 2026-07-06_

> [!danger] DO NOT TOUCH
> Plumbing and cold storage — never write notes into these:
> - `.obsidian/` — Obsidian app config.
> - `.claude/` — agent plumbing (if present).
> - `system/` — machine-readable plumbing (templates, schemas, pointer block). Edit its files *deliberately* when changing conventions; never dump notes here.
> - `**/archive/` — cold storage. Wikilinks keep resolving from archive, so links never break. Don't curate it; just let stale notes land there.

## What this vault is

A single, unified knowledge base for **building applications and AI agents**. Three things happen here:

- **Paste raw information** → `inbox/`
- **Build a wiki per project** → `projects/<name>/`
- **Distill evergreen knowledge** → `wiki/` (general) and `agent-kb/` (agent-building know-how)

Mental model — **staging → working → evergreen**:

```
inbox/  →  projects/<name>/  →  wiki/  +  agent-kb/
capture     working knowledge     evergreen distillation
```

Raw material lands in `inbox/`. When it's about a specific product, it graduates into that product's wiki under `projects/`. When a lesson generalizes past one project, it's harvested into `wiki/` (or `agent-kb/` if it's about building agents).

## Vault Structure

Top-level folders — **each has its own `_index.md`; read that before working inside it**:

- **`inbox/`** — Stage 1 staging. Untriaged capture + research. Subfolders: `raw/` (paste zone), `research/` (deep-dive briefs), `snippets/` (reusable code). Has `archive/`.
- **`projects/`** — Stage 2 working knowledge. One subfolder per product = its wiki. `projects/_index.md` is the **project registry** (status of every project). Vault-centric: this is the single source of truth for project knowledge; repos point *here* (see [Pointing a repo at this vault](#pointing-a-project-repo-at-this-vault)).
- **`wiki/`** — Stage 3 evergreen. Cross-project knowledge: patterns, stack references, how-tos, decisions that generalize.
- **`agent-kb/`** — Evergreen knowledge domain for **building AI agents**: `prompts/`, `evals/`, `models/`, `patterns/`, `tooling/`. Reusable across every agent project.
- **`system/`** — Plumbing. `templates/` (project-wiki + index templates), `schemas/` (frontmatter contract), `pointer-block.md`. DO NOT TOUCH as a note dump.

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

## Project Wiki Doctrine

Each product you build gets a folder under `projects/<name>/` scaffolded from `[[system/templates/project-template/_index|the project template]]`. A project wiki holds:

- `_index.md` — **START HERE**: overview, status, quick links, agent SOP for the project.
- `architecture.md` — stack, key modules, how it's built.
- `decisions.md` — ADRs: what was chosen and *why*.
- `resources.md` — repo/deploy/dashboard links, infra, and a **credentials index** (pointers to where secrets live — **never the secrets themselves**).
- `runbook.md` — how to run, deploy, and handle common ops.
- `notes/` — working notes (create on demand; gets its own `_index.md`).

Register every new project in `[[projects/_index|projects/_index.md]]`. When a project ships or dies, update its `status:` there; when it goes cold, move the folder to `projects/archive/`.

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

Individual agent *products* still live in `projects/` as their own wikis; `agent-kb/` is the cross-project reference they draw from.

## Pointing a project repo at this vault

Each code repo reaches this vault by pasting a standard block into **that repo's own `CLAUDE.md`**. The canonical, copy-paste block lives at `[[system/pointer-block|system/pointer-block.md]]` — copy it verbatim and fill in the project name. It tells that repo's agent to read `projects/<name>/_index.md` before design work, and `wiki/` + `agent-kb/` for reusable knowledge.

## Taxonomy (frontmatter)

The frontmatter contract for every note type lives in `[[system/schemas/frontmatter|system/schemas/frontmatter.md]]`. Core fields:

- `type:` — `index` | `project-index` | `note` | `research` | `snippet` | `reference` | `adr`.
- Project index adds: `status:` (`active` | `paused` | `shipped` | `archived`), `kind:` (`app` | `agent` | `library` | `service`), `repo:`.
- `updated:` — `YYYY-MM-DD`, bumped on every meaningful edit.
- `doc-sources:` — documentation provenance (URL+version) for `research`/`reference` notes; distinct from `sources:` (repo file paths).

## Maintenance

- Every top-level folder except `system/` has (or gets) an `archive/` subfolder for 7-day-stale material. Wikilinks keep resolving from archive.
- Re-read this file at the top of each session; update _Last reviewed_ when you change a convention.
