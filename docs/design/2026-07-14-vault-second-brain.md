# 2026-07-14 · Vault as second brain — retrieval + capture across the whole pipeline

PO directive: "our agents should work very closely with the vault. it should be the second brain
of our agent." This design deepens the existing plan-time wiring into a full loop.

## Current wiring (audited 2026-07-14)

Reads: `/plan-work` (wiki/stack + architect-agent), `/implement` (wiki/stack), `/research`
(cache-first). Writes: `/research` (wiki/stack + inbox), `/evolve` (architect RECORD + wiki,
ask-first). Nothing else touches the vault: `/backlog`, `/validate`, debugging, qa-evaluator have
no retrieval; capture happens only at end-of-cycle, ask-first. The vault's own Agent SOP
(agent-kb before designing agents) is unwired.

## Decisions locked (PO, 2026-07-14)

1. **Both directions** — more retrieval AND continuous capture, not one side.
2. **Reviewer stays isolated** — `/review-branch` and `code-reviewer` keep seeing only
   diff + plan + protocol (generator/evaluator separation, ADR-003). Vault knowledge reaches
   review only through the plan's cited paths.
3. **Write policy** — agents auto-append to `inbox/` and `projects/<name>/` (the vault's designed
   staging + working layers). Promotion to evergreen `wiki/`/`agent-kb/` and any rule change stays
   ask-first, owned by `/evolve`.
4. **Mechanism** — protocol reference + per-stage wiring, with the **official Obsidian CLI** as the
   retrieval/capture accelerator (approach "1+3"): no MCP dependency; the CLI is optional.

## Verified platform facts

- Official Obsidian CLI present at `/usr/local/bin/obsidian`; `obsidian vault` resolves
  The Vault (169 files) and `search`, `search:context` (with `path=` folder scoping, `limit=`,
  `format=json`), `read`, `append`, `backlinks`, `properties`, `outline` all work from a shell
  (verified 2026-07-14 on this machine).
- The CLI talks to the Obsidian app; availability on a given machine is NOT guaranteed →
  every use degrades to file reads on any error.

## Component 1 — `.claude/references/vault-protocol.md` (new, load-on-cite, ≤45 lines)

The single contract every vault-touching skill/agent cites. Contents:

- **Resolution chain**: AGENTS.md `## Knowledge Vault` pointer block → `.claude/harness.json`
  `vault.path`. Neither → NO VAULT: skip vault steps loudly (existing degradation pattern).
- **Retrieval ladder**: (1) `obsidian` CLI on PATH → `search:context query=<q> path=projects/<name>`
  (or `wiki/`, `agent-kb/` as the question dictates), `read`, `backlinks`; (2) any CLI error or
  absence → `_index.md` navigation file reads (3–4 reads: vault CLAUDE.md conventions assumed
  known → `_index` → folder `_index` → file). Never run both for the same lookup.
- **Write policy**: auto-append allowed ONLY under `inbox/` and `projects/<name>/` — via
  `obsidian append` or plain file write; every write obeys the Index Law (folder's `_index.md`
  updated in the same change) and Obsidian conventions (frontmatter, `[[wikilinks]]`; the global
  `obsidian-markdown` skill is the reference when available). `wiki/`/`agent-kb/` promotion and
  rule changes: ask-first, via `/evolve` only.
- **Per-stage RETRIEVE/CAPTURE table** (the rows below).

## Component 2 — per-stage wiring (each edit cites vault-protocol.md)

| Stage / agent | RETRIEVE before acting | CAPTURE after |
|---|---|---|
| `/backlog` refine | prior art + conflicts: `projects/<name>/decisions.md`, wiki search | — (item Log stays canonical) |
| `/plan-work` | existing wiki/stack + architect; NEW: product is an AI agent → `agent-kb/` patterns/models/tooling before designing | — |
| debugging (`debugging-this-repo` skill) | `projects/<name>/runbook.md` + vault failure-class search BEFORE diagnosing | confirmed root cause auto-appends to runbook known-failure classes |
| `/validate` + `qa-evaluator` brief | `projects/<name>/runbook.md` (how to drive the app) | — |
| `/review-branch` | none — isolated by decision 2 | — |
| `/evolve` | — | unchanged mechanics; framed as THE promotion gate (inbox/projects → wiki/agent-kb, ask-first) |
| `architect-agent` | adds `agent-kb/` to its RETRIEVE surface; MAY use CLI search as accelerator (same ladder) | RECORD unchanged |

`00-core.md` dispatch rows are amended IN PLACE (bug route gains the runbook retrieval; no new
rows — the rules budget is at its cap).

## Component 3 — session-start nudge

`session-start.mjs` prints ONE line when a vault is configured:
`Vault: <path> · project wiki: projects/<name>/ · protocol: .claude/references/vault-protocol.md`.
Hook edit → new smoke-test fixture (hard rule), covering: vault configured, not configured,
malformed harness.json (fail-open, no line).

## Budgets, degradation, testing

- Always-on cost: the one session-start line. Everything else is lazy (skills load on invocation,
  the reference on cite). Ledger must stay ≤2000; skill bodies ≤100 — amendments are in-place or
  single lines, cutting where needed.
- No vault → skip loudly. No CLI → file reads. CLI mid-command error → file reads. Nothing blocks.
- Tests: smoke-test fixtures for the session-start line; `npm test` green; ledger green;
  manual: one CLI search + one file-fallback lookup exercised in a real skill flow.

## Out of scope (rejected)

- Vault-search MCP (new dependency; the CLI covers v1 — revisit only if recall proves weak).
- Universal vault-librarian agent (dispatch latency/tokens at every stage; overlaps architect-agent).
- Reviewer vault access (decision 2).
- Auto-writes to `wiki/`/`agent-kb/` (pollutes evergreen layers other projects trust).
- `/handoff` writing to the vault (task state lives in `plans/`/`reports/` per 00-core memory rule).

## Rollout

Ships as ordinary payload files — `update` delivers them with `.backup` semantics; no migration
needed. Record as ADR-012 in the vault at evolve time.
