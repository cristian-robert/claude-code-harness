---
type: index
folder: wiki/stack
updated: 2026-01-01
tags:
  - index
---

# wiki / stack

**Stage 3 — evergreen, tool-keyed.** One subfolder per external tool/library/service
(`<tool>/`), holding the durable cross-project answer to "how do we use `<tool>`?". This is the
cache the `/research` loop checks first and distils into — populated by using `/research <tool>`,
not by hand.

## Contents

_Empty. Each tool gets `<tool>/` with its own `_index.md` (Index Law), carrying `covers:` (aspects
documented), `versions:` (majors + where), and `aliases:` (name variants + context7 id)._

## Agent SOP

1. Before researching or coding against an external tool, look here first: `<tool>/_index.md`.
2. Fresh + version-matched + covers your aspect → use it, don't re-research.
3. Missing / stale / wrong major / uncovered aspect → run `/research <tool>[@version] [focus]`; it
   fetches current docs (context7 + official) and extends this folder.
4. New tool folder → create its `_index.md` and update this index (Index Law).
