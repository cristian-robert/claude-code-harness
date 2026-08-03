---
type: index
folder: system
updated: 2026-07-06
tags:
  - index
---

# system

**Plumbing.** Machine-readable templates and schemas for this vault. This is not a note dump — edit these files *deliberately* when you're changing a vault convention.

## Contents

- [[system/templates/_index|templates/]] — the `_index.md` template.
- [[system/schemas/_index|schemas/]] — the frontmatter contract for note types.

## Agent SOP

1. Creating any folder → base its `_index.md` on `templates/index-template.md`.
2. Changing what frontmatter a note carries → update `schemas/frontmatter.md` first, then the affected notes.
3. Changing how repos reference this vault → they read `.claude/harness.json` → `knowledge.shared.path`; nothing here needs editing.
