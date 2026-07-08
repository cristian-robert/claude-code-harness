# 05 · Knowledge Layer — Repo Harness + Vault

## Two stores, one boundary

| Store | Holds | Question it answers | Lifetime |
|---|---|---|---|
| Repo harness (CLAUDE.md, rules, references, `plans/`, `reports/`) | How to work HERE: commands, conventions, enforcement, pipeline artifacts | "How do I change this code safely?" | Lives and dies with the repo |
| Vault (`~/Dev/The Vault/`) | What we KNOW: architecture, decisions, lessons — cross-project | "What do we know about this product / pattern?" | Outlives any repo |

**Decided: the vault is the SOLE source of truth for project knowledge.** Repo docs locate
code; the vault holds the wiki. Both of the operator's live projects (bzroo, SentrOS) already
run this way — repo-embedded knowledge sections were migrated out and deleted; the vault's
`repo:` field is a code locator only. No bidirectional mirror: mirrors drift, and the first
divergence silently forks the truth.

## Repo → vault linkage: the pointer block

One canonical block — `<vault>/system/pointer-block.md` — pasted near the top of the repo's
CLAUDE.md (the template CLAUDE.md marks the slot). Absolute vault path by design: zero-config,
and relocating the vault means updating one source file, then re-pasting.

New project setup:

1. Copy `<vault>/system/templates/project-template/` → `<vault>/projects/<name>/`.
2. Fill the project-index frontmatter (`status`, `kind`, `repo`) and overview.
3. Register the project in `<vault>/projects/_index.md` (add row, bump `updated:`).
4. Paste the pointer block, filled in for `<name>`, into the repo CLAUDE.md.

## The Index Law — the correctness invariant

**Every folder that holds notes has an `_index.md`. At any depth. No exceptions** (only
`.obsidian/`, `.claude/`, `system/` plumbing, and `**/archive/` are exempt). Whenever you add,
rename, move, or delete a note, you update that folder's `_index.md` **in the same change**:
fix its contents map, bump `updated:`. A note folder without an accurate `_index.md` is a bug
— and part of "done," not optional polish.

This invariant replaces any search index. There is no rebuild command; correctness is
enforced at every write site, which keeps navigation at 3–4 reads regardless of vault size:

1. `<vault>/CLAUDE.md` — conventions.
2. `<vault>/_index.md` — vault map.
3. Target folder's `_index.md` (recurse one level if deeper).
4. The specific note.

## Knowledge flow — `/evolve` is the harvest trigger

```
inbox/  →  projects/<name>/  →  wiki/ + agent-kb/
capture     working knowledge     evergreen distillation
```

Observed failure: the vault's `agent-kb/` sat entirely unharvested — five well-specified
subfolders, zero notes, while rich generalizable material waited one hop away in a project
wiki and a flagged inbox note. Manual "harvest later" doesn't happen. PHE's fix: `/evolve`
closes every pipeline run by proposing the harvest, ask-first — session lessons →
`projects/<name>/` (or `inbox/` if raw); anything that generalizes → `wiki/`, or `agent-kb/`
when it's about building agents. Index Law applies at every write.

## Frontmatter contract

Universal: `type`, `updated: YYYY-MM-DD`, lowercase-hyphenated `tags`. Types: `index`
(+`folder`), `project-index` (+`status`/`kind`/`repo`), `note` (+optional `project`),
`research`, `snippet` (+`lang`), `reference`, `adr` (+`project`).

Mature notes converged on two richer fields the schema under-documents — use them:

- `sources:` — exact repo file-path provenance list. Makes a note re-verifiable against code.
- `related:` — `[[wikilink]]` list. Builds the graph that makes notes findable later.

## Claude Code auto-memory — complement, not replacement

Claude Code's auto-memory (a `MEMORY.md` index capped at ~200 lines / 25KB, plus topic files
loaded on demand) is the agent's own operational learnings: tool quirks, env paths, harness
ephemera. It complements the vault; never duplicate vault content into it. Rule of thumb:
would a teammate need it? → vault. Would only this agent, in this repo, need it? →
auto-memory.

## Secrets

NEVER in the vault. The project template's `resources.md` carries a credentials **index**:
record *where* each secret lives (1Password, repo `.env`, cloud secret manager) — pointers
only, never values.

## Sources

- The Vault — CLAUDE.md conventions, Index Law, pointer block, project registry, frontmatter
  schema vs. mature-note practice, unharvested `agent-kb/` (research brief: `~/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md`).
- Cole Medin `second-brain-starter` — memory routing table, curated-index-plus-topic-files
  memory shape, "durable domain memory vs. harness ephemera" split (research:
  `second-brain-starter.md`).
- Claude Code docs — auto-memory limits (research brief: `~/Dev/The Vault/inbox/research/phe-harness/claude-code-docs.md`).
