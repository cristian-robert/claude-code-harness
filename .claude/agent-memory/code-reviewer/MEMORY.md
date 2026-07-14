# code-reviewer memory

## Repo defect classes
- Skill renames must be swept in ALL living docs (grep bare `/name`) AND retired in CLI (backupAndCopy is additive — old dir shadows built-in without cli/migrations.js). Historical plans/reports/docs/design keep old names by design — not misses.
- CLI migration correctness hinges on order: payload copy → migrateRenamedSkills → emitCodex. Wrong order re-emits the orphan. Verified in init.js/update.js on feat/vault-second-brain.

## Waived findings
- loop.mjs `.worktrees/` path swap (commit 180dae8) has no dedicated test — waived: loop.mjs is not a hook; guard.mjs smoke fixture covers the containment rule it mirrors. Re-raise only if the loop worktree logic diverges from the guard rule.

## Verified-correct patterns (don't re-flag)
- guard.mjs worktree containment compares `resolve(physDir,wtPath)+"/"` vs `top+"/"` — trailing slash on both sides intentionally prevents `/repo` vs `/repo-sibling` prefix false-match. Correct.
