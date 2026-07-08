# Design — Doc-grounded work + cross-project research reuse

- **Date:** 2026-07-08
- **Status:** proposed — pending written-spec sign-off
- **Scope:** PHE canonical repo. The port to the AIDF v1.0 branch is a defined follow-up phase (see "Phasing").
- **Revised** after a 3-lens adversarial review (completeness / consistency-scope / vault-alignment). Fixes: version dimension, cache location, gather agent, context7 fallback, `sources:` overload, scope phasing.

## Problem

The framework has a centralized vault (single source of truth) and a distillation path
(`inbox/ → projects/<name>/ → wiki/ + agent-kb/`). But three gaps defeat the goal — *"research a
tool once, reuse it across every project, and always work from current documentation"*:

1. **The cross-project evergreen home (`wiki/`) is not tool-keyed.** "Do we already know Supabase?"
   has no reliable per-tool lookup, so knowledge doesn't compound.
2. **No doc-grounded discipline.** Nothing tells agents to consult current documentation before
   building with an external tool; they code from training memory, which drifts.
3. **No capture command, no version awareness, and `/harness-init` can't create the vault.** The reuse
   loop depends on the user's personal global skills, ignores which tool *version* a project pins, and a
   fresh install has nowhere for research to land.

The vault's own SOPs already route research `inbox/research/ → wiki/` and name `stack/` as an example
evergreen topic. This work adds the **tool+version-keyed convention** and the **tooling** to drive it —
it does not invent new vault structure.

## Principle: doc-grounded work

> When working with any external tool/library/framework/API/service — **even a well-known one** — do not
> code from training memory. Consult its documentation for **the version this project pins**. **Check the
> vault's evergreen cache first** (`wiki/stack/<tool>/`); if the needed version/aspect is absent or stale,
> **fetch current docs** and use them; then **capture what generalizes back to the vault** so the next
> project inherits it.

- "Fetch docs" means **both**, cross-referenced: the **context7 MCP** (fast, version-aware, when
  available) **and** the tool's **official docs** (authoritative); web only to fill gaps.
- **Freshness is a heuristic, not a guarantee of "current."** A cache hit is trusted only when its
  recorded tool version matches the project's pinned/target version *and* it is within the staleness
  window; a version mismatch forces re-research regardless of date.
- This is guidance, not a hard gate (the framework enforces only anti-accident safety). It is wired where
  it changes behavior: `CLAUDE.md`, `00-core`, `/plan`, `/implement`.

## Vault taxonomy — tool + version keyed

**`wiki/stack/<tool>/` is the single durable, freshness-checked cache** — the only location the reuse
decision keys off. `inbox/research/` is staging (raw, untriaged) and never short-circuits as
authoritative.

| Stage | Location | Holds | Frontmatter |
|---|---|---|---|
| Raw capture (staging) | `inbox/research/<tool>.md` (or `<tool>/`) | gathered findings before distillation; a **pointer stub** remains after harvest | `type: research`, `updated:`, `doc-sources:` (URLs+versions), `tags:` |
| **Evergreen cache (the reuse target)** | `wiki/stack/<tool>/` — `_index.md` + distilled pages | the durable cross-project answer to "how do we use `<tool>`?" | folder `_index.md` (`type: index`, `covers:` aspects, `versions:` list); pages `type: reference`, `updated:`, `tags:`, `researched-version:`, `verified:`, `doc-sources:`, `related:` |
| Project-specific usage | `projects/<name>/` | how *this* product uses the tool (choices/gotchas here) | per project-wiki doctrine |

- **Tool key normalization:** lowercase canonical package/service name (e.g. `supabase`, not `Supabase`
  or `@supabase/supabase-js`). Aliases + the context7 library ID are recorded in the entry's `_index.md`
  `aliases:` field; step-1 lookup checks aliases.
- **Version rule:** an entry is stamped `researched-version:`. A single entry documents one major line by
  default. When a second, incompatible major version is researched, create `wiki/stack/<tool>/v<major>/`;
  the top `_index.md` `versions:` lists which majors are covered and where. A version-less "latest" entry
  is treated as applying only to the newest major it names.
- **`sources:` vs `doc-sources:`** — `sources:` keeps its docs/05 meaning (repo file-path provenance,
  re-verifiable against code) and stays empty for pure-doc research; documentation provenance goes in a
  new **`doc-sources:`** field (URLs + versions). docs/05 + the shipped frontmatter schema are amended to
  define `doc-sources:`.
- **Index Law** at every write: creating `wiki/stack/<tool>/` also creates `wiki/stack/_index.md` and
  updates `wiki/_index.md` to link down — all in the same change.

## `/research <tool>[@version] [focus]` skill (shipped, thin, model-disciplined)

Standalone; also invoked by `/plan`. `template/.claude/skills/research/SKILL.md`, body **≤100 lines**
(the enforced skill cap); detail in `references/research-and-docs.md` (lazy-loaded).

1. **Check the evergreen cache first — `wiki/stack/<tool>/` only** (aliases included). Short-circuit
   **only when** the entry (a) covers the requested `focus` (its `_index.md` `covers:` list), (b) matches
   the requested/pinned version (`researched-version:`), and (c) is within the staleness window (default
   90 days). Otherwise research the missing version/aspect and *extend* the entry. An `inbox/research/`
   hit is surfaced as untriaged raw only — it never short-circuits.
2. **Gather — orchestrator directs, sonnet gathers.** The orchestrator (top model) resolves the library
   via **context7 in the main loop** (avoids relying on subagent MCP access), then writes a precise brief
   (exact questions, target version, required sources, output shape + size cap) and dispatches the new
   **`research-gatherer`** subagent (sonnet; tools: WebFetch, WebSearch, Read) to read the **official docs
   + web** and return structured findings. Matches `docs/04`: top model thinks; sonnet gathers.
3. **Verify before trusting.** The orchestrator spot-checks the key claims against the cited `doc-sources:`
   URLs (context7 result + official docs) before distilling; findings that can't be confirmed are dropped
   or marked low-confidence. Never relay unverified.
4. **Write raw** → `inbox/research/<tool>.md` (`type: research`, `updated:`, `doc-sources:`, `tags:`);
   update `inbox/research/_index.md`.
5. **Distill to the cache (the default, not an afterthought).** Harvest the cross-project essentials →
   `wiki/stack/<tool>/`, stamping `researched-version:`, `covers:`, `verified:`. Create the full Index-Law
   parent chain on first write (`wiki/stack/<tool>/_index.md`, `wiki/stack/_index.md`, link from
   `wiki/_index.md`). Leave a pointer stub in `inbox/research/` per the vault's research SOP. This is a
   **specialized harvest for external-tool knowledge** — see the docs/05 reconciliation below.
   **Autonomous mode** (invoked from `/plan`): skip any interactive confirmation, distil with the
   conservative default, and log the write under `## Assumptions` (consistent with `autonomous-mode.md`).
6. **Degrade gracefully (no vault).** Write findings to repo `reports/research-<tool>.md` and, in step 1,
   check that same file for version/staleness so **intra-repo, cross-time** reuse still works. Cross-
   *project* reuse genuinely requires a vault — state this expectation; don't pretend otherwise.

## New agent: `research-gatherer`

`template/.claude/agents/research-gatherer.md` — sonnet, pinned `model: sonnet`, tools **WebFetch,
WebSearch, Read** (no Edit/Write; it returns findings). Charter: read official docs + web for a specific
tool@version per the orchestrator's brief; return a structured, sized summary with exact source URLs.
Distinct from `scout` (codebase-only). Listed in `00-core`'s dispatch table.

## context7 wiring (opt-in at /harness-init, with a real fallback)

- **Not shipped in `template/.mcp.json` by default.** `/harness-init` offers to add the `context7` server
  to the *project's* `.mcp.json` if the user wants live doc fetch:
  ```json
  "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
  ```
  JSON can't carry a commented example, so `references/research-and-docs.md` is the source of truth for the
  entry. The default template `.mcp.json` keeps only `codebase-search`.
- **Fallback is explicit:** context7 not added, `resolve-library-id` empty/ambiguous, or tool uncovered →
  proceed on **official docs + web**, and stamp the note `context7: uncovered` so it isn't mistaken for a
  version-verified entry. context7 is a preferred source, never a hard requirement.
- context7 is called from the **main loop**, sidestepping the open question of subagent MCP inheritance.

## Pipeline wiring

- **`template/CLAUDE.md`** — one line: "Working with an external tool? Consult its docs for your pinned
  version — check `wiki/stack/<tool>/` first, else `/research`."
- **`00-core.md`** — dispatch rows: *external tool/library knowledge → `/research` (cache-first at
  `wiki/stack/<tool>/`, then context7 + official docs)*; and the `research-gatherer` agent row.
- **`/plan`** — enumerate external tools the plan **directly builds against** (from `package.json` /
  imports / the plan's own tech choices — major frameworks & services, **not** transitive deps). For each,
  read `wiki/stack/<tool>/` frontmatter directly for version+freshness (a cheap check-only lookup, no
  dispatch); run `/research <tool>@<pinned>` only for misses/stale/version-mismatch. Cite the
  `wiki/stack/<tool>/` path in the plan. Many tools → batch the briefs.
- **`/implement`** — before writing tool-specific code, consult the cache / current docs (reminder line,
  not a new gate).

## Vault bootstrap via `/harness-init` (ships the scaffold as assets)

The scaffold's source is **bundled**, copied verbatim from the reference vault into the payload at
`template/.claude/references/vault-scaffold/` — so a fresh install on any machine can create a
convention-correct vault:

- Contents: root `_index.md` + vault `CLAUDE.md`; `inbox/{raw,research,snippets}/_index.md`;
  `wiki/_index.md` + `wiki/stack/_index.md`; `agent-kb/{prompts,evals,models,patterns,tooling}/_index.md`;
  `projects/_index.md`; and the **load-bearing `system/` plumbing** the conventions depend on —
  `system/_index.md`, `system/templates/index-template.md`, `system/templates/project-template/` (+ its
  `_index.md`), `system/schemas/frontmatter.md` (updated to define `doc-sources:`), `system/pointer-block.md`.
- `/harness-init` step: detect a vault (pointer block, or ask for the path). If none and wanted → copy the
  scaffold to the chosen location, then wire the filled pointer block into the repo `CLAUDE.md`. Every
  folder ships with its `_index.md` (Index Law); `system/` ships a real `_index.md`, not an exemption stub.
- Same `/harness-init` run **offers to add context7** to the project's `.mcp.json` (see context7 wiring).
- Optional; non-vault users skip it (unchanged from today).

## docs/05 reconciliation (two harvest triggers, cleanly divided)

`docs/05` says "/evolve is THE harvest trigger" because manual harvest of *session lessons* doesn't
happen. Amend it to define the division, not contradict it:

- **`/evolve`** remains the harvest trigger for **session lessons** (`inbox/`/`projects/ → wiki/`,
  ask-first).
- **`/research`** is the harvest path for **external-tool knowledge**, which is inherently cross-project,
  so it writes straight to `wiki/stack/<tool>/` (skipping `projects/`) as a built-in step — not a "harvest
  later" the operator must remember. Both keep the Index Law and the "vault is sole source of truth, no
  bidirectional mirror" doctrine.

## Files changed (PHE)

New: `template/.claude/skills/research/SKILL.md`, `template/.claude/references/research-and-docs.md`,
`template/.claude/agents/research-gatherer.md`, `template/.claude/references/vault-scaffold/**`.
Edited: `template/CLAUDE.md`, `template/.claude/rules/00-core.md`,
`template/.claude/skills/{plan,implement,harness-init}/SKILL.md`, `docs/05-knowledge-layer.md`, `README.md`.
(`template/.mcp.json` is unchanged — context7 is added at `/harness-init`, not shipped.) PHE-only: this design doc.

## Phasing (keeps each piece focused)

1. **Research-reuse core (PHE):** taxonomy + `/research` skill + `research-gatherer` agent +
   `references/research-and-docs.md` (documents context7 usage + fallback) + `00-core` / `CLAUDE.md` /
   `/plan` / `/implement` wiring + `docs/05` reconciliation.
2. **Vault bootstrap (PHE):** bundle `vault-scaffold/` assets + extend `/harness-init` (scaffold vault +
   offer to add context7 to the project `.mcp.json`).
3. **AIDF port:** replay phases 1–2 onto branch `feat/phe-payload-v1`. File map = each `template/…` path
   above → same path under the AIDF repo root `.claude/…`. AIDF-specific verification: `npm test`
   (init-backup, cli-hardening, merge-settings) + `file-size-check` clean; confirm `cli/init.js` copies the
   new agent + reference + vault-scaffold files (the default `.mcp.json` is unchanged by this feature). This
   phase is its own plan.

## Testing / verification

- `node tools/context-ledger.mjs template` stays **< 2000 tokens** always-loaded. Only always-loaded
  additions: the `CLAUDE.md` line + two `00-core` rows. `/research` SKILL.md **≤100 lines**; the reference
  and vault-scaffold assets are lazy/never-loaded. Trim if the ledger warns.
- `node template/.claude/hooks/smoke-test.mjs` → 61/61 (no hook changes; run to confirm).
- Frontmatter lint passes for the new SKILL.md, agent, and reference.
- Manual: `/research supabase@2` on a scratch project fetches (context7 + official docs), writes
  `inbox/research/supabase.md`, distils `wiki/stack/supabase/` stamped `researched-version: 2`; a rerun
  reports "already known"; `/research supabase realtime` (new focus) extends rather than short-circuits;
  `/research supabase@3` creates a `v3` sub-entry rather than overwriting v2.

## Out of scope (YAGNI)

- Automatic staleness re-checks / cron refresh, and automatic upstream-release detection — manual
  `researched-version:` + `updated:` + the 90-day advisory window only.
- Full retraction tooling with dependent-project alerting when a distilled page is later found wrong — the
  `verified:` marker + re-research-on-mismatch is the lightweight substitute; broad invalidation is a
  future design.
- Taxonomy richer than `wiki/stack/<tool>/[v<major>/]` (no per-language/per-category tree until needed).
- Bidirectional repo↔vault mirroring (explicitly rejected in `docs/05`).
- Seeding `wiki/stack/` with real tool pages — that is content produced by *using* `/research`, not
  framework code.
