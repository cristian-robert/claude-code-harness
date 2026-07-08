# 04 · Model Policy — Route by Judgment, Not by Size

## Principle

The orchestrator does the thinking; cheap models execute well-specified subtasks. The strong
model writes the brief, bit by bit — a weaker model succeeds exactly to the degree the
dispatch prompt already removed the judgment. Route by "how much unwritten judgment does this
task need," never by "how big is the diff."

## Routing matrix

| Model | Route here | Never here |
|---|---|---|
| haiku | Pure retrieval: find files, fetch/list, classify or extract into a given schema | Anything needing a decision the prompt didn't pre-make |
| sonnet | Research + summarize, read-only verification (run the gate, report real output), mechanical transforms with an exact spec | Implementation of L/XL work; any review |
| fable / opus | Judgment: architecture, planning, implementation of L/XL work, debugging, ALL reviewers | — |

**Never downgrade a reviewer to save money.** A reviewer that misses bugs is worse than no
reviewer: it stamps GREEN on broken work and every downstream stage trusts the stamp. Review
is judgment work — pay for it.

## Rules

- **Every dispatch passes `model:` explicitly.** Defaults drift with platform config; an
  unpinned dispatch is a silent quality or cost bug.
- **The planner pins a `model:` hint per plan task.** `/implement` executes the hint instead
  of re-judging — one judgment, made once, by the strongest model, at plan time.
- **Env floor only raises.** An `AIDF_MODEL_FLOOR=opus`-style override promotes anything
  routed below the floor upward; it never authorizes a downgrade above it.
- **Effort scales the same axis.** `low` for mechanical transforms, default for normal work,
  `xhigh` for hard verification and review. Cheap model at high effort ≠ strong model.

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

- AIDF v0.8 — `subagent-model-selection.md`, plan-task `model:` fields, `AIDF_MODEL_FLOOR`
  (research brief: `~/Dev/The Vault/inbox/research/phe-harness/aidf-v08.md`).
- The Vault, SentrOS `dev-workflow-and-tooling.md` — explicit-`model:` dispatch discipline,
  security-framing gotcha (research brief: `~/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md`).
- Anthropic multi-agent research system — ~15x token figure (research:
  `anthropic-agents-more.md`).
