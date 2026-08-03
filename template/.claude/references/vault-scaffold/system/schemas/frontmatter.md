---
type: reference
updated: 2026-08-03
tags:
  - schema
---

# Frontmatter contract

Every note carries frontmatter (Obsidian "properties"). Keep it small and consistent.

## Universal fields

| Field | Values | Notes |
|---|---|---|
| `type` | see below | What kind of note this is. |
| `updated` | `YYYY-MM-DD` | Bump on every meaningful edit. |
| `tags` | list | Searchable labels. |

## `type` values

| `type` | Used for | Extra fields |
|---|---|---|
| `index` | An `_index.md` folder map | `folder` |
| `note` | General working note | `project` (optional) |
| `research` | A deep-dive brief in `inbox/research/` | `doc-sources` (URL+version), `sources` (optional) |
| `snippet` | Code snippet in `inbox/snippets/` | `lang` |
| `reference` | Evergreen reference in `wiki/`/`agent-kb/` | `doc-sources`, `researched-version` (for `wiki/stack/`) |
| `adr` | Decision log | `project` |

## Tool research (`wiki/stack/<tool>/`)

External-tool docs cached for cross-project reuse. Folder `_index.md`: `covers:` (aspect list),
`versions:` (majors documented + where), `aliases:` (package/service name variants + context7 id).
Pages: `researched-version:`, `verified: true|low-confidence`, `doc-sources:` (URL+version), `related:`.
`doc-sources:` is documentation provenance — distinct from `sources:` (repo file paths).

## Example

```yaml
---
type: index
folder: wiki/stack
updated: 2026-08-03
tags:
  - index
---
```
