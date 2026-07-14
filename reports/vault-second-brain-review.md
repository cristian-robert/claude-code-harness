Plan: plans/vault-second-brain-plan.md

# vault-second-brain — branch review (whole branch vs main, incl. stacked skill-name-collision commits)

Reviewer: code-reviewer protocol (template/.claude/agents/code-reviewer.md), tier `deep` (opus, sibling of the plan's `build`), effort xhigh, fresh context. Diff: `git diff main...HEAD` at 180dae8 (46 files, +756/−88). Verdict verbatim:

---

PASS

conformance: OK — Both plans satisfied. skill-name-collision: git mv plan→plan-work / review→review-branch, name:/header updated, all living refs swept (grep-clean; residual hits are historical docs/design/, synthetic test fixtures, or comments about the rename), cli/migrations.js + 2.0.0 (its Task 5). vault-second-brain: all 9 tasks landed, review-branch row says "none — isolated" (reviewer isolation preserved). 5 report deviations each carry sound reasons (stacked branch, verbatim-table wording made adopter-safe, in-repo run per user directive) — none blocks. Commit 180dae8 matches its message + hard rule.
correctness: OK — guard.mjs worktree check: `-b/-B` value-skip correct, path-first and flag-first orderings both caught, trailing-slash prefix compare prevents /repo vs /repo-sibling false-match, non-git fails open. session-start vault line gated on mode==="existing" + non-empty path. migrations.js retires old SKILL.md→.backup (idempotent, preserve-first-backup, no-op vs pre-rename payload). Migration ordering verified: copy→migrate→emit in init.js (437<467<549) and update.js (260<339) — orphan never re-emitted. loop.mjs `.worktrees/` + info/exclude append (appendFileSync imported line 27).
tests: OK — smoke 97/0 (+3 new worktree-guard fixtures: escape denied, in-repo allowed, list allowed — satisfies hook-edit hard rule); +2 session-start vault fixtures; cli/migrations.test.js 16/0 wired into npm test.
security: OK — execFileSync array-args (no shell injection); migration paths hardcoded in RENAMED_SKILLS (no traversal); no secrets touched.
conventions: OK — ledger 1656/2000; AGENTS.md 59/60, 00-core 45/45 at cap, all edited skill bodies ≤100 (max plan-work 92), debugging 50/70; vault-protocol citations 9 (≥7); docs/05 within 130.
boundaries: OK — changes confined to template/, cli/, docs/; CLI→migrations dependency direction correct; no forbidden imports.

Note: loop.mjs `.worktrees/` path change (180dae8) has no dedicated test — non-blocking: loop.mjs is not a hook, dry-run skips the branch, and the change mirrors the guard rule that IS fixture-covered. Dry-run runs clean.
Note: guard's worktree matcher can be evaded by a dir literally named `worktree` passed to `-C` (indexOf ambiguity) — accepted; guard is documented anti-accident, not anti-adversary.

---

Reviewer memory updated: `.claude/agent-memory/code-reviewer/MEMORY.md` (defect classes: rename-sweep completeness, migration ordering; waived loop.mjs test; verified guard prefix-compare pattern).
