# 00 · Harness Engineering — The Discipline

## Definition

Harness engineering is building the context, enforcement, and workflows that wrap a coding
agent so it works like an engineer on YOUR team — "your processes enforced, your standards
applied ... like another engineer on your team instead of a clever stranger guessing at your
codebase" (Cole Medin, harness-engineering-demo). Agent = model + harness. It is the third
step of a progression:

| Step | You engineer | Scope |
|---|---|---|
| Prompt engineering | the words in one prompt | one message |
| Context engineering | everything one session sees up front — rules, examples, validation criteria | one session |
| Harness engineering | the deterministic scaffolding around and between sessions | the delivery pipeline |

Why it pays (Cole Medin's reported figures): ~6.7% PR acceptance for a bare model vs ~70%
behind a good harness; Stripe ships ~1,300 AI-only PRs/week behind one. Same models — the
gap is the harness.

## The PHE four-layer model

Every artifact in this framework lives in exactly one layer. Misplacement is the most common
harness bug.

| # | Layer | Components | Property | Belongs here | Fails if put elsewhere |
|---|---|---|---|---|---|
| 1 | Session context | root CLAUDE.md, two-tier rules (`.claude/rules/`), sub-CLAUDE.md, skills, agents | Advisory. Attention-budgeted: every always-loaded line competes with the task | Conventions code can't reveal, workflow triggers, `paths:`-scoped domain rules | Hard rules written here are suggestions the model can skip; domain detail hoisted to root bloats every session |
| 2 | Enforcement | hooks (guard, post-edit, stop-gate, session-start), permission allow/deny | Deterministic. Hooks fire even under bypassPermissions | Secrets guard, recursive-delete and main-branch protection, the GREEN/RED stop gate — anything that must NEVER happen | Moved into prose it decays into a request; the one time it matters is the time it gets ignored |
| 3 | Loops | PIV+E pipeline, superpowers discipline inside stages, `plans/` + `reports/` artifacts, autonomous loop | Cross-session state on disk; fresh context per stage | Plans, implementation reports, reviews — anything a later session must pick up cold | State kept in the context window dies at reset and blurs under compaction; git log and disk are the memory |
| 4 | Knowledge | vault, cross-project memory | Distilled across projects; pulled on demand, never preloaded | Lessons that generalize beyond this repo; stack-level patterns | Stuffed into repo rules it bloats Layer 1; left in transcripts it is re-derived per project |

## Design principles

| Principle | Rule | Provenance |
|---|---|---|
| Minimal and moldable | Start small, mold to your SDLC. Spec Kit and BMAD are the named cautionary examples: "over-engineered and hard to mold" | Cole Medin |
| Ratchet | "Every line ... should be traceable back to a specific thing that went wrong." No speculative hardening | Addy Osmani |
| High-signal tokens | Context is a scarce attention budget: ship the smallest set of high-signal tokens that gets the outcome | Anthropic, context-engineering post |
| Guidance vs enforcement | CLAUDE.md is "context, not enforced configuration." Anything mandatory goes in a hook or permission rule | Anthropic docs |
| Generator/evaluator split | "Agents reliably skew positive when grading their own work." Tuning a skeptical standalone evaluator is tractable; making a generator self-critical is not | Anthropic, harness-design post |
| Resets over compaction | For long work, clear context and hand off via a disk artifact; compaction leaves "context anxiety" intact. Model-specific finding — retest per model | Anthropic, harness-design post |
| Harness coupled to model generation | "Harnesses don't shrink, they move." On every model upgrade, re-ablate: strip what is no longer load-bearing, add what is newly possible | Osmani; Anthropic (sprint construct removed at Opus 4.6) |

## Vocabulary map — the community and Anthropic converge

| Community term | Anthropic term | Shared mechanic |
|---|---|---|
| PIV loop (Medin) | Explore → plan → code → commit | Human owns plan and validation; agent owns implementation; phases in separate contexts |
| Ralph (Huntley) | Initializer/coder with fresh contexts | One unit of work per clean window; progress persists on disk, not in context |
| PRP (Rasmus / Wirasm) | Spec + curated context | One dense handoff packet lets a fresh agent ship first-pass |
| AI layer (rules, commands, skills) | CLAUDE.md / skills / hooks | Versioned harness config, checked in and reviewed like code |
| 12-factor agents (HumanLayer) | Own-your-context-window | You curate what the model sees; control flow is explicit software, not an opaque loop |

## Deliberately not included (anti-scope)

| Excluded | Why |
|---|---|
| YAML workflow engine (Archon-style) | Skills + hooks + disk artifacts already pin the sequence; an engine is a second codebase to maintain and cedes control flow (12-factor, factor 8) |
| Custom KB search engine (embeddings/RAG) | Index Law instead: curated index files + grep. Retrieval infrastructure rots faster than markdown |
| 12+ command role-per-agent suites | Five core stages (PIV+E) plus the evidence-gated delivery trio (/backlog, /accept, /sprint — docs/06) cover idea → accepted increment; every command traces to a failure or an evidence line. The rejected shape is persona rosters and parallel command sets |

Boundary rule: PHE adds a component only when a real failure recurs that no existing layer
absorbs — and removes one when a model upgrade makes it dead weight.

## Sources

- Cole Medin — harness-engineering-demo, Archon, "The Next Evolution of AI Coding Is Harnesses" (PR-acceptance and Stripe figures as reported by Medin)
- Anthropic — "Harness design for long-running application development" (Rajasekaran, 2026); "Effective context engineering for AI agents"; Claude Code docs (memory, hooks)
- Addy Osmani — "Agent Harness Engineering"
- HumanLayer — 12-Factor Agents; "A Brief History of Ralph"
- Geoffrey Huntley — ghuntley.com/ralph; how-to-ralph-wiggum
- obra/superpowers — the execution-discipline skills PIV+E stages invoke
