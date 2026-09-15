Plan: plans/harness-improvements-m2-plan.md · Item: none (workTracking none)

## Round 1 — 2026-09-15

PASS

Reviewed `git diff main...HEAD` (68 files, 27 commits) against `plans/harness-improvements-m2-plan.md`. No blockers. Every command below was run fresh in this session.

**conformance: OK** — all 14 tasks (0–13) landed. Three narrowings, each justified in the report's numbered rulings and each verified here: the `page` entry in the placeholder allowlist was dropped (ruling 25) because `cli/cli-hardening.test.js:349` requires every allowlist entry to be earned by an in-scope token, and `<page>` lives only in `references/` and `agents/`, outside the gate's `AGENTS.md .claude/rules/ knowledge-base/` scope; `models/SKILL.md:34` ends "Never a build task." rather than the plan's longer sentence, since the scope list already precedes it (ruling 26); `--docs` resolves against the cwd, not the measured dir (ruling 24), which is what the plan's own end-to-end step 4 assumed. Two off-plan additions carry fixtures: the gate-count filter in `session-start.mjs:80` and `statusline.mjs:44`, and three new `tools/ratchet-greps.mjs` CHECKS entries.

**correctness: OK** — driven through the consumers, not read back:

```
guard.mjs  plan write, no field  -> "permissionDecision":"deny" ... "Knowledge to load first:"
guard.mjs  plan write, none—probe -> empty, exit 0
guard.mjs  a push command        -> deny "Push blocked: /evolve has not run since the last commit"
session-start.mjs FORCE=0/startup -> 0 FORCE lines;  FORCE=1/compact -> 1 FORCE line
run-check.mjs words -- node -e … "a b" -> exit=0 · log=.claude/state/checks/words.log · 1 lines / a b
run-check.mjs --tail 5 -- npm test     -> usage…, exit 64
run-check.mjs from docs/               -> log=../.claude/state/checks/sub.log, no docs/.claude
memory-delta.mjs diff -> "no snapshot yet…";  PHE_MEMORY_FILE=/nonexistent -> "nothing to diff"
plan-anchors.mjs on this plan -> 27 ok, 7 missing, 2 unparsed, exit 1 (the 7 the plan predicts)
```

`stop-gate.mjs:79` filters to non-empty strings before the `removed` comparison at `:80`, so an emptied-by-typo gate still refuses after a RED. The INCOMPLETE tamper arm at `:136` reuses the RED path's non-null `hashGated` guard.

**tests: OK** — every hook behavior change has a fixture driving stdin JSON, every tool change a CLI-invoking test.

```
node tools/self-harness.mjs --check          -> root .claude/ matches template/.claude/, exit 0
node template/.claude/hooks/smoke-test.mjs   -> 170 passed, 0 failed
npm test                                     -> exit 0, 23 "passed, 0 failed" suites
node tools/ratchet-greps.mjs                 -> clean, exit 0
node tools/context-ledger.mjs template --docs docs -> WARN 1849/2000, no HARD, every doc <=130, exit 0
```

**security: OK** — `run-check.mjs:41` quoting probed adversarially: a single argv word containing `;`, a `touch` of a scratch path, and a `$(whoami)` substitution was passed through literally, no file created, no substitution performed. Single-word-after-`--` shell execution is the documented owner-trusted path, same trust level as `stopGate` entries. `label` sanitizes to `[A-Za-z0-9_-]`, so no path traversal into the log dir. The only new deny widens enforcement. No secrets in the diff.

**conventions: OK** — budgets hold (`00-core.md` 45/45, `harness-maintenance.md` 109/120, `plan-template.md` 59, root `AGENTS.md` 60). Every new rule line ends with a `traces to:`. Root `.claude/` is in sync.

**boundaries: OK** — `git show main:knowledge-base/architecture.md` and `decisions.md` both report the path does not exist. This repo's knowledge base is the vault, per `AGENTS.md`, so I reviewed from the code. The vault carries ADR-026 and a `[~]` focus bullet for this milestone.

Note: the plan-lint regex at `guard.mjs:197` has two adjacent `[ \t]*` around an optional `-`, which is O(n²) on a leading whitespace run. A 50,000-space line costs 973 ms measured. Not reachable from a real plan file, and the hook fails open on timeout. A single character class would flatten it.

Note: the guard's tamper layer now arms on INCOMPLETE, so a gate that ran out of its time budget on a slow machine will refuse a later GREEN that required an honest edit to a gated test. This is the plan's stated intent, the block is overridable by explaining to the user, and `stopGateTamperPaths` ships empty.

Note: `cli/model-tiers.js:26` now records codex-cli 0.144.3 verified 2026-09-05, while `docs/99-sources.md` still heads its Model policy section "verified 2026-07-12" with codex-cli 0.144.0. Both dates are correct for what they record (no ID changed), but a reader comparing them will pause.

Note (incidental, not in the diff): writing this file through a shell heredoc was denied by `guard.mjs`, because the verdict text quoted the two words of a push command and `gitMutations` scans the whole command string without distinguishing heredoc bodies. `splitTopLevel`, `tokenize` and `gitParse` are untouched on this branch, so this is pre-existing, not a regression here.
