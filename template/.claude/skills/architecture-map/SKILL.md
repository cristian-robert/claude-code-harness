---
name: architecture-map
description: "Codebase map: directory ownership, entry points, module boundaries, where new code belongs. Consult BEFORE creating files, adding routes/modules, or deciding where anything lives."
user-invocable: false
allowed-tools: Bash(find *)
---

# Architecture map — a pointer, not the map

Golden rule: placement is a decision, not a guess — new code lands where the map says, or the map gets updated first (via `/evolve`).

## Live tree (re-rendered at every invocation — never stale)

!`find . -maxdepth 2 -type d -not -path '*/node_modules*' -not -path '*/.git*' 2>/dev/null | head -40 || echo "(dir scan failed)"`

## The map itself lives in the KB

`knowledge-base/architecture.md` holds the module table, the where-new-code-goes rules, and the
`## Boundaries` section. `architect-agent` writes it (RECORD); `code-reviewer` reads it. Read
`knowledge-base/_index.md`, then that file. Never duplicate its content here — a second copy
forks the first time either moves.

Missing (`knowledge-base/architecture.md` does not exist)? Say `no knowledge-base/architecture.md
— deriving placement from the tree above`, place code beside its closest existing analogue, and
dispatch `architect-agent` **RECORD** at `/evolve` so the next agent does not re-derive it.

## Placement checklist (the mechanics — the facts are in the KB)

- Read the closest existing analogue BEFORE creating a file, and name it in the plan: `<file:line>`.
- Needed by ≥2 areas → `<shared-dir>` — types and utils only, never app logic.
- Cross-module import added → run the boundary check named in `knowledge-base/architecture.md`; a violation is a review blocker (traces to: `<incident>`).
