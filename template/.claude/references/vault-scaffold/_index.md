---
type: index
folder: /
updated: 2026-07-06
tags:
  - index
---

# Vault Map

Unified knowledge base for building **applications and AI agents**. This is the top-level map — after reading [[CLAUDE]], start here, then jump to a folder's `_index.md`.

> [!info] Navigation (3–4 reads to anything)
> 1. [[CLAUDE]] — conventions · 2. this map · 3. target folder `_index.md` · 4. the file.

## Top-level folders

| Folder | Purpose | Index |
|---|---|---|
| 📥 **inbox** | Paste raw info + research. Staging. | [[inbox/_index\|inbox]] |
| 🏗️ **projects** | One wiki per product. Working knowledge. | [[projects/_index\|projects]] |
| 📚 **wiki** | Evergreen cross-project knowledge. | [[wiki/_index\|wiki]] |
| 🤖 **agent-kb** | Reusable AI-agent-building knowledge. | [[agent-kb/_index\|agent-kb]] |
| ⚙️ **system** | Plumbing: templates, schemas, pointer block. | [[system/_index\|system]] |

## Flow

```
inbox/  →  projects/<name>/  →  wiki/  +  agent-kb/
capture     working knowledge     evergreen distillation
```

## Quick actions

- **Paste something raw** → drop it in [[inbox/raw/_index|inbox/raw]].
- **Start a new project wiki** → copy [[system/templates/project-template/_index|the project template]] to `projects/<name>/`, then register it in [[projects/_index|projects/_index]].
- **Point a repo at this vault** → paste [[system/pointer-block|system/pointer-block.md]] into that repo's `CLAUDE.md`.

> [!warning] The Index Law
> Any folder you create or change its contents → create/update its `_index.md` in the same change. See [[CLAUDE#THE INDEX LAW]].
