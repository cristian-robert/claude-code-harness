---
type: index
folder: projects
updated: 2026-07-08
tags:
  - index
  - registry
---

# projects

**Stage 2 — working knowledge.** One subfolder per product = its wiki. This vault is **vault-centric**: `projects/<name>/` is the single source of truth for that product's knowledge, and its code repo points *here* (see [[system/pointer-block|pointer-block]]).

This file is the **registry** — the status of every project at a glance.

## Registry

| Project | Kind | Status | Wiki |
|---|---|---|---|
| _(no projects yet)_ | — | — | — |

<!-- Add a row per project. Example:
| Acme API | app | active | [[projects/acme-api/_index\|acme-api]] |
-->

## Start a new project

1. Copy `system/templates/project-template/` → `projects/<name>/`.
2. Fill in `<name>/_index.md` frontmatter (`status`, `kind`, `repo`) and overview.
3. **Add a row to the Registry above** and bump `updated:` (Index Law).
4. Paste [[system/pointer-block|system/pointer-block.md]] into the code repo's `CLAUDE.md`, filled in for `<name>`.

## Agent SOP

1. Landing here from a repo? Find the project row, open its wiki `_index.md` — that's the START HERE for the product.
2. Read the project's `_index.md` before its `architecture.md` / `decisions.md` / `resources.md` / `runbook.md`.
3. On any structural change to a project, update **both** the project's own `_index.md` **and** this registry.
4. Shipped or dead project → update `status:`; cold → move folder to `projects/archive/`.
