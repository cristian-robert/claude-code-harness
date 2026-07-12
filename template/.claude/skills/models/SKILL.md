---
name: models
description: "Re-verify .claude/harness.json -> models against the live model catalogs and propose an update, ask-first. Run when session-start says the map is stale, or after a vendor ships a new model family."
disable-model-invocation: true
allowed-tools: Read, Edit, WebFetch, Bash
---

# /models — refresh the tier map

The map in `.claude/harness.json` → `models` is the ONE place a model is named. Everything else pins
a role (`scout` | `build` | `deep`). This command re-verifies the map and **proposes** a diff. It
never writes without a yes.

## 1 · Read the current map

Read `.claude/harness.json` → `models`. Note `checkedAt`.

## 2 · Fetch both live catalogs

| Harness | Source | Why this one |
|---|---|---|
| Codex | `https://chatgpt.com/backend-api/codex/models?client_version=<installed>` | Codex's own catalog endpoint (`codex-rs/model-provider/src/models_endpoint.rs`); it is what the CLI itself reads. Get the version from `codex --version`. |
| Claude | `GET https://api.anthropic.com/v1/models` | The live Models API. Requires auth — if it 401s, fall back to the published model reference and SAY you did. |

If a fetch fails, say so plainly and do not touch that harness's half of the map. A half-verified map
recorded as fully verified is worse than a stale one.

## 3 · Diff against the roles

For each harness, check that every role still maps to a live model, and whether a **newer member of
the same family** has shipped:

- `scout` — cheapest reading tier. Never a model that has to decide anything.
- `build` — spec-following implementation. The planner already made the judgment calls.
- `deep` — hard logic, architecture, planning.

On Claude, prefer the **family alias** (`opus`, `sonnet`, `haiku`) over a pinned ID: aliases float to
the newest family member on their own, so they need no maintenance. Only pin an ID if the alias is
gone. On Codex there are no aliases — its IDs are pinned and are the real reason this command exists.

Also re-check the **effort ceilings**: as of 2026-07-12 `gpt-5.6-luna` is the one 5.6 model with no
`ultra`. `cli/emit-codex.js` → `CODEX_EFFORTS` encodes that and will throw at emit if it drifts —
update it in the same change.

## 4 · Propose, then ask

Show a table: role · harness · current · proposed · why. Then **ask**. On yes:

- update `models` (merge-preserve — never rewrite `harness.json` wholesale; it also holds the stop
  gate, vault, and work-tracking config),
- set `checkedAt` to today,
- update `CODEX_EFFORTS` in `cli/emit-codex.js` if a ceiling moved,
- re-run `npm test` and report the real output.

On no: change nothing, and do not touch `checkedAt` — an unchanged map that was checked is still
stale until the user accepts the check.

## 5 · Reviewer rule (unchanged by any refresh)

The reviewer is the **sibling** of whoever implemented — `deep`-written code is reviewed at `build`,
`build`-written at `deep`, always `effort: xhigh`. A refresh may change *which model* a tier names; it
never changes this inversion. If a proposed map would make `build` and `deep` the same model, REFUSE
it — the reviewer would then be the model that wrote the code.
