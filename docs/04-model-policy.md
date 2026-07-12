# 04 · Model Policy — Route by Judgment, Not by Size

## Principle

The orchestrator does the thinking; cheap models execute well-specified subtasks. The strong
model writes the brief, bit by bit — a weaker model succeeds exactly to the degree the
dispatch prompt already removed the judgment. Route by "how much unwritten judgment does this
task need," never by "how big is the diff."

## Roles, not models

| Role | Route here | Never here |
|---|---|---|
| `scout` | Pure retrieval: find files, fetch, list, extract into a given schema | Anything needing a decision the prompt did not pre-make. **Never planning.** |
| `build` | Implementation the planner already specified step by step; mechanical transforms; read-only verification | Work whose design is still open |
| `deep` | Hard code, logic, architecture, planning, debugging | — |

Concrete IDs live in **one** file: `.claude/harness.json` → `models`, with a `checkedAt`. `/models`
re-verifies it against the live catalogs; session-start warns past `staleDays`. Model IDs churn — the
gpt-5.6 family landed two days before the design that needed it. A role survives that; an ID does not.

Plans, rules, skills, and agent frontmatter therefore name a **role**, never a model. The planner
pins `tier:` per plan task and `/implement` executes that hint instead of re-judging it — one
judgment, made once, by the strongest model, at plan time.

## The reviewer is the sibling, never the author

`deep`-written code is reviewed at `build`. `build`-written code is reviewed at `deep`. Always at
`effort: xhigh`. **A model does not find the bug it just wrote** — different weights fail differently,
and that difference is the entire value of a review.

> **This supersedes the old "never downgrade a reviewer" rule.** That rule optimized for reviewer
> *capability*; this one optimizes for reviewer *independence*. Sonnet reviewing Opus is a downgrade
> in raw capability and we are taking it on purpose, buying back the gap with `xhigh` effort. The
> failure it prevents — a model rubber-stamping its own reasoning — is the one we actually kept hitting.

`review` is not a role for exactly this reason: it has no fixed model. It is derived per dispatch
from whoever implemented.

## Three cost rules

1. **Read-heavy work swaps the MODEL, not the effort.** Effort scales *reasoning* (output) tokens; a
   scan is ~95% input. Sol at `low` still bills $5/1M input; Luna at `high` bills $1. *Sol-at-low is
   never the correct scout.* Same on Claude: Opus-at-low is not a cheap Haiku.
2. **Keep requests small — but not because of a cliff.** Codex's gpt-5.6 window is **372K**. The
   widely repeated "2× input / 1.5× output past 272K" surcharge **does not appear on any gpt-5.6
   pricing row** — 272K is the *context window* of the older 5.4/5.5 generation, not a 5.6 billing
   threshold (see `docs/99`). Fan out and `/handoff` because big contexts cost money and degrade
   attention, not because of a phantom cliff.
3. **Do not compare headline $/token across vendors.** Anthropic's newer tokenizer (Opus 4.7+,
   Sonnet 5, Fable 5) emits **~30% more tokens for the same text**, so a naive $/token comparison
   understates its real cost. Compare cost-per-task, measured.

## Effort is a separate axis — pin it, never inherit it

Codex's own default effort is **contradictory across its docs and its shipping catalog** (`gpt-5.6-sol`
defaults to `low` in models.json while the docs say `medium`). Never inherit; always pin.
Ceilings as of 2026-07-12: `gpt-5.6-luna` is the one 5.6 model **without `ultra`**; Claude's
Haiku 4.5 rejects the `effort` parameter entirely.

## Cost sanity

Multi-agent runs burn ~15x the tokens of a single chat (Anthropic's own research-system
figure). Fan out only when breadth justifies it: many independent read-only questions —
research, codebase survey, parallel verification. Depth (one hard sequential problem) stays
in the main loop; parallelizing it buys tokens, not progress. File-mutating subagents run
sequentially regardless (rule 00-core).

## The security-framing gotcha

Offensive-security-framed subagent prompts ("exploit", "bypass", "attack the target") can
trip automated safety classifiers and come back as a 0-token empty run with no error worth
the name — observed repeatedly in the operator's SentrOS repo. Two mitigations:

1. **Describe the code change, not the attack** — "add host canonicalization to the scanner
   input path," not "defeat the scanner's host filter."
2. **Or do that piece in the main loop** instead of dispatching — the interactive session is
   not subject to the same silent-empty failure mode.

## Sources

- Model IDs, prices, context window, effort levels: verified 2026-07-12 against primary sources —
  see `docs/99-sources.md` → "Model policy". The 272K surcharge is listed there as **refuted**.
- AIDF v0.8 — plan-task model hints, one-judgment-at-plan-time (research brief:
  `~/Dev/The Vault/inbox/research/phe-harness/aidf-v08.md`).
- The Vault, SentrOS `dev-workflow-and-tooling.md` — explicit-dispatch discipline, security-framing
  gotcha (research brief: `~/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md`).
- Anthropic multi-agent research system — ~15x token figure (research: `anthropic-agents-more.md`).
