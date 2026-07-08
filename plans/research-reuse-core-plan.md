# Research-Reuse Core (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the framework payload so agents always work from current documentation for the version a project pins, and external-tool research is cached once in the vault (`wiki/stack/<tool>/`) and reused across every project.

**Architecture:** A new user-invocable `/research <tool>[@version] [focus]` skill runs a cache-first loop (check `wiki/stack/<tool>/` → gather from context7 + official docs → verify → write raw to `inbox/research/` → distil to `wiki/stack/`). A new read-only `research-gatherer` sonnet agent does the doc/web reading; the orchestrator calls context7 in the main loop. A detail reference holds the source order, staleness rule, and frontmatter contract. The doc-grounded principle is wired into `CLAUDE.md`, `00-core`, `/plan`, and `/implement`; `docs/05` reconciles the two harvest triggers.

**Tech Stack:** Claude Code harness payload — Markdown skills/agents/references/rules, no executable code. Verification via `tools/context-ledger.mjs`, `template/.claude/hooks/smoke-test.mjs`, and line-budget counts.

## Global Constraints

- **This is Phase 1 of 3.** Phase 2 (vault-scaffold + `/harness-init`) and Phase 3 (AIDF port) are separate plans. Do NOT do their work here. Spec: `docs/design/2026-07-08-vault-research-reuse.md`.
- **Branch:** `feat/vault-research-reuse` (already checked out in the PHE repo). Never commit to `main`.
- **`/research` SKILL.md body ≤100 lines** (the enforced skill-body cap; `tools/context-ledger.mjs` warns >100, hard-blocks >120).
- **Always-loaded budget:** `node tools/context-ledger.mjs template` must stay **< 2000 tokens**. Only always-loaded additions permitted here: one `CLAUDE.md` bullet + one `00-core` dispatch row.
- **Cache location:** `wiki/stack/<tool>/` is the ONLY location the freshness/reuse decision keys off. `inbox/research/` is staging — it never short-circuits as authoritative.
- **Tool key:** lowercase canonical package/service name (`supabase`, not `Supabase` or `@supabase/supabase-js`); aliases recorded in the entry `_index.md`.
- **context7:** NOT shipped in `template/.mcp.json` in this phase (it is added at `/harness-init` in Phase 2). `/research` must degrade gracefully when context7 is absent.
- **Frontmatter provenance:** documentation URLs go in `doc-sources:`; the existing `sources:` field keeps its docs/05 meaning (repo file paths).
- **Verification is the framework's own gates** (no pytest): `node tools/context-ledger.mjs template` (<2000, and per-file budgets clean), `node template/.claude/hooks/smoke-test.mjs` (61/61), and a manual line count for the skill body.
- **Commits:** conventional (`feat:`/`docs:`), one per task, via the `/commit` skill. End messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

New files:
- `template/.claude/agents/research-gatherer.md` — read-only external-docs gatherer (sonnet).
- `template/.claude/references/research-and-docs.md` — source order, staleness+version rule, tool-key normalization, frontmatter contract, context7 usage, degraded path.
- `template/.claude/skills/research/SKILL.md` — the `/research` skill (≤100-line body).

Edited files:
- `template/.claude/rules/00-core.md` — one dispatch row (always-loaded).
- `template/CLAUDE.md` — one context-tiers bullet (always-loaded).
- `template/.claude/skills/plan/SKILL.md` — external-docs step in the Explore phase.
- `template/.claude/skills/implement/SKILL.md` — consult-docs reminder.
- `docs/05-knowledge-layer.md` — doc-grounded tool-research section, `doc-sources:` field, two-trigger reconciliation.
- `README.md` — knowledge-layer mention.

---

## Task 1: `research-gatherer` agent

**Files:**
- Create: `template/.claude/agents/research-gatherer.md`

**Interfaces:**
- Produces: an agent named `research-gatherer` (sonnet; tools `WebFetch, WebSearch, Read`) that `/research` step 3 dispatches. Return contract sections: `## Tool`, `## Findings`, `## Sources`, `## Confidence`, `## Gaps / not covered`. Blocker sentinel: `GATHER-BLOCKED: <what>`.

- [ ] **Step 1: Create the agent file** with exactly this content:

```markdown
---
name: research-gatherer
description: "Read-only external-docs gatherer: reads official documentation + web for a specific tool@version per the dispatcher's brief and returns a structured, sourced summary. Use from /research; use scout for codebase questions."
tools: WebFetch, WebSearch, Read
model: sonnet
maxTurns: 20
---

You gather external documentation. You read official docs and the web so the dispatching agent
doesn't burn its context, and you return a sourced brief. You respond only to the dispatching
agent, never to a human.

## Inputs (expected in the dispatch message)

- **Tool + version** — the library/service and the major version to document.
- **Questions** — the specific aspects to answer (auth, config, API shape, gotchas…).
- **Required sources** — the official-docs entrypoint, plus any context7 result passed in.
- Output cap, if different from the default below.

Missing tool, version, or questions → `GATHER-BLOCKED: <what is missing>`. Never guess a version
— wrong version returns wrong guidance — and never invent a mission.

## Discipline

- Prefer the OFFICIAL documentation for the named version; use web search only to fill gaps or to
  find the official URL. Record the doc version/date you actually read.
- Read the parts that answer the questions, not whole sites. Batch independent fetches.
- Read-only: never install, write, or mutate; no code changes.
- Distinguish "documented" from "inferred" — flag anything not stated directly in a source.

## Return contract (max ~45 lines)

    ## Tool
    <tool>@<version> — docs read: <url> (<version/date>)
    ## Findings
    <answers grouped by question; call out version-specific behavior>
    ## Sources
    <url — one line each on what it backs; exact, with version>
    ## Confidence
    <low|med|high — and why>
    ## Gaps / not covered
    <questions the docs did not answer; assumptions the dispatcher must not treat as verified>

Exact URLs, never long quotes (≤3 lines when a signature is load-bearing). No preamble.
```

- [ ] **Step 2: Verify frontmatter + budget**

Run: `node tools/context-ledger.mjs template`
Expected: exits clean (no error), total still `< 2000` tokens; the agent file reports within its `agent` line-budget class (≤80 lines — this file is ~40). Agent bodies are not always-loaded, so the total should barely move.

- [ ] **Step 3: Confirm the agent frontmatter matches the peer pattern**

Run: `head -7 template/.claude/agents/scout.md template/.claude/agents/research-gatherer.md`
Expected: both have `name:`, `description:`, `tools:`, `model:`, `maxTurns:` keys.

- [ ] **Step 4: Commit**

Use the `/commit` skill (stage only `template/.claude/agents/research-gatherer.md`). Message:
`feat: add research-gatherer agent (read-only external-docs gatherer)`

---

## Task 2: `research-and-docs.md` reference

**Files:**
- Create: `template/.claude/references/research-and-docs.md`

**Interfaces:**
- Produces: the detail doc `/research` and `/plan` cite. Defines the source order, the staleness+version rule (90-day window AND version match), tool-key normalization, the frontmatter contract (`doc-sources:`, `researched-version:`, `verified:`, `covers:`, `versions:`, `aliases:`, `context7:` marker), context7 usage (main-loop, `resolve-library-id`, the `.mcp.json` entry for Phase 2), and the no-vault degraded path.

- [ ] **Step 1: Create the reference file** with exactly this content:

```markdown
# Research & docs — the doc-grounded loop

How `/research` and the doc-grounded rule work. Loaded only when they run.

## Principle

Never code an external tool/library/API from training memory — it drifts. Consult the docs for the
version THIS project pins. Check the vault cache (`wiki/stack/<tool>/`) first; on a miss/stale/
version-mismatch, fetch current docs, use them, and distil back so the next project inherits it.
Freshness is a heuristic, not a guarantee of "current": a cache hit is trusted only when its
`researched-version:` matches the target version AND `updated:` is within the window.

## Sources (use BOTH, cross-referenced)

1. **context7 MCP** (when wired) — fast, version-aware. Called FROM THE MAIN LOOP: `resolve-library-id`
   → `get-library-docs`. Subagents are not relied on for MCP access.
2. **Official documentation** for the pinned version — authoritative. Read by the `research-gatherer`
   subagent.
3. **Web search** — only to fill gaps or locate the official URL.

Fallback: context7 absent, `resolve-library-id` empty/ambiguous, or the tool uncovered → proceed on
official docs + web, and stamp the note `context7: uncovered` so it is not mistaken for version-verified.
context7 is preferred, never required. (Its `.mcp.json` entry is added at `/harness-init`, Phase 2:
`"context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }`.)

## Tool key normalization

Lowercase canonical package/service name: `supabase` (not `Supabase`, `supabase-js`, or
`@supabase/supabase-js`). Record variants + the context7 library ID in the entry `_index.md` `aliases:`
field; the cache lookup checks aliases.

## Staleness + version rule

Short-circuit (report "known", stop) ONLY when the `wiki/stack/<tool>/` entry: (a) `covers:` the
requested focus, (b) `researched-version:` matches the requested/pinned major, and (c) `updated:` is
within **90 days**. Any miss → research the gap and extend the entry. A version mismatch forces
re-research regardless of date. An incompatible second major → `wiki/stack/<tool>/v<major>/`.

## Frontmatter contract

Raw note `inbox/research/<tool>.md`:
`type: research`, `updated: YYYY-MM-DD`, `doc-sources:` (list of URL + version), `tags:`.

Evergreen `wiki/stack/<tool>/` — folder `_index.md`: `type: index`, `updated:`, `covers:` (aspect list),
`versions:` (majors covered + where), `aliases:`, `tags:`. Pages: `type: reference`, `updated:`, `tags:`,
`researched-version:`, `verified: true|low-confidence`, `doc-sources:`, `related:` (link the inbox note).

`doc-sources:` is documentation provenance (URLs + versions). It is DISTINCT from `sources:`, which stays
repo file-path provenance (re-verifiable against code) and is usually empty for pure-doc research.

## No vault (degraded)

No vault wired → write findings to repo `reports/research-<tool>.md`, and check that same file (version +
90-day window) on the next run. Intra-repo, cross-time reuse only; cross-PROJECT reuse genuinely needs a
vault — say so, don't pretend otherwise.

## Index Law on first distil

Creating `wiki/stack/<tool>/` also creates `wiki/stack/_index.md` and updates `wiki/_index.md` to link to
`stack/` — all in the same change. Leave a pointer stub in `inbox/research/<tool>.md` per the vault's
research SOP.
```

- [ ] **Step 2: Verify budget**

Run: `node tools/context-ledger.mjs template`
Expected: clean; the reference reports within the `reference` class (≤170 lines — this file is ~65); total unchanged (references are not always-loaded).

- [ ] **Step 3: Commit**

`/commit` staging only `template/.claude/references/research-and-docs.md`. Message:
`feat: add research-and-docs reference (source order, staleness, frontmatter contract)`

---

## Task 3: `/research` skill

**Files:**
- Create: `template/.claude/skills/research/SKILL.md`

**Interfaces:**
- Consumes: the `research-gatherer` agent (Task 1) and `references/research-and-docs.md` (Task 2).
- Produces: the `/research <tool>[@version] [focus]` command. Output-contract lines start with `Researched ` (did work) or `Known: ` (cache hit).

- [ ] **Step 1: Create the skill file** with exactly this content (body is ≤100 lines — do not exceed):

```markdown
---
name: research
description: "Research an external tool/library for the version a project pins, cache it in the vault (wiki/stack/<tool>/) for cross-project reuse, and ground work in current docs. Writes wiki/stack/<tool>/ + inbox/research/<tool>.md."
disable-model-invocation: true
argument-hint: "<tool>[@version] [focus]"
---

# /research <tool>[@version] [focus]

Ground work in current documentation and make it reusable. Cache-first at `wiki/stack/<tool>/`; fetch
from context7 + official docs on a miss; distil back to the vault. Vault-gated — no vault → degrade to
repo `reports/`. Mechanics, source order, staleness rule, frontmatter: `.claude/references/research-and-docs.md`.

## 1 · Parse the request

Normalize `<tool>` to the canonical lowercase package/service key (record aliases). `@version` → the
major to research; default to the project's pinned version if discoverable (lockfile/manifest), else
latest. `[focus]` → the aspect (auth, realtime, webhooks…); default general.

## 2 · Check the cache first — `wiki/stack/<tool>/` ONLY

Read `wiki/stack/<tool>/_index.md` (check `aliases:`). Short-circuit ONLY when it (a) `covers:` the
focus, (b) `researched-version:` matches the requested/pinned major, and (c) `updated:` is within 90
days → summarize it and STOP (report the path). Otherwise continue to extend/refresh. An
`inbox/research/<tool>` hit is untriaged raw — surface it, never short-circuit on it. No vault → apply
the same rule to `reports/research-<tool>.md`.

## 3 · Gather (orchestrator directs, sonnet gathers)

Resolve via the `context7` MCP IN THE MAIN LOOP (`resolve-library-id` → `get-library-docs`) if wired;
absent/empty/ambiguous → skip and stamp `context7: uncovered`. Then write a precise brief (exact
questions, target version, required sources = context7 result + official docs, output shape + line cap)
and dispatch `research-gatherer` (sonnet) to read official docs + web. It returns structured, sourced
findings. Model discipline per `docs/04`: you think and direct; the subagent gathers.

## 4 · Verify before trusting

Spot-check the load-bearing claims against the cited `doc-sources:` URLs (context7 + official). Drop or
mark low-confidence anything unconfirmed. Never relay unverified findings.

## 5 · Write raw → inbox (staging)

Write `inbox/research/<tool>.md`: `type: research`, `updated: <today>`, `doc-sources:` (URLs+versions),
`tags:`. Update `inbox/research/_index.md` (Index Law).

## 6 · Distil to the cache (default) → `wiki/stack/<tool>/`

Harvest the cross-project essentials into `wiki/stack/<tool>/`. First write creates the full Index-Law
chain: `wiki/stack/<tool>/_index.md` (`covers:`, `versions:`, `researched-version:`, `aliases:`),
`wiki/stack/_index.md`, and a link down from `wiki/_index.md`. Pages carry `type: reference`, `updated:`,
`tags:`, `researched-version:`, `verified:`, `doc-sources:`, `related:` (link the inbox note). A second
incompatible major → `wiki/stack/<tool>/v<major>/`. Leave a pointer stub in the inbox note.

Autonomous mode (`.claude/references/autonomous-mode.md`; e.g. invoked from `/plan`): no interactive
step — distil with the conservative default and log the write under `## Assumptions`. No vault → write
findings to `reports/research-<tool>.md` instead (intra-repo reuse only).

## Output contract

One line, no recap:
- Did work: `Researched <tool>@<version> (<focus>) · <wiki/stack/<tool>/ | reports/research-<tool>.md> · Next: cite it in your plan/impl`
- Cache hit: `Known: <tool>@<version> (<focus>) fresh at wiki/stack/<tool>/ · Next: use it`

Blockers replace that line.
```

- [ ] **Step 2: Verify the ≤100-line body cap**

Run: `sed '1,/^---$/d; 1,/^---$/d' template/.claude/skills/research/SKILL.md | wc -l`
(deletes through the frontmatter's closing `---`, then counts the remaining body lines)
Expected: a number **≤ 100**.

- [ ] **Step 3: Verify the ledger passes the skill**

Run: `node tools/context-ledger.mjs template`
Expected: clean; the skill reports within its class (≤100 lines, no soft-cap warn); total `< 2000` (this skill has `disable-model-invocation: true`, so only its description counts toward always-loaded — a few tokens).

- [ ] **Step 4: Commit**

`/commit` staging only `template/.claude/skills/research/SKILL.md`. Message:
`feat: add /research skill (cache-first, doc-grounded, vault-reuse)`

---

## Task 4: Wire the always-loaded surface (`00-core` + `CLAUDE.md`)

**Files:**
- Modify: `template/.claude/rules/00-core.md` (Dispatch table)
- Modify: `template/CLAUDE.md` (Context tiers list)

**Interfaces:**
- Consumes: `/research` (Task 3), `research-gatherer` (Task 1).
- Produces: the always-loaded pointers that make agents reach for `/research`. These are the only always-loaded additions in Phase 1 — keep them to one line each.

- [ ] **Step 1: Add the dispatch row to `00-core.md`.** Find this row in the Dispatch table:

```
| Implement | general-purpose — model per the plan's hint |
```

Insert immediately ABOVE it:

```
| External tool/library docs & how-to | `/research <tool>[@version]` — cache-first at `wiki/stack/<tool>/`, then context7 + official docs (dispatches `research-gatherer`); never code an external API from memory |
```

- [ ] **Step 2: Add the context-tiers bullet to `CLAUDE.md`.** Find this bullet in the "Context tiers" section:

```
- **Navigate by symbol, not grep**: the `codebase-search` MCP (`where_is`/`find_references`/`outline`, Python) + LSP diagnostics (`.lsp.json`) come before text search — `.claude/references/symbol-navigation.md`.
```

Insert immediately AFTER it:

```
- **Doc-grounded work**: building against an external tool/library? Consult its docs for your pinned version — `wiki/stack/<tool>/` first, else `/research` (context7 + official docs). Never code an API from memory.
```

- [ ] **Step 3: Verify the always-loaded budget held**

Run: `node tools/context-ledger.mjs template`
Expected: total still `< 2000` tokens (two one-line additions ≈ +40 tokens); no per-file budget warnings (`00-core.md` ≤45 lines rule class, `CLAUDE.md` ≤60). If `CLAUDE.md` exceeds 60 lines, trim the weakest existing conventions line — do not shorten the new bullet's meaning.

- [ ] **Step 4: Confirm line counts**

Run: `wc -l template/CLAUDE.md template/.claude/rules/00-core.md`
Expected: `CLAUDE.md` ≤ 60; `00-core.md` ≤ 45 (add-one-row keeps it within class).

- [ ] **Step 5: Commit**

`/commit` staging `template/.claude/rules/00-core.md` and `template/CLAUDE.md`. Message:
`feat: wire doc-grounded work into 00-core dispatch + CLAUDE.md context tiers`

---

## Task 5: Wire the pipeline skills (`/plan` + `/implement`)

**Files:**
- Modify: `template/.claude/skills/plan/SKILL.md` (step 4)
- Modify: `template/.claude/skills/implement/SKILL.md` (section 3)

**Interfaces:**
- Consumes: `/research` (Task 3). These skills have `disable-model-invocation: true`, so their bodies are NOT always-loaded — only their descriptions count. Do not change the descriptions.

- [ ] **Step 1: Add the external-docs bullet to `/plan` step 4.** In `template/.claude/skills/plan/SKILL.md`, find:

```
- Read directly only what the plan will name: files to be modified (real line numbers), the closest existing analogue, relevant rules/context modules.
```

Insert immediately ABOVE it:

```
- External tools/services the plan builds against (major frameworks & services — NOT transitive deps): read `wiki/stack/<tool>/` frontmatter for version + freshness; on a miss/stale/version-mismatch run `/research <tool>@<pinned>`. Cite the `wiki/stack/<tool>/` path in the plan's Context. Never plan tool usage from memory. Detail: `.claude/references/research-and-docs.md`.
```

- [ ] **Step 2: Add the consult-docs reminder to `/implement` section 3.** In `template/.claude/skills/implement/SKILL.md`, find this line (end of the section-3 dispatcher rules):

```
- File-mutating subagents run **sequentially** (parallel worktree agents have collided and leaked edits). Parallelize read-only research only. Sole exception: Wave mode.
```

Insert immediately AFTER it:

```
- Building against an external tool/library? Consult its `wiki/stack/<tool>/` cache or current docs (the plan should name it) BEFORE writing tool-specific code — do not code the API from memory. Missing/stale → `/research <tool>@<pinned>` first.
```

- [ ] **Step 3: Verify budgets**

Run: `node tools/context-ledger.mjs template`
Expected: clean; both skills stay within the skill body class (≤100; if either was already near 100, confirm the one-line add did not push it over — `/plan` and `/implement` are ~90 and ~99 lines; if `/implement` would exceed 100, move a low-value line into a reference rather than dropping the new one). Total `< 2000` unchanged (descriptions untouched).

- [ ] **Step 4: Commit**

`/commit` staging both skill files. Message:
`feat: add consult-docs steps to /plan and /implement`

---

## Task 6: Reconcile the knowledge layer (`docs/05` + `README`)

**Files:**
- Modify: `docs/05-knowledge-layer.md`
- Modify: `README.md`

**Interfaces:**
- Produces: the doctrine that (a) names `wiki/stack/<tool>/` the tool-keyed evergreen cache, (b) adds `doc-sources:` to the frontmatter contract, (c) divides the two harvest triggers so `/research` does not contradict "/evolve is THE harvest trigger."

- [ ] **Step 1: Add the doc-grounded section to `docs/05`.** Find the section header:

```
## Claude Code auto-memory — complement, not replacement
```

Insert immediately ABOVE it:

```
## Doc-grounded tool research — `wiki/stack/<tool>/`

External-tool knowledge (Supabase, Stripe, a framework) is inherently cross-project, so it gets a
tool-keyed evergreen home: **`wiki/stack/<tool>/`**, the durable cache the reuse decision keys off
(tool + major version). `/research <tool>[@version] [focus]` is the loop: check that cache first; on a
miss/stale/version-mismatch, fetch CURRENT docs (context7 MCP + official docs), verify, write raw to
`inbox/research/<tool>.md` (staging), then distil to `wiki/stack/<tool>/`. Agents never code an external
API from training memory — they consult the cache or current docs for the version the project pins.
Detail: `.claude/references/research-and-docs.md`.

**Two harvest triggers, cleanly divided.** `/evolve` remains THE trigger for **session lessons**
(`inbox/`/`projects/ → wiki/`, ask-first). `/research` is the built-in harvest for **external-tool
knowledge**, which — being inherently cross-project — writes straight to `wiki/stack/<tool>/` (skipping
`projects/`) as part of its own run, so it is not a "harvest later" anyone must remember. Both keep the
Index Law and the sole-source-of-truth / no-mirror doctrine.
```

- [ ] **Step 2: Add `doc-sources:` to the frontmatter contract.** In `docs/05`, find:

```
- `sources:` — exact repo file-path provenance list. Makes a note re-verifiable against code.
```

Insert immediately AFTER it:

```
- `doc-sources:` — documentation provenance (URL + version) for `research`/`reference` notes. Distinct
  from `sources:` (code paths); a doc-research note uses `doc-sources:` and usually leaves `sources:` empty.
```

- [ ] **Step 3: Update the README knowledge-layer line.** In `README.md`, find (line 29):

```
4. **Knowledge** (cross-project): pointer-block wiring to an Obsidian vault; `/evolve` is the harvest trigger.
```

Replace it with:

```
4. **Knowledge** (cross-project): pointer-block wiring to an Obsidian vault; doc-grounded work via `/research` (tool docs cached once at `wiki/stack/<tool>/`, reused everywhere, always current for your pinned version); `/evolve` harvests session lessons and prunes.
```

- [ ] **Step 4: Verify doc budgets**

Run: `node tools/context-ledger.mjs template`
Expected: clean (docs/05 and README are repo-level, not in `template/`; the ledger scans `template/` — these edits do not affect always-loaded). Also eyeball: `wc -l docs/05-knowledge-layer.md` stays near the ≤130 review guideline (it is ~92 + ~14 added ≈ 106 — fine).

- [ ] **Step 5: Commit**

`/commit` staging `docs/05-knowledge-layer.md` and `README.md`. Message:
`docs: reconcile knowledge layer for tool-keyed research reuse (wiki/stack, doc-sources, two triggers)`

---

## Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full always-loaded ledger**

Run: `node tools/context-ledger.mjs template`
Expected: exit clean; total `< 2000` tokens; NO per-file budget warnings for any rule/skill/reference/agent/CLAUDE.md.

- [ ] **Step 2: Run the hook smoke test (must be unaffected)**

Run: `node template/.claude/hooks/smoke-test.mjs`
Expected: `61/61` (or the repo's current fixture count) passing. No hooks changed; this confirms nothing regressed.

- [ ] **Step 3: Confirm the skill body cap**

Run: `sed '1,/^---$/d; 1,/^---$/d' template/.claude/skills/research/SKILL.md | wc -l`
Expected: ≤ 100.

- [ ] **Step 4: Coherence read-through (no-prior-knowledge test)**

Read `template/.claude/skills/research/SKILL.md`, `research-gatherer.md`, and `research-and-docs.md` in sequence and confirm: every field named in the skill (`covers:`, `researched-version:`, `verified:`, `doc-sources:`, `aliases:`, `context7:` marker) is defined in the reference; the `research-gatherer` return sections match what step 3 expects; the cache is `wiki/stack/<tool>/` everywhere (no `inbox/` short-circuit); context7 is called from the main loop and has a stated fallback. Fix any mismatch inline, then re-run Step 1.

- [ ] **Step 5: Confirm the branch + clean tree**

Run: `git -C /Users/cristian-robertiosef/Dev/perfectHarnessEngineering status -sb`
Expected: on `feat/vault-research-reuse`; working tree clean (all six commits landed).

---

## End-to-end verification (feature proof)

The feature "works" for Phase 1 when: the ledger is clean and <2000 always-loaded; the smoke test is green; `/research` SKILL.md is ≤100 lines; and the three new files + six edits are internally consistent (Step 4 read-through) so a fresh agent could run `/research supabase@2 auth` and know exactly where the cache is, which sources to use, the fallback when context7 is absent, and which frontmatter to write. Runtime behavior (actually fetching Supabase docs) is exercised in the manual check below, not gated by CI.

**Manual smoke (optional, needs a scratch project + vault):** `/research supabase@2 auth` writes `inbox/research/supabase.md` and distils `wiki/stack/supabase/` stamped `researched-version: 2`, `covers: [auth]`; a rerun reports `Known:`; `/research supabase@2 realtime` extends `covers:` rather than short-circuiting; `/research supabase@3` creates `wiki/stack/supabase/v3/` rather than overwriting v2.

## Out of scope (Phase 1)

- `template/.claude/references/vault-scaffold/**` and `/harness-init` changes — **Phase 2**.
- Adding `context7` to `template/.mcp.json` — **Phase 2** (`/harness-init` adds it).
- Any AIDF-repo change — **Phase 3**.
- Seeding real `wiki/stack/<tool>/` tool pages — that is content produced by using `/research`, not framework code.
- Automatic staleness/version re-checks, retraction tooling with dependent alerting — future design (see spec Out of scope).
