# Loop — autonomous iteration driver

Re-feeds `loop/PROMPT.md` to a **fresh headless Claude** each iteration until
`loop/DONE.txt` exists or the iteration cap hits. The point is NOT "run
forever" — it is to **carve off small bits of work into independent context
windows**. Each iteration reads the spec, sees what already exists (code +
`fix_plan.md`), makes ONE change, validates, commits. The loop, not the
model, decides when it's finished.

## When to use it

| Use | Don't use |
|---|---|
| Well-specified work with mechanically verifiable spec items (lint/tests exit 0, behavior X observable) | Design-heavy or ambiguous work — run `/plan-work` first, or don't loop |
| Grinding through a checklist a plan already settled | Anything where "done" needs human judgment |
| Parallel independent tickets, one worktree each | Work touching shared mutable state without isolation |

## One of three keep-going mechanisms

| Mechanism | Window | Done decided by | Use |
|---|---|---|---|
| Stop gate (`harness.json`) | same, turn-scoped | deterministic commands | a turn never ends red |
| `/goal <condition>` | same — context accumulates | Haiku re-checks the ≤4,000-char condition each turn | converge-in-one-session; headless: `claude -p "/goal <condition>"` |
| `loop.mjs` (this driver) | **fresh per iteration** — the resets doctrine | `DONE.txt` sentinel on disk | long autonomous work; cross-session state on disk |

Full chooser and doctrine: `docs/03-loops.md`.

## How to run

1. Copy `loop/PROMPT.template.md` → `loop/PROMPT.md`; fill every placeholder.
   Spec items must be independently verifiable — they are the termination contract.
2. `node loop/loop.mjs` (in-place: commits on the current branch — sandbox only), or
   `node loop/loop.mjs --worktree` (fresh branch `loop/run-<epoch>` in a sibling
   worktree — required for parallel runs).
3. Flags: `--max-iter 15` · `--iter-timeout-sec 1800` · `--prompt` · `--done` · `--log` · `--dry-run`.
4. Watch the first iterations. Steer by editing `PROMPT.md` (re-read every
   iteration) — add a guardrail whenever a bad pattern recurs.

## How state flows

Every iteration is a new process with zero memory. All state lives on disk:

| Artifact | Role |
|---|---|
| The repo (committed each iteration, `--no-verify`) | The actual work; the next iteration reads code, not chat |
| `loop/fix_plan.md` | Agent-maintained journal: Did / Validation / Next per iteration |
| `loop/DONE.txt` | Stop sentinel — its EXISTENCE stops the driver; model text is never parsed |
| `loop/loop.log` | Driver-side JSON lines (exit, turns, cost) — for the operator, not the model |

Gitignore `loop/DONE.txt`, `loop/loop.log`, and `loop/fix_plan.md` — per-run transients.

## Failure modes

| Mode | Symptom | Mitigation |
|---|---|---|
| Overbaking | Unattended too long → bizarre emergent behavior | Check in every few iterations; lower `--max-iter`; Ctrl+C + `git reset --hard` is the escape hatch |
| Placeholder-chasing | Stubs that compile get marked as progress | Guardrail 901; spec items that test behavior, not existence |
| Duplicate implementation | Greps, wrongly concludes feature missing, rebuilds it | Guardrail 902: search before adding |
| Circling | Same fix fails repeatedly | Guardrail 904; edit PROMPT.md with a "sign"; regenerating the plan costs one iteration |

## Cost

Each iteration is a fresh headless `claude -p` run on your Claude Code subscription (Max plan). (Legacy note, verify on your plan: some older setups drew from **Agent
SDK credits**, not your interactive subscription. Reference run: a full
feature converged in 4 iterations ≈ **$0.77** total. Per-iteration cost is in
`loop/loop.log`.

## Isolation ladder (parallel loops)

1. `--worktree` — own branch + working tree per run; `node_modules`/venvs
   isolate for free since they live per worktree.
2. Per-run database — create `app_loop_<branch>` and point env at it; a shared
   DB is the one resource worktrees don't isolate.
3. Per-run services/ports if the spec starts servers.

Safety: `--dangerously-skip-permissions` is acceptable ONLY because the
PreToolUse guard hooks (`.claude/hooks/guard.mjs`) still fire in headless
mode. Never run the loop in a repo without them wired.
