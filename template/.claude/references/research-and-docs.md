# Research & docs — the doc-grounded loop

How `/research` and the doc-grounded rule work. Loaded only when they run.

## Principle

Never code an external tool/library/API from training memory — it drifts. Consult the docs for the
version THIS project pins. Check the shared-store cache (`wiki/stack/<tool>/`) first; on a miss/stale/
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

## Contract claims come from raw text

A summarized fetch (WebFetch answering a prompt over a page with a small model) is fine for
"how does X work" and is NOT a source for a contract claim — a field name, a frontmatter key, a
flag, an exit-code rule, a version floor. The summarizer invents plausible names with no error
signal: on 2026-09-05 it reported the SessionStart hook field as `start_reason`; the raw page says
`source`. For any claim that ends up in a hook, a rule, or a reference:

1. Fetch the raw page — Claude Code docs serve markdown at `https://code.claude.com/docs/en/<page>.md`;
   most doc sites have an equivalent (`.md`, `?raw`, the GitHub source).
2. `grep` the exact token in that text and quote the line, with the URL and the date read.
3. No raw form available → mark the claim `unverified (summary only)` in the note and in docs/99's
   unverified table; never let it into a hook or a rule.

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

## No shared store (degraded)

No shared store wired → write findings to repo `reports/research-<tool>.md`, and check that same file
(version + 90-day window) on the next run. Intra-repo, cross-time reuse only; cross-PROJECT reuse
genuinely needs a shared store — say so, don't pretend otherwise.

## Index Law on first distil

Creating `wiki/stack/<tool>/` also creates `wiki/stack/_index.md` and updates `wiki/_index.md` to link to
`stack/` — all in the same change. Leave a pointer stub in `inbox/research/<tool>.md` per the shared
store's research SOP.
