---
name: evolve
description: "Capture what this work taught the harness: new rules, pruned rules, vault entries. Ask-first."
disable-model-invocation: true
---

# /evolve — the outer loop

The inner loop (plan→implement→validate→review) ships the feature. This loop upgrades the harness:
every AI mistake becomes a rule, pattern, or guardrail — or it recurs. The harness is a living system.
In scrum mode this IS the retrospective (dispatched by `/sprint close`).

## 1. Gather candidates

- This session's mistakes and user corrections ("no, do X instead", reverted edits)
- Review blockers in `reports/<slug>-review.md`
- `git log` since the base branch: churn, reverts, fix-of-a-fix commits
- Accepted/rejected backlog items' `## Log` lines since the last evolve (Dev/QA/review/acceptance evidence)
- Surprising discoveries: undocumented gotchas, assumptions that proved wrong
- Structural changes this session — new/removed modules, routes, DB tables, or endpoints — from the plan's affected-surfaces list and the diff since the base branch (new files under module/route dirs, migrations, new endpoints).

## 2. Choose a destination — decision ladder, first match wins

| Candidate is... | Destination |
|---|---|
| Must never happen again AND mechanically checkable | Hook or permission deny (enforcement, not prose) |
| Broadly applicable session guidance | AGENTS.md Conventions — ~60-line budget: adding may mean cutting |
| File-type-specific | `paths:`-scoped rule in `.claude/rules/` (key is `paths:`, NEVER `globs:`) |
| Place-specific | That directory's `AGENTS.md` |
| Repeated manual prompt (3+ times) | New skill |
| Structural change to record | Dispatch `architect-agent` **RECORD** → updates `projects/<name>/architecture.md` + `decisions.md` in the vault (no vault → skip, say so) |
| Generalizes beyond this project | Vault: inbox/raw or project wiki (agents auto-append there mid-work); promotion to wiki//agent-kb/ happens HERE and only here, ask-first — `.claude/references/vault-protocol.md` |
| Everything else | Drop — a rule that doesn't earn its tokens taxes every future session |

## 3. Ratchet rule

Every proposed rule cites its concrete incident: `traces to: <what went wrong>`.
No speculative hardening. A candidate without an incident is rejected at proposal time.

## 4. Pruning pass (mandatory — the step every other framework lacks)

Scan AGENTS.md + unscoped `.claude/rules/*.md` for lines no longer earning their tokens:

- Rules the model now follows unprompted
- Rules for retired code, tools, or workflows
- Guidance duplicated elsewhere (a hook already enforces it; the code itself says it)

Measure, don't estimate: run `node <PHE>/tools/context-ledger.mjs` (or the project's copy) and include the delta in the proposal list.

Propose removals alongside additions. After a model upgrade, propose re-testing which scaffolding
is still load-bearing (ablation: remove one component at a time, observe). Harnesses move; they
must not only grow.

## 5. Ask-first

Present ALL candidates in ONE numbered message, destination-tagged:

```
1. [hook] Deny `curl | sh` — traces to: ran unreviewed installer in session
2. [prune: AGENTS.md] Drop "use pnpm" — followed unprompted 3 sessions running
3. [rules/tests.md] Fixtures live in tests/fixtures/ — traces to: duplicated fixture dir
4. [vault: architecture] Record the new `orders` table + tenant_id FK — traces to: this session's migration
Apply which? ("1,3" / "all" / "none")
```

Wait for the selection. "none" is a legitimate outcome — most sessions teach nothing new.
Autonomous mode (per `.claude/references/autonomous-mode.md`): apply all, but append every decision under a `## Assumptions` section at the end of the latest `reports/<slug>-implementation-report.md`.

## 6. Apply selections

- Smallest diff; adapt existing files in place — never rewrite rules/AGENTS.md from scratch.
- Selections touched AGENTS.md/rules → reconcile auto-memory: remove any MEMORY.md lines now covered by team rules (memory holds machine-local facts only).
- Always — even on "none": write `.claude/state/.evolve-ran` (timestamp) — the opt-in push gate (`harness.json` `requireEvolveBeforePush`) reads it. `.claude/state/` is gitignored by adopters.
- Vault writes follow the vault's Index Law: update that folder's `_index.md` in the same change.
- Any hook changed → run `node .claude/hooks/smoke-test.mjs` and show its real output.
  A hook change without a green smoke test is not applied.

## 7. Output contract

Changes go to disk; no terminal recap of file contents. End with exactly one line:

`Evolved harness: +N -M · Next: superpowers:finishing-a-development-branch`

N = additions applied, M = prunings applied. workTracking active and an item was just accepted → Next becomes `superpowers:finishing-a-development-branch, then /backlog next`. Scrum, dispatched by `/sprint close` → Next becomes `/sprint plan` (open the next sprint) — the increment merges/PRs BEFORE the next item starts. The `shipped:` Log line (an `accepted` item vs a merged one) is stamped by the next `/backlog next` ship-sweep once the branch is merged — the Log answers "did it ship?" without /evolve needing a post-merge step. A blocker REPLACES this line.
