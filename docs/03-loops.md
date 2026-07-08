# 03 · Loops — Inner, Outer, Autonomous

Three loops at three timescales. All of them keep state on disk, never in a context window.

## The three loops

```
             +----------------- OUTER: the harness learns ------------------+
             |                                                              v
  ticket --> /plan ---> /implement ---> /validate ---> /review ---> ship  /evolve
             |_____________ INNER: PIV per work item _______________|
              (session A)   (session B, fresh)

  AUTONOMOUS: loop.mjs --> fresh headless claude -p --> ONE change --> validate
              --> commit --> repeat until loop/DONE.txt exists
```

| Loop | Cadence | Mechanism | State on disk |
|---|---|---|---|
| INNER | per work item | PIV: `/plan → /implement → /validate → /review`; superpowers skills as per-task discipline inside each stage | `plans/<slug>-plan.md`, `reports/<slug>-implementation-report.md`, `reports/<slug>-review.md` |
| OUTER | after every shipped item or failure | `/evolve`: mine the session for lessons; rules added WITH incident provenance, rules pruned when no longer earning their lines | rule/vault deltas |
| AUTONOMOUS | per iteration until sentinel | `loop/loop.mjs` re-feeds `PROMPT.md` to a fresh headless process | commits, `fix_plan.md`, `DONE.txt` |

Agile-ceremony overlap: standup, retro, and DoD already live here (session-start, `/evolve`,
Stop gate + `/validate`) — the delivery layer (`docs/06-delivery-org.md`) adds only refine/scope/accept, never re-encoding these loops.

Superpowers mapping inside INNER stages (invoke via Skill tool; condensed inline fallback if the plugin is unavailable; on conflict, repo rules win):

| Stage | Skills |
|---|---|
| `/plan` | brainstorming (if design unexplored) → writing-plans |
| `/implement` | using-git-worktrees → subagent-driven-development (or executing-plans in a fresh session) → test-driven-development per task → verification-before-completion |
| `/review` | requesting-code-review |
| any bug, any stage | systematic-debugging BEFORE any fix |

## Three ways to keep going — chooser

| Mechanism | Next turn starts when | Done decided by | Context | Use for |
|---|---|---|---|---|
| Stop gate (`harness.json`) | the turn tries to end | deterministic commands | same window, turn-scoped | invariant: a turn never ends red |
| `/goal <condition>` (platform-native, code.claude.com/docs/en/goal, v2.1.139+) | previous turn finishes | Haiku evaluator re-checks the ≤4,000-char condition each turn — no tools, judges only what Claude surfaced | same window: context ACCUMULATES | mechanical work that converges in one session; headless one-shot: `claude -p "/goal <condition>"` |
| `loop.mjs` (Ralph) | driver re-invokes | `loop/DONE.txt` sentinel on disk | **fresh window per iteration** — the resets doctrine | long autonomous work; cross-session state on disk |

Write the `/goal` condition like a spec item ("`npm test` exits 0 and `git status` clean;
stop after 20 turns"). `/goal` does not replace `loop.mjs`: one accumulating window is
exactly what resets-over-compaction warns about for long work.

## Why artifacts on disk

- **Sessions are disposable; work isn't.** `plans/`, `reports/`, `fix_plan.md` survive `/clear`, crashes, and compaction. The context window survives none of them.
- **No-prior-knowledge test.** A plan is done when an agent that never saw the planning conversation can execute it. If executing needs the chat, the plan failed.
- **Fresh `/implement` session beats a long one.** A planner's accumulated exploration biases implementation ("I already looked at that"). The fresh executor reads only the plan — accumulated bias is physically absent.
- **Artifact handoff IS the context-reset pattern.** Anthropic: resets with a structured handoff beat compaction — compaction preserves continuity but leaves "context anxiety" intact; a reset gives a clean slate at the cost of the artifact carrying enough state.
- **Git log is memory.** Frequent, descriptive commits are the episodic record every fresh session (and every loop iteration) reads back instead of remembering.

## Generator / evaluator separation

- Agents "reliably skew positive when grading their own work." Tuning a skeptical standalone evaluator is tractable; making a generator self-critical is not (Anthropic).
- The `/review` agent therefore sees only **diff + plan + reviewer protocol** — never the implementation conversation, so it can't inherit the implementer's rationalizations.
- **Sprint contract:** generator and evaluator agree on done-criteria per unit of work BEFORE code exists. Our plan template's per-task `Validate:` command + Acceptance Criteria checklist IS that contract — written at plan time, graded at review time.
- **Evaluator utility scales with task difficulty.** Trivial work gets light ceremony: if you can describe the diff in one sentence, skip the plan (routing rule in `00-core.md`). Full separation pays on M+ work; on typos it is pure tax.

**No planner subagent (decision recorded — don't relitigate in v0.3).** `AskUserQuestion`
is unavailable to subagents, and `/plan`'s batched clarify gate is load-bearing — a planner
subagent structurally cannot ask. Planning stays main-loop + plan mode. The harness-post
planner lessons survive structurally: the spec stays high-level (errors in it cascade), and
per-task `Validate:` contracts in the plan template prevent under-scoping.

## Fan-out map — where parallelism belongs in PIV

| Stage | Parallelism |
|---|---|
| `/plan` explore | THE fan-out point: 2–4 `scout` dispatches on disjoint questions — read-only, parallel |
| `/implement` | Sequential by default. `Wave:`-marked plan tasks with provably disjoint `Files:` lists may run in parallel via worktrees; full gate after each wave |
| `/validate` | Gate commands stay main-loop; `qa-evaluator` is a single dispatch; parallel read-only re-verification OK |
| `/review` | ONE fresh-eyes reviewer (+ optional second-vendor lens) — never a chorus by default |
| `/evolve` | Main loop only — judgment about the harness itself |

NEVER parallel mutators on shared files — the worktree collision incident is on record.
Multi-agent ≈ 15x single-chat tokens (Anthropic, measured): fan out only where breadth
earns it. Briefs and mechanics: `template/.claude/references/dispatch-protocol.md`.

## Review lenses stack

Different lenses catch different defect classes; stacking is additive, not redundant.

| Lens | Scope | Catches |
|---|---|---|
| Per-task validation (inside `/implement`) | one task's diff | mechanical: lint/type/tests red, spec deviation |
| Runtime lens — `qa-evaluator` (inside `/validate` and `/accept`, work with a runtime surface) | the running app vs the plan's acceptance criteria | stubs: renders-but-doesn't-respond, display-only features, broken round-trips |
| `/review` — fresh evaluator | whole branch vs plan | plan conformance, integration seams, missed acceptance criteria |
| Adversarial second-vendor pass (L/XL only) | whole branch, different model backbone | shared blind spots, architectural defects |

Two incidents justify the stack (AIDF v0.4 adversarial-review history):

1. A **CRITICAL cross-task bug** passed every per-task review — per-task reviewers have no view of cross-task invariants. Only the batch-level pass could see it.
2. An edge case dismissed in-lens as **"theoretical" was real**. A second reviewer with a different prior refused the dismissal.

**Warning — review noise.** A reviewer instructed to find gaps will find some, every time. Fix only correctness and requirement violations; log style/architecture opinions to the backlog instead of churning the diff. Track fix-commit ratio as a health signal, not a target.

## Autonomous loop doctrine

Full mechanics: `loop/README.md`. Doctrine:

- **Qualifies:** numbered spec items, each mechanically verifiable (command exits 0, behavior observable). Design-ambiguous work does not — `/plan` it first, or don't loop it.
- **Sentinel stop authority.** The driver stops on the EXISTENCE of `loop/DONE.txt` — model output text is never parsed. The loop, not the model, decides when work is finished.
- **ONE change per iteration**, journaled in `fix_plan.md` (Did / Validation / Next). The next fresh iteration reads code + journal, not chat.

| Failure mode | Symptom | Guardrail line in PROMPT.md |
|---|---|---|
| Overbaking | unattended too long → bizarre emergent behavior | low `--max-iter`; check in early; Ctrl+C + `git reset --hard` |
| Placeholder-chasing | stubs that compile counted as progress | "NO placeholder or simplified implementations"; spec items test behavior, not existence |
| Duplicate implementation | greps, wrongly concludes feature missing, rebuilds it | "search the codebase before adding — don't assume not implemented" |

- **The point is fresh-context-per-unit-of-work, NOT run-forever.** HumanLayer's critique of naive loop packagings: they "die in cryptic ways" and miss "the key point of ralph, which is not 'run forever' but 'carve off small bits of work into independent context windows.'"
- **Parallel scaling** = one `--worktree` per run + resource isolation. Worktrees isolate branch, tree, `node_modules`/venvs for free; the database and ports they don't — isolate those explicitly (`loop/README.md`, isolation ladder).

## Model-upgrade ritual

When the underlying model changes, the harness is stale until proven otherwise:

1. Re-run a known, previously-passing task with harness components **ablated one at a time**; compare outcomes per ablation.
2. Remove scaffolding that stopped being load-bearing — Anthropic retired its entire sprint construct at Opus 4.6 this way.
3. Never rewrite the harness all at once: the radical rewrite "made it difficult to tell which pieces were actually load-bearing." One variable per experiment.

"Harnesses don't shrink, they move" — every upgrade frees budget for scaffolding that targets the new model's actual failure modes, not the old one's.

## Sources

- Anthropic — "Harness design for long-running application development" (resets vs compaction, self-grading bias, sprint contracts, ablation ritual)
- Cole Medin — harness-engineering-demo (PIV loop, Ralph driver mechanics, example run)
- Geoffrey Huntley — ghuntley.com/ralph; how-to-ralph-wiggum (failure modes, guardrail numbering)
- HumanLayer — "A Brief History of Ralph" (run-forever critique); 12-Factor Agents
- AIDF v0.8 — adversarial-review-multi-lens, spec-reviewer protocol (incident provenance)
- Addy Osmani — "Agent Harness Engineering" ("harnesses don't shrink, they move")
- obra/superpowers — the per-stage execution-discipline skills
