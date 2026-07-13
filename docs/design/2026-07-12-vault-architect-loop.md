# Design — The vault architecture loop: a vault-backed architect agent + architecture-writing /evolve

- **Date:** 2026-07-12
- **Status:** proposed — pending written-spec sign-off
- **Scope:** PHE canonical repo. **Additive to** `2026-07-11-codex-harness-port.md` (Phase 1, dual-emit) —
  builds on the same branch and reuses its emitter. Not a replacement for dual-emit.
- **Origin:** operator wants architecture treated as *knowledge*, not per-harness config — held once in the
  Obsidian vault, served by an **architect agent** assigned this project's architecture, and written back by
  an **`/evolve` that records architecture**. At init, ask for the general vault.

## Problem

PHE already has a vault (`~/Dev/The Vault/`), a `/research → wiki/stack/` doc-reuse loop, and a `/evolve`
that harvests *session lessons*. Two gaps remain for **architecture** specifically:

1. **Nothing reads architecture before structural work.** An agent placing a new module/route/table/
   endpoint scans the codebase from scratch every time. The vault's `projects/<name>/architecture.md` and
   `decisions.md` exist (they ship in the project template) but nothing consults them as a first move.
2. **Nothing writes architecture back.** `/evolve` captures rules and generalizable lessons, but a
   structural change (a new table, a route restructure, an ADR-worthy decision) never lands in the vault's
   architecture files. The project wiki goes stale the moment code moves past it.

The result is a broken loop: the architecture record and the code drift apart, and every session pays to
re-derive what the vault should already know.

## Principle

> **Architecture is knowledge, not config.** It lives once in the vault and is served by an agent — never
> duplicated into per-harness files. The architect agent *reads* it before structural work; `/evolve`
> *records* structural change back to it. Read → build → record → read.

The architect agent is the reader; `/evolve` is the writer; the vault project wiki is the shared KB. Keeping
the write under `/evolve`'s existing **ask-first** gate means no subagent silently edits the operator's vault.

## The loop

```
/plan or structural work
        │  consult (RETRIEVE / IMPACT)
        ▼
  architect-agent ──reads──► vault/projects/<name>/{_index,architecture,decisions}.md
        │
   (build the change)
        │
     /evolve  ──detects structural change──► dispatch architect-agent RECORD (ask-first)
        │                                            │ verify vs codebase, then write
        ▼                                            ▼
   next session's RETRIEVE is current ◄────── architecture.md + decisions.md updated (Index Law)
```

## Component 1 — `template/.claude/agents/architect-agent.md`

PHE ships an architect agent that mirrors the operator's global one
(`~/.claude/agents/architect-agent/AGENT.md`) — same `RETRIEVE` / `IMPACT` / `RECORD` / `PATTERN` protocol,
same ≤30-line file-paths-not-contents discipline — with **one structural change: its knowledge base is the
vault project wiki, not a `.claude/agents/architect-agent/` local dir.**

- **Frontmatter:** `name: architect-agent`, `model: opus` (architecture is judgment work — `docs/04`),
  `tools: Read, Grep, Glob, Edit, Write` (Edit/Write only for `RECORD`). Because PHE ships it as a
  **project-local** `.claude/agents/architect-agent.md`, it takes precedence over the operator's global
  agent inside an adopted project — the vault-backed variant wins where it matters.
- **KB resolution:** the agent resolves the vault project-wiki path from the **AGENTS.md pointer block**
  (single source; `harness.json` `vault.path` is the fallback). Then:
  - `RETRIEVE` / `IMPACT`: read `projects/<name>/_index.md` + `architecture.md` (+ `decisions.md` for
    rationale). These map onto the global agent's `index.md` + domain files — the vault project template
    already has this shape, so no new vault structure is invented.
  - `RECORD`: verify the change exists in the codebase (Glob/Grep), then update `architecture.md` and
    append an ADR to `decisions.md`, honoring the vault's **Index Law** (bump the folder `_index.md` in the
    same change).
- **Dual-emit carries it to Codex for free.** It is just another `.claude/agents/*.md`, so Phase 1's
  emitter derives `.codex/agents/architect-agent.toml`. The agent's instructions are harness-neutral (it
  reads an absolute vault path via file tools, which both harnesses' subagents have).
- **Distinct from `scout`.** `scout` answers "how does X work" by reading *code*; the architect answers
  "where does new code go / what will this change touch" by reading the *vault wiki*. Complementary; both
  live in the dispatch table.

## Component 2 — `/evolve` gains an architecture-record step

A new row in `/evolve`'s destination ladder (`evolve/SKILL.md`, step 2), placed above the generic
"generalizes beyond this project → vault" row:

| Candidate is... | Destination |
|---|---|
| **Structural change this session** (new/removed module, route, DB table, endpoint; an ADR-worthy decision) | **Dispatch `architect-agent` RECORD** → update `projects/<name>/architecture.md` + `decisions.md` |

- **Detection** (added to step 1 "Gather candidates"): the plan's affected-surfaces list, the diff since the
  base branch (new files under module/route dirs, migration files, new endpoints), and ADR-worthy decisions
  surfaced during the work.
- **Under the existing ask-first gate.** The architecture-record candidate appears in the one numbered
  proposal message tagged `[vault: architecture]`, exactly like every other evolve candidate. "none" stays a
  legitimate outcome. Autonomous mode logs it under `## Assumptions` per `autonomous-mode.md`.
- **Reuses `RECORD`.** `/evolve` does not write the vault itself — it dispatches the architect agent's
  `RECORD`, so the verify-then-write logic and Index-Law handling live in exactly one place (the KB steward).
- **No vault, or vault skipped → this row is a no-op**, and `/evolve` says so rather than failing.

## Component 3 — CLI `init` asks for the general vault

`cli/init.js` gains a second question after the harness question (Phase 1). It is **lightweight** — the
readline CLI records intent; it does not scaffold:

```
Do you use an Obsidian vault for architecture & knowledge?
  path)  enter an absolute path to your general vault
  s)     scaffold a new vault (done later, in /harness-init)
  skip)  no vault
```

Recorded in `.claude/harness.json` (merged, preserving other keys — same discipline as `harness`):

```json
"vault": { "mode": "existing" | "scaffold" | "none", "path": "<abs-path or null>" }
```

`update` reads it back and never re-asks (parity with `harness`). A pre-`vault`-field project reads as
`{ mode: "none" }` — safe default, no prompt, no behavior change for existing installs.

## Component 4 — `/harness-init` scaffolds & wires

`/harness-init` already has a vault step (question 5 + the wiring in its GENERATE step). This design **routes
that step off `harness.json` `vault`** instead of asking cold, and extends it to wire the architect agent:

- `mode: "scaffold"` → copy `.claude/references/vault-scaffold/` to a chosen path, create `projects/<name>/`
  from `system/templates/project-template/`, fill + paste the pointer block into AGENTS.md.
- `mode: "existing"` → ensure `projects/<name>/` exists in that vault (create from the template if absent),
  paste + fill the pointer block.
- `mode: "none"` → leave the AGENTS.md vault comment as-is; **note that the architect agent will fall back
  to a codebase scan** (see degradation).
- Either vault mode → confirm the architect agent resolves its KB (the pointer block is present and points
  at a real `projects/<name>/`). This is the "assign the architecture to the agent" step.

## Graceful degradation (no vault)

The whole loop is **opt-in on having a vault**. With `vault.mode: "none"`:

- The architect agent has no KB. It falls back to a **codebase scan** (Glob/Grep/Read) to answer `RETRIEVE`/
  `IMPACT` — degraded but functional, never a hard error. It says "no vault KB — answering from the codebase."
- `/evolve`'s architecture-record row is a no-op (nothing to write to).
- Nothing else changes. A vault-less PHE project behaves exactly as it does today.

## Integration with existing pieces (what this reuses, not rebuilds)

| Reused | How |
|---|---|
| Phase 1 dual-emit (`cli/emit-codex.js`) | Carries the new agent to Codex unchanged |
| `harness.json` merge discipline (`cli/harness-targets.js`) | The `vault` field merges like `harness` |
| `vault-scaffold/` assets + project template | The KB structure; no new vault taxonomy |
| Pointer-block mechanism | How the agent finds the vault; single source of the path |
| `/evolve` ask-first gate + Index Law | The architecture-write rides the existing write path |
| `00-core.md` dispatch table | Add an `architect-agent` row next to `scout` |
| `/research` + `wiki/stack/` (2026-07-08 design) | Untouched — that is *tool* knowledge; this is *project architecture*. Distinct vault destinations, no overlap |

## Files changed (PHE)

New: `template/.claude/agents/architect-agent.md`.
Edited: `template/.claude/skills/evolve/SKILL.md` (RECORD row + structural-change detection),
`template/.claude/skills/harness-init/SKILL.md` (route vault step off `harness.json`; wire the agent),
`cli/init.js` (the vault question), `cli/harness-targets.js` (read/write the `vault` field — or a sibling
`cli/vault-config.js` if it keeps `harness-targets.js` focused), `template/.claude/rules/00-core.md` (dispatch
row — mind the 44/45-line budget: adding may mean cutting), and possibly the project-template
`architecture.md`/`decisions.md` (`vault-scaffold/.../project-template/`) if they need an agent-facing shape.
PHE-only: this design doc.

## Testing / verification

- `node tools/context-ledger.mjs template` — always-loaded still OK (<2000); `00-core.md` still ≤45 lines
  (the dispatch row is the only always-loaded addition; the agent body and evolve/harness-init changes are
  not always-loaded). Trim if the ledger warns.
- `node cli/emit-codex.test.js` — the new agent emits to `.codex/agents/architect-agent.toml` with a
  `developer_instructions` block and no `model =` line (Phase 3 still owns model keys in emitted config).
- `npm test` green — the `vault` field round-trips through `harness.json` (read/write/merge, preserving
  `harness`/`stopGate`/`workTracking`); a pre-`vault` project reads as `mode: none`.
- Agent-frontmatter lint passes for the new agent.
- **Manual, on a scratch project with a real vault:** `init` with a vault path → `harness.json` records it →
  `/harness-init` wires the pointer block and `projects/<name>/` → dispatch architect-agent `RETRIEVE` returns
  the project's architecture from the vault → make a structural change → `/evolve` proposes an
  `[vault: architecture]` record → accepting it updates `architecture.md` + `decisions.md` with the Index Law
  held. And a **no-vault** scratch project: the agent answers from the codebase and `/evolve` skips the row.

## Out of scope (YAGNI)

- A per-domain architect KB richer than the vault's existing `architecture.md`/`decisions.md` (no
  `modules/<area>.md` tree until a project's architecture.md actually gets too big to hold).
- Auto-recording architecture without the `/evolve` ask-first gate (explicitly rejected — no silent vault
  writes). If the operator later wants autonomous recording, that is a separate opt-in.
- Model/tier vocabulary for the new agent — it pins `model: opus` today; the Phase 3 tier map (deep/review)
  will fold it in when that lands, like every other agent.
- Migrating the operator's global architect-agent or its local-KB variant. PHE ships its own vault-backed
  agent; the global one is untouched and simply loses precedence inside an adopted project.

## Unverified / to confirm during planning

- Whether the vault question belongs in `harness-targets.js` or a new `cli/vault-config.js`. Leaning
  separate file — `harness-targets.js` is about the harness axis; the vault is a different concern. Decide at
  plan time based on how much the `harness.json` read/write/merge code can be shared.
- The exact structural-change **detection** heuristic in `/evolve` (plan affected-surfaces vs. diff-derived).
  Keep it advisory — a missed detection just means the operator records it manually next time; a false
  positive is dropped at the ask-first gate. No need for precision that the ask-first gate makes moot.
