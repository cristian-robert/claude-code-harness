---
type: reference
updated: 2026-07-06
tags:
  - plumbing
---

# Repo → Vault pointer block

This is the **one source** for how a code repo reaches this vault. To connect a project:

1. Copy the fenced block below into that repo's own `CLAUDE.md` (near the top).
2. Replace `<project-name>` with the project's folder name under `projects/`.
3. Make sure a matching wiki exists at `projects/<project-name>/` (copy the project template) and is registered in [[projects/_index|projects/_index]].

> [!note] Why absolute path
> Explicit and zero-config — no symlinks or git noise. If you relocate the vault, update this one file, then re-paste into repos. (On a shared/synced machine you can instead symlink `./.vault → <ABSOLUTE_VAULT_PATH>` and swap the paths below for `./.vault/...`.)

---

## Copy from here ⬇

```markdown
## Knowledge Vault

This project's knowledge base lives in the unified Obsidian vault at:
`<ABSOLUTE_VAULT_PATH>/`

**Before architecture, design, or planning work, navigate the vault** (3–4 reads, any vault size):
1. Read `<ABSOLUTE_VAULT_PATH>/CLAUDE.md` — vault conventions.
2. Read `<ABSOLUTE_VAULT_PATH>/_index.md` — vault map.
3. Read `<ABSOLUTE_VAULT_PATH>/projects/<project-name>/_index.md` — THIS project's wiki (START HERE), then its `architecture.md`, `decisions.md`, `resources.md`, `runbook.md` as needed.
4. Read the specific file you need.

**Reusable knowledge** beyond this project:
- `<ABSOLUTE_VAULT_PATH>/wiki/` — cross-project engineering knowledge.
- `<ABSOLUTE_VAULT_PATH>/agent-kb/` — AI-agent building know-how (prompts, evals, models, patterns, tooling).

**Write back:** when a decision, architecture change, or reusable lesson emerges, record it in the vault (this project's wiki, or `wiki/`/`agent-kb/` if it generalizes) — and follow the vault's Index Law: any folder you create or whose contents you change, create/update its `_index.md` in the same change.
```

## Copy to here ⬆
