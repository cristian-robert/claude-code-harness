# Dispatch protocol

Loaded when 00-core's Dispatch table isn't enough: writing a non-trivial brief, choosing fan-out, or debugging a bad dispatch.

## The four-element brief (all four, every dispatch)

| Element | Contains | Failure it prevents |
|---|---|---|
| Objective | ONE goal, one sentence | divergent interpretation |
| Output format | exact structure + size cap | context-flooding returns |
| Tool guidance | which tools/sources; what to avoid | wrong-tool wandering |
| Boundaries | out of scope, files not to touch, when to stop early | duplicated work, gaps |

Subagents share zero conversation context: include concrete paths, constraints, and the repo facts they need. "Research the auth flow" is a defective brief — four vague dispatches once cost more than one good main-loop read.

Worked example (scout):

    Objective: How are DB migrations applied in this repo, and what would adding a
      tenant_id column to orders touch?
    Output: scout return contract (Answer/Files/Pointers/Gaps), <=40 lines.
    Tools: Grep/Glob/Read within db/, src/models/, scripts/; Bash read-only (git log/show).
    Boundaries: node_modules, reports/, plans/ out of bounds. Stop early if
      migrations are vendored — just say so.

## Tier + effort matrix (pin both on every dispatch)

Roles, never model names. `.claude/harness.json` → `models` maps them per harness; `/models` refreshes it.

| Work | Dispatch | tier: | effort: |
|---|---|---|---|
| Locate/trace a symbol | `codebase-search` MCP (where_is/find_references/outline) if wired, else targeted grep — see symbol-navigation.md | — | — |
| Locate files / text | built-in Explore | `scout` | — |
| Understand / synthesize | `scout` agent | `routine` | medium |
| Implement | general-purpose | per the plan's `tier:` — `build` never runs on the `routine`-grade model; `routine` only for text-only or trivially easy tasks | high |
| Code review | `code-reviewer` | **`deep`, fresh context** | xhigh |
| Runtime check | `qa-evaluator` | `deep` | high |
| Acceptance evidence pass | `qa-evaluator`; browser flows → global `tester-agent` | `deep` | high |

**The reviewer never shares the session that wrote the code.** Every review runs at `deep`,
`effort: xhigh`, in a fresh context that sees only diff + plan + protocol. The sibling inversion
(deep↔build) was retired 2026-09-05 when `build` moved up a model class: weight diversity is gone, context
isolation is the independence.

Model resolution, in order (verified 2026-09-05 against code.claude.com/docs/en/sub-agents.md and the
2.1.251 / 2.1.257 changelog entries): the per-invocation `model` → the agent's `model:` frontmatter →
`CLAUDE_CODE_SUBAGENT_MODEL` (a DEFAULT since 2.1.251, no longer an override) → the session model. A
dispatch that pins no tier inherits that default or the session model — a silent cost and quality bug.

**`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` defeats the reviewer's `deep` pin.** Added in 2.1.257, it applies
`CLAUDE_CODE_SUBAGENT_MODEL` (or the main model) to EVERY subagent, ignoring per-spawn and frontmatter
models: a session on a weaker model would review on it, with no error and nothing in the transcript.
Never set it in a harnessed repo; `session-start.mjs` warns when it is exported. (Before 2.1.251 the
plain variable had this effect — the old warning traced to that.)

## Effort scaling (models misjudge effort — budget it in the brief)

| Task shape | Agents | Budget |
|---|---|---|
| Simple lookup | 1 | 3–10 tool calls |
| Comparison / trace | 2–4, disjoint scopes | 10–15 calls each |
| Complex survey | 10+, decomposed with divided responsibilities | only when breadth justifies ~15x tokens |

Multi-agent ≈ 15x single-chat tokens, and it is a poor fit for work needing shared context — most coding. Depth stays in the main loop.

## Return-size contract

≤30 lines, paths not contents. A subagent with more to say writes a file (reports/ or scratch) and returns the path. Quote at most 3 lines when an exact signature is load-bearing.

## Sequential mutators (and the Wave exception)

File-mutating subagents run one at a time — await each result before dispatching the next; two mutators in flight = the worktree collision incident again. Exception: tasks sharing a plan-marked `Wave: N` whose `Files:` lists are pairwise disjoint (check the intersection mechanically before dispatch). Full gate after each wave; any collision symptom or gate RED → finish sequentially.

## Security framing (silent-failure gotcha)

Offensive-security-framed subagent prompts ("exploit", "bypass", "attack") can trip a classifier and silently return an empty run — no error, zero tokens back. Describe the code change, not the attack — or do that piece in the main loop.

## Re-run, don't relay

A subagent's success claim is not evidence. Re-run the command in the main loop before repeating the claim.
