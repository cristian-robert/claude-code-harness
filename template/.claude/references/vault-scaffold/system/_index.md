---
type: index
folder: system
updated: 2026-07-06
tags:
  - index
---

# system

**Plumbing.** Machine-readable templates, schemas, and the repo pointer block. This is not a note dump — edit these files *deliberately* when you're changing a vault convention.

## Contents

- [[system/templates/_index|templates/]] — the project-wiki template and the `_index.md` template.
- [[system/schemas/_index|schemas/]] — the frontmatter contract for note types.
- [[system/pointer-block|pointer-block.md]] — copy-paste block that points a code repo at this vault.

## Agent SOP

1. Creating a project → copy `templates/project-template/`. Creating any folder → base its `_index.md` on `templates/index-template.md`.
2. Changing what frontmatter a note carries → update `schemas/frontmatter.md` first, then the affected notes.
3. Changing how repos reference the vault → update `pointer-block.md` (the one source), not individual repos ad hoc.
