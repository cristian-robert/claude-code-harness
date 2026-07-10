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

## Model + effort matrix (pin both on every dispatch)

| Work | Dispatch | model: | effort: |
|---|---|---|---|
| Locate/trace a symbol | `codebase-search` MCP (where_is/find_references/outline) if wired, else targeted grep — see symbol-navigation.md | — | — |
| Locate files / text | built-in Explore | haiku-class (inherits; skips CLAUDE.md) | — |
| Understand / synthesize | `scout` | sonnet (frontmatter pin) | medium |
| Implement | general-purpose | per the plan's model hint | high |
| Code review | `code-reviewer` | opus floor | xhigh |
| Runtime check | `qa-evaluator` | opus | high |
| Acceptance evidence pass | `qa-evaluator`; browser flows → global `tester-agent` | opus | high |

Per-invocation `model:` beats agent frontmatter, which beats the session model. Agent files pin the floor; dispatches may raise, never lower — a reviewer below opus is a silent quality bug.

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
