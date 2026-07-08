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
