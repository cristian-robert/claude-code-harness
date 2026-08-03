---
type: index
folder: projects
updated: 2026-07-08
tags:
  - index
  - registry
---

# projects

**The registry — pointers, not knowledge.** Each row records where a product's repo (and its git-tracked `knowledge-base/`) lives. Project knowledge is NOT stored in this vault; see [[CLAUDE#Project Knowledge Doctrine — it is NOT here]].

This file is the **registry** — the status of every project at a glance.

## Registry

| Project | Kind | Status | Repo (holds its knowledge-base/) |
|---|---|---|---|
| _(no projects yet)_ | — | — | — |

<!-- Add a row per project. Example:
| Acme API | app | active | `~/Dev/acme-api` |
-->

## Register a new project

1. Add a row to the Registry above: name, kind, status, repo path.
2. Bump `updated:` (Index Law).
3. In that repo, run `npx perfect-harness-engineering init` — it records this vault's path in
   `.claude/harness.json` → `knowledge.shared` and `/harness-init` scaffolds its `knowledge-base/`.

## Agent SOP

1. Looking for a product's architecture or decisions? They are in that product's repo, under
   `knowledge-base/` — not here. This file only tells you which repo.
2. A leftover `projects/<name>/` subfolder is un-migrated knowledge, not the shape. Report it;
   never write new knowledge into one.
3. Shipped or dead project → update `status:` in the row and bump `updated:`.
