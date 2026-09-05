Plan: plans/skills-audit-adoptions-plan.md · Item: none (ad-hoc, workTracking inactive)

# Review — skills-audit-adoptions

Reviewer: `code-reviewer` protocol, dispatched at **opus / effort xhigh** (sibling rule: the session model implemented; the reviewer is a different model — the literal deep→build inversion assumes an opus/sonnet implementer pair, so the sibling INTENT plus the standing model policy picked opus).

## Round 1 — REQUEST_CHANGES (verbatim)

REQUEST_CHANGES

1. `template/.claude/hooks/stop-gate.mjs:100` — the tamper check misses the cheapest escape: **deleting or renaming a gated file**. `Object.keys(before).filter((f) => f in now && now[f] !== before[f])` only flags files still present. Reproduced live (temp git repo, `stopGateTamperPaths:["tests/"]`): RED writes `tamper-smoke.json` → `rm tests/a.test.js` → gate GREEN → hook emits **nothing**, snapshot deleted, dishonest green ships. Same for `git mv`. This defeats the feature's stated purpose and the plan's own acceptance criterion ("armed config blocks the dishonest green"); the plan's wording is "any changed file → block", and a deleted check is changed. Fix must not fail closed on a git failure — `hashGated` returns `null` there, and `|| {}` would then mark every file missing: keep the `null` → stand-down branch, and only inside the non-null branch use `!(f in now) || now[f] !== before[f]`.
2. `template/.claude/hooks/smoke-test.mjs:400-430` — no fixture for that path. Behavior change needs the test: same rig, delete `tests/a.test.js` instead of editing it, expect `decision:"block"` naming the file and the snapshot kept.

Notes (non-blocking):
- `stop-gate.mjs:23` uses `execSync` (shell) where the repo's exec-form doctrine (ADR-007, `guard.mjs`) uses `execFileSync`. Fixed command, no injection surface — style only.
- `docs/02-enforcement-vs-guidance.md:29`'s `stop-gate.mjs` row still describes the pre-tamper hook; `/evolve` may want the one-clause update.
- `loop/loop.mjs` denial surfacing has no automated test; consistent with the standing waiver in my memory (loop.mjs is not a hook, `--dry-run` is its check) — not re-raised.

Everything else verified green and conformant:
- conformance: OK — all 6 tasks landed; 3 deviations recorded with justification (undocumented `permission_denials` → defensive parse + docs/99 "unverified" row; comment placement; `TAMPER` verdict string). Diff touches only plan-named files (10, incl. plan+report). Out-of-scope list respected.
- correctness: OK except blocker 1 — `ENV_DUMP`/`INLINE_INTERP` verified by hand: `env FOO=1 npm test`, `echo $PATH`, `grep -rn process.env src/` all still allowed; write-once snapshot and honest-green cleanup behave as specified; `permission_denials` prints `?` (not a fake `0`) when absent.
- tests: OK except blocker 2 — `node template/.claude/hooks/smoke-test.mjs` → **134 passed, 0 failed** (118 baseline + 12 guard + 4 stop-gate, matching the report).
- security: OK — changes are net-hardening; `git ls-files -z` is a constant, patterns never reach a shell; all new I/O try/catch'd to feature-off.
- conventions: OK — ledger unchanged at 1659/2000 (83%); `evolve/SKILL.md` 99 lines (≤100, exactly +1/−0); `docs/00` 82 lines; `node --check` clean on all four files; `loop --dry-run` clean; new `stopGateTamperPaths` arrives for existing adopters through `cli/harness-config.js`'s generic missing-key merge, no CLI change needed; ratchet satisfied via ADR-020 audit-as-incident + recorded declines.
- boundaries: OK — no in-repo `knowledge-base/` by design (ADR-001); reviewed from code. Only new `last-gate.json` verdict consumer is `pre-compact.mjs:52`, which prints the string opaquely — `TAMPER` is harmless there.

## Round 1 fix (commit `5ab95b6`)

Both blockers verified against the code before fixing, then TDD: deletion fixture added FIRST and observed RED (`134 passed, 1 failed`), then the predicate fix (`!(f in now) || now[f] !== before[f]`, inside the non-null branch exactly as the reviewer specified — null still stands down, never fails closed). Full gate re-run after the fix: **135 passed, 0 failed** · ledger 1659 (unchanged) · `--dry-run` clean · `node --check` clean.

## Round 2 — PASS (verbatim)

PASS

Round 2 — both round-1 blockers resolved in `5ab95b6`, verified independently, no regressions.

- blocker 1 (deletion/rename escape): FIXED at `template/.claude/hooks/stop-gate.mjs:100-109` — `!(f in now) || now[f] !== before[f]`, wrapped in `if (now)` so a null from `hashGated` stands down instead of failing closed. Re-ran my own round-1 rig plus four siblings against the built hook, all correct: `rm tests/a.test.js` → **block**, snapshot kept · `git mv` → **block** · in-place edit → **block** · honest green → silent pass, snapshot cleared · `.git` removed mid-session → silent pass, snapshot kept (stand-down, not a spurious block). The exact escape I reproduced in round 1 now blocks.
- blocker 2 (missing test): FIXED at `template/.claude/hooks/smoke-test.mjs:431-451` — "green-after-gated-delete blocks and keeps the snapshot" asserts `decision:"block"`, the reason naming `tests/a.test.js`, and `existsSync(snapPath)`. Rig is independent of the edit fixture (own tmp repo), so it cannot pass on the neighbour's state. `unlinkSync` import added correctly at line 10.
- conformance: OK — fix is exactly the shape specified, nothing else touched; diff still confined to the 10 plan-named files (417+/9−).
- correctness: OK — the new `if (now)` branch is the only behavior delta; GREEN-with-null-`now` leaves `verdict` GREEN and `tampered` empty, so the block chain at lines 117-132 is unchanged for every pre-existing path.
- tests: OK — `node template/.claude/hooks/smoke-test.mjs` → **135 passed, 0 failed** (134 + the new fixture), run by me in the worktree.
- security: OK — no new I/O, no new shell surface; the layer still fails open on every error path.
- conventions: OK — ledger unchanged at 1659/2000 (83%); `node --check` clean on guard/stop-gate/smoke-test/loop; `node loop/loop.mjs --dry-run` clean; the swallow-comment lint fixture still passes.
- boundaries: OK — unchanged from round 1.

Note (new, minor, for /evolve — not a blocker): a gated file that is in the index but becomes *unreadable* (permission change) now hashes as missing and reads as tampered. Exotic, opt-in, and it errs toward blocking with an explain-to-the-user message — the correct side for this control.

Round-1 Notes (execSync vs exec-form, `docs/02` stop-gate row, untested loop denial surfacing) unchanged by the fix; not re-raised.
