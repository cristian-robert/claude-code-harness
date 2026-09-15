# code-reviewer memory

## Repo defect classes
- Skill renames must be swept in ALL living docs (grep bare `/name`) AND retired in CLI (backupAndCopy is additive — old dir shadows built-in without cli/migrations.js). Historical plans/reports/docs/design keep old names by design — not misses.
- CLI migration correctness hinges on order: payload copy → migrateRenamedSkills → emitCodex. Wrong order re-emits the orphan. Verified in init.js/update.js on feat/vault-second-brain.
- Hash-snapshot tamper checks (stop-gate.mjs): comparing only `f in now && hash differs` misses DELETE/RENAME — the cheapest way to make a failing check pass. Flag missing-in-now too, but only when the enumerator succeeded (a null/`{}` from a failed `git ls-files` must stand down, not block everything).
- A predicate that decides what a hook RUNS is mirrored in what the banner/statusline REPORTS. Changing `stopGate` filtering in stop-gate.mjs also needs session-start.mjs and statusline.mjs, or the session believes a disarmed gate is armed. No shared test pins the three (hooks are builtin-only) — check all three by hand.
- Retiring vocabulary in this repo means a `tools/ratchet-greps.mjs` CHECKS entry with its own `traces to:` in the SAME task, plus a fixture and the all-N count. Its scope is template/ docs/ cli/ tools/ README.md — plans/ and reports/ are out, so a retired phrase there is not a miss.

## Waived findings
- loop.mjs `.worktrees/` path swap (commit 180dae8) has no dedicated test — waived: loop.mjs is not a hook; guard.mjs smoke fixture covers the containment rule it mirrors. Re-raise only if the loop worktree logic diverges from the guard rule.
- run-check.mjs tail drops a final line longer than TAIL_BYTES (64 KB) and countLines/tail disagree on trailing blanks — waived: plan-specified verbatim, full output is on disk and the header cites the path. Recorded as a follow-up in the m2 report.

## Verified-correct patterns (don't re-flag)
- guard.mjs worktree containment compares `resolve(physDir,wtPath)+"/"` vs `top+"/"` — trailing slash on both sides intentionally prevents `/repo` vs `/repo-sibling` prefix false-match. Correct.
- guard.mjs ENV_DUMP `(^|[;&|]\s*)env\s*(\||>|$)`: `env FOO=1 npm test` correctly allowed; `echo` rule needs a literal `$` so prose mentioning tokens is safe. Fragment double-scan adds no new false positives.
- RESOLVED in 5ab95b6: tamper check flags `!(f in now) || hash differs`, guarded by a non-null `hashGated`. Verified live on delete/rename/honest-green/git-gone/edit. Don't re-flag this shape.
- run-check.mjs `q()` allowlist quoting (`/^[A-Za-z0-9_./=:@%+,-]+$/`, else POSIX single-quote with `'\''`) is injection-safe — probed with `; touch …; echo $(whoami)` as one argv word: passed through literally, nothing executed. The single-word-after-`--` shell string is the documented owner-trusted path.
- plan-anchors.mjs on this repo's own `plans/harness-improvements-m2-plan.md` reports 27 ok / 7 MISS / 2 UNPARSED, exit 1, BY DESIGN — the MISSes are passages that milestone rewrote and the UNPARSEDs are two enumeration bullets the plan keeps unanchored. Not a regression.
