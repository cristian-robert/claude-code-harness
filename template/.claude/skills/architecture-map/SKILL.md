---
name: architecture-map
description: "Codebase map: directory ownership, entry points, module boundaries, where new code belongs. Consult BEFORE creating files, adding routes/modules, or deciding where anything lives."
user-invocable: false
allowed-tools: Bash(find *)
---

# Architecture map

Golden rule: placement is a decision, not a guess — new code lands where this map says, or the map gets updated first (via `/evolve`).

## Live tree (re-rendered at every invocation — never stale)

!`find . -maxdepth 2 -type d -not -path '*/node_modules*' -not -path '*/.git*' 2>/dev/null | head -40 || echo "(dir scan failed)"`

<!-- filled by /harness-init: replace every <placeholder> below from detection + interview.
     Keep the file ≤70 lines; update via /evolve when the structure moves. -->

## Module table

| Dir | Owns | Entry point |
|---|---|---|
| `<backend-dir>/routes/` | HTTP layer only — parse → service → envelope | `<file>` |
| `<backend-dir>/services/` | Business logic: rules, calculations, workflows | `<file>` |
| `<frontend-dir>/components/` | Product UI composed from primitives | `<file>` |
| `<shared-dir>/` | Cross-cutting types/utils used by ≥2 areas | `<file>` |

## Where new code goes

- New endpoint → `<backend-dir>/routes/` (thin) with logic in `services/`. Canonical pattern: `<file:line>`.
- New UI → `<frontend-dir>/components/`; shared component only at the third consumer — copy twice first.
- Needed by ≥2 areas → `<shared-dir>/` — types and utils only, never app logic.

## Boundaries (what never imports what — violations are review blockers)

- `<frontend-dir>` never imports from `<backend-dir>`; shared types live in `<shared-dir>`. (traces to: `<incident>`)
- Only `<data-layer-dir>` touches the DB. (traces to: `<incident, e.g. raw query in a service bypassed row-level checks>`)

## How to validate placement

- Read the closest existing analogue BEFORE creating a file — name it in the plan.
- `<boundary-check-cmd, e.g. import-lint rule>` after adding any cross-module import.
