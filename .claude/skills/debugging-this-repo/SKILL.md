---
name: debugging-this-repo
description: "Project-specific debugging: where logs live, how to reproduce locally, known failure classes and their fixes. Consult BEFORE diagnosing any bug or test failure."
user-invocable: false
---

# Debugging this repo — Perfect Harness Engineering

`superpowers:systematic-debugging` owns the METHOD (reproduce → isolate → root-cause). This file
holds the FACTS for this repo. Never fix without reproducing first.

## Reproduce

| Failure | Command |
|---|---|
| Any hook | `node template/.claude/hooks/smoke-test.mjs` |
| One CLI unit | `node cli/*.test.js` — each file is a standalone runner, no test framework |
| Everything | `npm test` |
| Root `.claude/` drift | `node tools/self-harness.mjs --check` |
| Retired vocabulary | `node tools/ratchet-greps.mjs` |
| Context budgets | `node tools/context-ledger.mjs template` |
| Loop driver | `node loop/loop.mjs --dry-run` |

Failures are named, not numbered: grep the FAIL line's own text in the test file to land on the
fixture that produced it.

## Drive a hook by effect

Hooks read JSON on STDIN, never argv, so reproduce one the way the platform runs it:

```bash
echo '{"session_id":"x","source":"startup","cwd":"'$PWD'"}' | node .claude/hooks/session-start.mjs
```

Swap in the event the hook matches (`hook_event_name`, `tool_name`, `tool_input`). A hook that
prints nothing is the classic silent failure: argv parsing, a wrong `matcher`, or absent from
`settings.json`. Assert on stdout; "it seemed to run" is not evidence.

## Logs

- Stop-gate command output: `.claude/state/checks/<label>.log`. `template/.claude/tooling/run-check.mjs`
  keeps the newest 20 and puts only the exit code plus a tail in context — read the file for the rest.
- Last verdict `.claude/state/last-gate.json`; the gate-config snapshot from a RED turn
  `.claude/state/gate-<session>.json`. Both are machine state, gitignored by adopters.
- Autonomous loop: `loop/loop.log`.

## Known failure classes

- Harness symptoms — rule ignored, hook never fires, gate loops forever, context bloat every
  session, malformed reviewer verdict — are tabulated symptom → cause in
  `template/.claude/references/harness-maintenance.md` section 6. Read it before theorising.
- This repo's signature defect is **a check that measures a near-neighbour of the thing it names,
  so it passes while the real property is broken**. Five worked instances and the countermeasures
  (test the whole property not a proxy; re-derive a handed-to-you number with the tool that owns
  the definition; mutate the check and watch it go red) are in the vault runbook,
  `~/Dev/The Vault/projects/perfectHarnessEngineering/runbook.md`, "Instrument failures". Its
  troubleshooting table holds the shorter symptom → fix rows.

## Before blaming the framework

1. Is `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` exported? It pins every subagent to one model, so the
   reviewer's `deep` pin dies and dispatches do not run on the model the plan asked for. Session
   start prints a warning line when it is set — look there first.
2. Has root `.claude/` drifted from the template? `node tools/self-harness.mjs --check`. A stale
   root copy means this session loaded rules and hooks the template no longer ships.
3. Is there a stale `.claude/state/gate-<session>.json` from an earlier RED turn? The stop gate
   refuses a GREEN whose gate config shrank since that snapshot. That block is the anti-gaming
   check working, not a broken gate.

Once systematic-debugging confirms a root cause, RECORD it: a row in the vault runbook's
troubleshooting table and its `_index.md` updated in the same change (Index Law). Generalising the
lesson past this project is `/evolve`'s ask-first promotion, and promotion MOVES the fact.

No flaky-test quarantine exists here — a red test is real until proven otherwise.
