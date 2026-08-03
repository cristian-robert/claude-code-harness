---
type: index
folder: /
updated: 2026-08-03
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
| 🏗️ **projects** | Registry only: which repo holds each product's `knowledge-base/`. | [[projects/_index\|projects]] |
| 📚 **wiki** | Evergreen cross-project knowledge. | [[wiki/_index\|wiki]] |
| 🤖 **agent-kb** | Reusable AI-agent-building knowledge. | [[agent-kb/_index\|agent-kb]] |
| ⚙️ **system** | Plumbing: index template, frontmatter schema. | [[system/_index\|system]] |

## Flow

```
<repo>/knowledge-base/  ──MOVE on generalization──>  wiki/  +  agent-kb/
project-scoped, git-tracked                          evergreen distillation
                      inbox/  →  wiki/ + agent-kb/
                      staging     evergreen
```

## Quick actions

- **Paste something raw** → drop it in [[inbox/raw/_index|inbox/raw]].
- **Start a new project** → its knowledge goes in that repo's own `knowledge-base/`; register the repo in [[projects/_index|projects/_index]].
- **Point a repo at this vault** → set `knowledge.shared.path` in that repo's `.claude/harness.json`.

> [!warning] The Index Law
> Any folder you create or change its contents → create/update its `_index.md` in the same change. See [[CLAUDE#THE INDEX LAW]].
