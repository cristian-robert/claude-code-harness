# code-reviewer memory

## Repo defect classes
- Skill renames must be swept in ALL living docs (grep bare `/name`) AND retired in CLI (backupAndCopy is additive — old dir shadows built-in without cli/migrations.js). Historical plans/reports/docs/design keep old names by design — not misses.
- CLI migration correctness hinges on order: payload copy → migrateRenamedSkills → emitCodex. Wrong order re-emits the orphan. Verified in init.js/update.js on feat/vault-second-brain.

## Waived findings
- loop.mjs `.worktrees/` path swap (commit 180dae8) has no dedicated test — waived: loop.mjs is not a hook; guard.mjs smoke fixture covers the containment rule it mirrors. Re-raise only if the loop worktree logic diverges from the guard rule.

## Verified-correct patterns (don't re-flag)
- guard.mjs worktree containment compares `resolve(physDir,wtPath)+"/"` vs `top+"/"` — trailing slash on both sides intentionally prevents `/repo` vs `/repo-sibling` prefix false-match. Correct.

## Repo defect classes (cont.)
- Hash-snapshot tamper checks (stop-gate.mjs): comparing only `f in now && hash differs` misses DELETE/RENAME — the cheapest way to make a failing check pass. Flag missing-in-now too, but only when the enumerator succeeded (a null/`{}` from a failed `git ls-files` must stand down, not block everything).

## Verified-correct patterns (don't re-flag)
- guard.mjs ENV_DUMP `(^|[;&|]\s*)env\s*(\||>|$)`: `env FOO=1 npm test` correctly allowed (no `|`/`>`/EOL after `env`); `echo` rule needs a literal `$` so prose mentioning tokens is safe. Fragment double-scan (raw + quote-folded) adds no new false positives — raw split already yields `.env` from quoted forms.
- RESOLVED in 5ab95b6 (feat/skills-audit-adoptions): tamper check now flags `!(f in now) || hash differs`, guarded by a non-null `hashGated`. Verified live on delete/rename/honest-green/git-gone/edit. Don't re-flag this shape.
