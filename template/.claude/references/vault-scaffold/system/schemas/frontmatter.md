---
type: reference
updated: 2026-07-06
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
| `project-index` | A project wiki's `_index.md` | `status`, `kind`, `repo` |
| `note` | General working note | `project` (optional) |
| `research` | A deep-dive brief in `inbox/research/` | `doc-sources` (URL+version), `sources` (optional) |
| `snippet` | Code snippet in `inbox/snippets/` | `lang` |
| `reference` | Evergreen reference in `wiki/`/`agent-kb/` | `doc-sources`, `researched-version` (for `wiki/stack/`) |
| `adr` | Decision log | `project` |

## Project index fields

| Field | Values |
|---|---|
| `status` | `active` \| `paused` \| `shipped` \| `archived` |
| `kind` | `app` \| `agent` \| `library` \| `service` |
| `repo` | git URL or local path |

## Tool research (`wiki/stack/<tool>/`)

External-tool docs cached for cross-project reuse. Folder `_index.md`: `covers:` (aspect list),
`versions:` (majors documented + where), `aliases:` (package/service name variants + context7 id).
Pages: `researched-version:`, `verified: true|low-confidence`, `doc-sources:` (URL+version), `related:`.
`doc-sources:` is documentation provenance — distinct from `sources:` (repo file paths).

## Example

```yaml
---
type: project-index
status: active
kind: agent
repo: git@github.com:you/acme-agent.git
updated: 2026-07-06
tags:
  - project
---
```
