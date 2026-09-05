---
ticket: ad-hoc
created: 2026-09-05
complexity: L
confidence: 7/10
tier: deep
---

# Harness improvements, milestone 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the seven Tier 2 items of the deep analysis (citation anchors, a mechanical plan-confidence rubric, verify-by-effect and decisions-taken-unasked, `/evolve` reading the platform's own measurements and auto-memory deltas, review follow-ups M3 and M6, a token-and-docs ledger, the migrations-in-CLI rule) together with every behavioural defect the M1 reviews deferred, then ship the result as 3.4.0.

**Architecture:** Executable logic goes into tested `.mjs`/`.js` files (`template/.claude/hooks/`, `template/.claude/tooling/`, `tools/`, `cli/`) with a fixture per behaviour; prose changes edit existing lines in place to hold the budgets (`00-core.md` has one line of headroom, `harness-init` none). Every template edit is followed by `node tools/self-harness.mjs` so the root copy that governs these very sessions matches. Tasks run in the primary checkout on one milestone branch, as M1 did (M1 Ruling 1): the root stop gate and the sync must run where the session runs, so the `/implement` worktree step is NOT followed literally.

**Tech Stack:** Node ≥18, zero dependencies, ESM for hooks/tooling/tools, CommonJS for `cli/`, the repo's ad-hoc `check()`/`test()`/`assert()` runners, `npm test` as the full suite.

**Spec:** `reports/2026-09-05-harness-deep-analysis.md` — sections 3.1, 3.3, 4.2, 4.4, 5.2, 5.3, 5.4, 5.6, 6.3, 6.4 and the Tier 2 roadmap (items 7–13); the deferred minors in `reports/harness-improvements-m1-implementation-report.md` "Follow-ups (deferred minors)"; operator answers 2026-09-05: minors = the behavioural defects plus every wording/fixture nit in a file a task already touches; one plan; docs are measured AND trimmed; the pending `/models` stamp and the 3.4.0 bump are folded in.

## Global Constraints

- Budgets, measured by `node tools/context-ledger.mjs template`: template `CLAUDE.md` ≤60 lines, each rule ≤45, skill body ≤100, context/knowledge skill body ≤70, reference ≤160, `harness-maintenance.md` ≤120; docs ≤130 (measured from Task 9 on); aggregate ≤2000 est. tokens (currently 1726, WARN).
- Every new rule line ends with `(traces to: <incident>)`; adding means cutting.
- Any edit under `template/.claude/hooks/` → `node template/.claude/hooks/smoke-test.mjs` green (currently `150 passed, 0 failed`), with a new fixture per new behaviour.
- Platform claims are verified against the raw docs page (`https://code.claude.com/docs/en/<page>.md`), never a summarized fetch. The claims this plan relies on were read raw on 2026-09-05 and are quoted in the task that uses them.
- Hooks stay dependency-free, exec-form, fail-open (ADR-006, ADR-007). Skills call subcommands; they never carry migration or measurement logic (ADR-021, Task 10 makes this a rule).
- Commits are conventional (`feat:` / `fix:` / `docs:` / `chore:` / `test:`), never on `main`. This plan executes on the branch `feat/harness-improvements-m2`, created in Task 0 from `main` in the primary checkout — no worktree, no sibling directory.
- After every template edit: `node tools/self-harness.mjs && node tools/self-harness.mjs --check` before the turn ends, and `git add .claude` alongside `template/` — the root stop gate fails on drift.
- Dispatch roles, never model names: implementers run at the plan's `tier:` (`deep`; the per-task hint says `build` where the change is fully specified); every review is a fresh `deep` context at `effort: xhigh` (dispatch-protocol.md).
- Handoff: after Task 6 (the midpoint), and at any point the statusline `ctx` passes ~120k tokens, run `/handoff` then `/clear` and resume with `/implement plans/harness-improvements-m2-plan.md` — the per-task status in the implementation report is the resume point.

---

## Context

- Knowledge to load first: LOCAL: `none — this repo's knowledge base is the vault (AGENTS.md "Knowledge Vault"); Task 12 makes the two root knowledge skills say so` · SHARED: `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (ADR-014 the unchecked `Knowledge to load first:` field, ADR-016, ADR-021, ADR-024, ADR-025), `~/Dev/The Vault/wiki/checks-that-cannot-fail.md`, `~/Dev/The Vault/agent-kb/patterns/executable-logic-never-in-prose.md`, `~/Dev/The Vault/agent-kb/patterns/summarized-fetch-is-not-a-source.md`, `~/Dev/The Vault/agent-kb/patterns/retired-vocabulary-leaks.md`.
- Read first (each anchor is a backticked path, a middle dot, then a quoted phrase that exists verbatim in that file; the line number is a hint, the phrase is what Task 5's checker greps — every anchor below names its full path, and none contains a double quote):
  - `template/.claude/hooks/stop-gate.mjs:77` · "const gate = Array.isArray(cfg.stopGate)" — the unfiltered gate read (Task 1).
  - `template/.claude/hooks/stop-gate.mjs:134` · "&& !existsSync(snapPath)) {" — the tamper layer that INCOMPLETE never arms (Task 1).
  - `template/.claude/hooks/stop-gate.mjs:175` · "make the checks faster" — the message Task 1 rewrites.
  - `template/.claude/hooks/session-start.mjs:21` · "function emit(lines)" — exits unconditionally, which is why the compact path never reaches the FORCE check (Task 2).
  - `template/.claude/hooks/session-start.mjs:144` · "if (process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE)" — the check Task 2 moves and tightens.
  - `template/.claude/hooks/session-start.mjs:84` · "const local = typeof k.local" — the local-knowledge line Task 12 makes honest.
  - `template/.claude/hooks/guard.mjs:186` · "].includes(tool)) {" — the block after which Task 4 inserts the plan-lint; the `deny()` helper sits at `:83-93`.
  - `template/.claude/hooks/guard.mjs:311` · "default true; false opts out" — the comment that contradicts `=== true` (Task 4).
  - `template/.claude/hooks/smoke-test.mjs:16` · "function runHook(script, event, env)" — the hook runner every fixture uses.
  - `template/.claude/hooks/smoke-test.mjs:29` · "function check(name, cond, detail" — the assertion helper.
  - `template/.claude/hooks/smoke-test.mjs:416` · "Tamper check (opt-in, stopGateTamperPaths)" — the block Task 1's new fixture mirrors.
  - `template/.claude/hooks/smoke-test.mjs:538` · "const SLOW = " — the timing fixture Task 1 simplifies.
  - `template/.claude/hooks/smoke-test.mjs:762` · "runs EVERY subagent on one model" — the FORCE fixture block Task 2 extends.
  - `template/.claude/hooks/smoke-test.mjs:917` · "statusline degrades to percent only" — the degrade fixture Task 2 tightens.
  - `template/.claude/tooling/run-check.mjs` (61 lines, read whole — Task 3 replaces it); `cli/run-check.test.js:19` · "function run(args)" — the test runner shape; `cli/run-check.test.js:86` · "missing -- separator is a usage error" — the last existing test.
  - `tools/context-ledger.mjs:21` · "const est = (text)" — the estimator; `tools/context-ledger.mjs:74` · "const skillsDir" — the skills loop Task 9 extends; `tools/context-ledger.mjs:100` · "const total = rows.reduce" — the summary section.
  - `tools/self-harness.mjs:57` · "function templateDirs()" — the sweep's only input today (Task 12 retires it); `tools/self-harness.mjs:67` · "function extras()" — the sweep Task 12 widens; `cli/self-harness.test.js:26` · "function makeTemplate(dir)" — the fixture builder, and `cli/self-harness.test.js:47` · "const args = ['--root', root, '--template', tpl];" — how every test invokes the script.
  - `cli/emit-codex.js:108` · "!codexHalf[tier] && DEFAULT_MODELS.codex[tier]" — the falsiness test (Task 11); `cli/emit-codex.test.js:103` · "delete PRE_ROUTINE.codex.routine" — the test shape to copy.
  - `template/.claude/rules/00-core.md:35` · "Never claim done/fixed/passing" — the line Task 6 extends (file is 44/45).
  - `template/.claude/skills/plan-work/SKILL.md:74` · "Fill plan frontmatter per the template" (body 85/100); `template/.claude/skills/implement/SKILL.md:23` · "Then load the plan's **Knowledge to load first** entries NOW" and `template/.claude/skills/implement/SKILL.md:65` · "Evidence means command output on record" (body 88/100); `template/.claude/skills/evolve/SKILL.md:61` · "Measure, don't estimate" and `template/.claude/skills/evolve/SKILL.md:91` · "LAST — after the" (body 94/100).
  - `template/.claude/references/plan-template.md:23` · "- Read first: <file:line> — <why>" (58 lines); `template/.claude/references/harness-maintenance.md:39` · "## 3. Change protocol" (107/120); `template/.claude/references/work-tracking.md:21` · "## The tracking root" (68 lines, the canonical home for Task 8).
  - The five M3 restatements: `template/.claude/skills/accept/SKILL.md:14`, `implement/SKILL.md:25` and `:80`, `validate/SKILL.md:89`, `review-branch/SKILL.md:28` — each carries the phrase `first \`worktree \` line of \`git worktree list --porcelain\`` (not an anchor: the grep in Task 8 enumerates them).
- Pattern to follow: `cli/run-check.test.js` — the CJS test shape (`test(name, fn)`, one temp dir, `process.exitCode = 1` on failure, `N passed, M failed` summary); `template/.claude/hooks/smoke-test.mjs` — `check(name, cond)` fixtures with a temp repo per block; `cli/self-harness.test.js` `makeTemplate()` — a miniature template on disk.
- Platform contract, read raw 2026-09-05: `env-vars.md` row "`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` — Set to `1` to force one model onto subagents…" and the note "Some variables read only whether you set them at all, so any non-empty value including `0` turns the behavior on… These variables work that way:" whose list does NOT include the FORCE variable; `skills.md` "Run `/skill-doctor` to see what each of your skills costs… In non-interactive mode with `-p`, Claude Code prints it as text." and "`/skill-doctor` requires Claude Code v2.1.252 or later"; `skills.md` "re-attaches the most recent invocation of each skill after the summary, keeping the first 5,000 tokens of each. Re-attached skills share a combined budget of 25,000 tokens"; `memory.md` "Each project gets its own memory directory at `~/.claude/projects/<project>/memory/`. The `<project>` path is derived from the git repository" (the exact encoding is observed, not documented — Task 7 says so in code); `commands.md` `/doctor` row "Deduplicates local `CLAUDE.md` files against checked-in ones, trim…"; `memory.md` "Run `/context` and check the list under **Memory files**".
- Library versions: none (zero-dependency repo). Node on this machine: v24.14.0 via fnm.
- Measured 2026-09-05: `npm test` exit 0 in ~25 s; `node template/.claude/hooks/smoke-test.mjs` → `150 passed, 0 failed`; `node tools/context-ledger.mjs template` → 1726 / 2000 (WARN); `node tools/self-harness.mjs --check` → matches; docs: `docs/01` 140, `docs/03` 136, `docs/99` 145, `docs/06` 130.

## Out of scope

- Tier 3 of the analysis (`InstructionsLoaded` runtime ledger, `/verify` vs `qa-evaluator` ablation, HTML-comment traces, skill-scoped `once` hooks, the Codex rules gap) — each needs an incident first.
- The deferred minors marked historical (superseded wording inside `plans/harness-improvements-m1-plan.md` and `plans/model-tier-map-plan.md`) — plans stay the artifact of their time.
- The `error=<code>` branch of `run-check.mjs` stays untested: there is no way to make `spawnSync` report a non-timeout error from the CLI surface without a test-only hook, and adding one is more code than the branch.
- A `/skill-doctor` run from inside `/evolve` via a nested `claude -p` — the skill asks the operator for the report instead (Task 7); spawning a second model session from a skill is not a measurement, it is a cost.
- Arming `stopGateTamperPaths` at the root; re-running `/harness-init` at the root; a docs budget for `README.md`.
- Publishing 3.4.0 to npm — the bump lands in Task 13; `npm publish` is the operator's action after merge.

## Tasks

Execution order: 0 → 13, sequential (most tasks touch `smoke-test.mjs` or `package.json`, so no `Wave:` groups). Per-task tier hints: `build` where noted, else `deep`.

### Task 0: Commit the pending `/models` stamp on the milestone branch

Tier hint: `build`.

**Files:**
- Modify (already modified in the working tree, uncommitted): `.claude/harness.json`, `template/.claude/harness.json`, `cli/model-tiers.js` — `checkedAt` 2026-07-12 → 2026-09-05 and the verification comment in `cli/model-tiers.js:26-27`.

- [ ] **Step 1: Confirm the tree holds exactly the stamp**

Run: `git status --short && git diff --stat`
Expected: exactly three ` M` lines (`.claude/harness.json`, `cli/model-tiers.js`, `template/.claude/harness.json`), `3 files changed, 5 insertions(+), 5 deletions(-)`. Anything else → stop and report; do not commit unknown changes.

- [ ] **Step 2: Branch and commit**

```bash
git checkout -b feat/harness-improvements-m2
node cli/model-tiers.test.js | tail -1
git add .claude/harness.json template/.claude/harness.json cli/model-tiers.js
git commit -m "chore(models): tier map re-verified against both live catalogs, checkedAt 2026-09-05" -m "Anthropic Models API (11 models; haiku/sonnet/opus aliases resolve to Haiku 4.5, Sonnet 5, Opus 5) and Codex CLI 0.144.3's catalog endpoint (gpt-5.6 luna/terra/sol unchanged, effort ceilings unchanged). No id or effort changed; the CLI default carries the same date because cli/model-tiers.test.js pins template and default together."
```

Validate: `git branch --show-current` → `feat/harness-improvements-m2`; `git status --short` → empty; `node cli/model-tiers.test.js | tail -1` → `72 passed, 0 failed`.
Acceptance criteria: the branch exists off `main`, the tree is clean, the stamp is one commit.

### Task 1: Stop gate — non-string entries, INCOMPLETE arms the tamper layer, honest messages

**Files:**
- Modify: `template/.claude/hooks/stop-gate.mjs:77` (gate read), `:134` (tamper arm condition), `:175` (INCOMPLETE reason), `:56-57` and `:157` (comments about the statusline)
- Modify: `template/.claude/hooks/smoke-test.mjs` — `:501` (fixture name), `:538` and `:548` (`SLOW` → `OK`), new fixtures after the tamper block (`:416-452`) and inside the gate-config block (after the `t5` fixture, before that block's closing `}` near `:552`)

**Interfaces:**
- Produces: nothing new; the gate's config contract is unchanged (entries that are not non-empty strings are ignored).

- [ ] **Step 1: Write the failing fixtures**

Inside the gate-config block, after the `t5` INCOMPLETE fixture's final `check(...)`, add (the block's `mk`, `cfgT`, `stop`, `blocked`, `reason`, `OK`, `FLAG_CMD`, `setRed`, `TIGHT` are in scope there — confirm with `grep -n "const OK\b\|const mk\b\|const cfgT\b" template/.claude/hooks/smoke-test.mjs` and, if `OK` is defined inside a different block, define `const OK = 'node -e "process.exit(0)"';` locally):

```js
  // A non-string entry (a typo'd JSON number, null) used to reach execSync, throw, and pin the
  // gate RED on every turn end for the whole session. Entries are filtered to non-empty strings.
  const t6 = mk(); writeFileSync(join(t6, ".claude", "harness.json"), JSON.stringify({ stopGate: [42, null, OK] }));
  const mixed = stop(t6);
  check("non-string stopGate entries are ignored, the string entry still runs", mixed.code === 0 && mixed.out === "");
  writeFileSync(join(t6, ".claude", "harness.json"), JSON.stringify({ stopGate: [42] }));
  const onlyBad = stop(t6);
  check("a gate with no string entry is disarmed, never RED", onlyBad.code === 0 && onlyBad.out === "");

  // The INCOMPLETE message must not invite the one edit the exact-string check refuses.
  const t7 = mk(); writeFileSync(join(t7, ".claude", "harness.json"), cfgT([OK, FLAG_CMD], TIGHT)); setRed(t7, true);
  const inc7 = stop(t7);
  check("INCOMPLETE reason never says faster and says an edited command counts as removed",
    blocked(inc7) && !/faster/i.test(reason(inc7)) && reason(inc7).includes("counts as removing it"));
```

After the tamper block (the `}` that closes the block starting `// Tamper check (opt-in, stopGateTamperPaths)`), add a new block:

```js
{
  // INCOMPLETE arms the opt-in file-tamper layer too: after a partial gate, rewriting a gated
  // test and then letting the full gate run "green" is the same escape RED closes.
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-tamper-inc-"));
  execFileSync("git", ["init", "-q", "-b", "main", tmp]);
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  mkdirSync(join(tmp, "tests"), { recursive: true });
  writeFileSync(join(tmp, "tests", "a.test.js"), "assert(2 + 2 === 4)\n");
  execFileSync("git", ["-C", tmp, "add", "tests/a.test.js"]);
  execFileSync("git", ["-C", tmp, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "tests"]);
  const OK0 = 'node -e "process.exit(0)"';
  const tight = { stopGate: [OK0, FLAG_CMD], stopGateTamperPaths: ["tests/"], stopGateTotalSec: 1, stopGateTimeoutSec: 1 };
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify(tight)); setRed(tmp, true);
  const inc = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let incBlocked = false, incReason = ""; try { const o = JSON.parse(inc.out); incBlocked = o.decision === "block"; incReason = o.reason || ""; } catch { /* non-JSON stdout: not a block */ }
  const snapPath = join(tmp, ".claude", "state", "tamper-smoke.json");
  check("INCOMPLETE gate writes the tamper snapshot", incBlocked && incReason.includes("INCOMPLETE") && existsSync(snapPath));
  writeFileSync(join(tmp, "tests", "a.test.js"), "assert(2 + 2 === 5)\n"); // the dishonest edit
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: [OK0, FLAG_CMD], stopGateTamperPaths: ["tests/"] })); // full budget again
  setRed(tmp, false); // suite "goes green"
  const after = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let aBlocked = false, aReason = ""; try { const o = JSON.parse(after.out); aBlocked = o.decision === "block"; aReason = o.reason || ""; } catch { /* non-JSON stdout: not a block */ }
  check("green after a gated edit following INCOMPLETE blocks and names the file", aBlocked && aReason.includes("tests/a.test.js"));
}
```

Rename the fixture at `:501`: `"refused GREEN persists a TAMPER verdict (statusline never stale)"` → `"refused GREEN persists a TAMPER verdict (pre-compact snapshot never stale)"`.

Replace the `SLOW` constant usage: at `:538` change the line to `const SLOW = OK; // any elapsed time under a 1 s budget skips the second command — no sleep needed (fix-wave re-review, 2026-09-05)` and keep the two `cfgT([SLOW, …])` calls as they are.

- [ ] **Step 2: Run to verify they fail**

Run: `node template/.claude/hooks/smoke-test.mjs | grep -E 'non-string|no string entry|never says faster|INCOMPLETE gate writes|following INCOMPLETE|passed'`
Expected: the five new checks FAIL (the first two because the unfiltered gate throws into a RED block; the message check because the text still says "faster"; the two tamper checks because the snapshot never arms), summary `150 passed, 5 failed`.

- [ ] **Step 3: Implement**

In `stop-gate.mjs` replace line 77 with:

```js
  // Entries that are not non-empty strings are ignored, never run: a typo'd number reached
  // execSync, threw, and pinned the gate RED on every turn end for the session (M1 review).
  const gate = (Array.isArray(cfg.stopGate) ? cfg.stopGate : []).filter((c) => typeof c === "string" && c.trim());
```

At line 134 change `if (verdict === "RED" && !existsSync(snapPath)) {` to `if ((verdict === "RED" || verdict === "INCOMPLETE") && !existsSync(snapPath)) {` and extend the comment above it: `// On RED — or INCOMPLETE, a partial gate being the same opening — snapshot the gated files ONCE`.

At line 175 replace the sentence `Raise stopGateTotalSec / stopGateTimeoutSec, make the checks faster, or run /validate manually before finishing.` with `Raise stopGateTotalSec / stopGateTimeoutSec, or run /validate manually before finishing. Editing a command's text counts as removing it (the gate compares exact strings) — change one only with the user's confirmation.`

Fix the two false comments. Run `grep -n "last-gate" template/.claude/hooks/pre-compact.mjs template/.claude/statusline.mjs` first: the statusline never reads it, pre-compact.mjs does (if pre-compact.mjs does not either, the comment names only "the next session's PreCompact snapshot" reader you find). Rewrite `:56-57` as `// A refused GREEN persists a TAMPER verdict first, so the pre-compact snapshot (the one reader of last-gate.json) never carries the stale verdict of the last real run.` and `:157` as `// Persist the verdict for the PreCompact snapshot (.claude/state/ is gitignored by adopters).`

- [ ] **Step 4: Run to verify they pass**

Run: `node template/.claude/hooks/smoke-test.mjs | tail -1`
Expected: `155 passed, 0 failed`.

- [ ] **Step 5: Sync the root and commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude/hooks .claude/hooks
git commit -m "fix(stop-gate): ignore non-string entries, arm the tamper layer on INCOMPLETE, stop inviting the edit the gate refuses"
```

Validate: `node template/.claude/hooks/smoke-test.mjs | tail -1` → `155 passed, 0 failed`; `grep -c 'make the checks faster' template/.claude/hooks/stop-gate.mjs` → `0`; `grep -n 'statusline' template/.claude/hooks/stop-gate.mjs` → no line claims the statusline reads the verdict.
Acceptance criteria: a `stopGate` of `[42, "<ok cmd>"]` ends the turn GREEN; an INCOMPLETE gate writes `tamper-<sid>.json` when `stopGateTamperPaths` is set; the INCOMPLETE reason no longer contains "faster".

### Task 2: Session start and statusline — FORCE semantics, post-compaction warning, megatoken step, fixture pins

**Files:**
- Modify: `template/.claude/hooks/session-start.mjs:36` (after `const lines = [];`), delete `:141-144` (old comment + check)
- Modify: `template/.claude/statusline.mjs:3` (comment), `:22` (formatter)
- Modify: `template/.claude/hooks/smoke-test.mjs:766-770` (FORCE fixtures), `:910-918` (statusline fixtures)

- [ ] **Step 1: Write the failing fixtures**

In the FORCE block (`:762-770`), replace the `check("warns when CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set", …)` condition's `ctx.includes("deep")` with `ctx.includes("`deep` pin (/review-branch) is dead this session")`, and append after the existing `off` check:

```js
  // env-vars.md (raw, 2026-09-05): the row says "Set to `1`", and the variable is NOT in the
  // page's list of set-at-all variables (where `0` would mean on) — so `0` and `false` are off.
  const zero = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup" }, { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "0" });
  let zeroCtx = ""; try { zeroCtx = JSON.parse(zero.out).hookSpecificOutput.additionalContext; } catch { /* empty output is fine here */ }
  check("FORCE=0 does not warn", zero.code === 0 && !zeroCtx.includes("CLAUDE_CODE_SUBAGENT_MODEL_FORCE"));
  // A compaction must not hide the warning: the compact branch used to emit() before the check ran.
  const cmp = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "compact" }, { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1" });
  let cmpCtx = ""; try { cmpCtx = JSON.parse(cmp.out).hookSpecificOutput.additionalContext; } catch { /* no JSON: the check fails */ }
  check("FORCE=1 still warns after a compaction", cmp.code === 0 && cmpCtx.includes("Compaction dropped") && cmpCtx.includes("CLAUDE_CODE_SUBAGENT_MODEL_FORCE"));
```

In the statusline block, replace the degrade check's condition with `/ctx 12%(\s|$)/.test(out2) && !/ctx 12% \d/.test(out2)` (assert on the `ctx` token; the old `!out2.includes("/")` assumed the temp dir was not a git worktree with a slash in its branch name), and append:

```js
  const big = JSON.stringify({ model: { display_name: "M" }, workspace: { current_dir: tmpdir() }, context_window: { used_percentage: 12.3, total_input_tokens: 123456, context_window_size: 1000000 } });
  let out3 = ""; try { out3 = execFileSync("node", [join(HOOKS, "..", "statusline.mjs")], { input: big, encoding: "utf8", timeout: 10000 }).trim(); } catch (e) { out3 = `${e.stdout || ""}`; }
  check("statusline renders a 1M window as 1.0M, never 1000k", out3.includes("ctx 12% 123k/1.0M"));
  const bad = JSON.stringify({ model: { display_name: "M" }, workspace: { current_dir: tmpdir() }, context_window: { used_percentage: "lots", total_input_tokens: "x" } });
  let out4 = ""; try { out4 = execFileSync("node", [join(HOOKS, "..", "statusline.mjs")], { input: bad, encoding: "utf8", timeout: 10000 }).trim(); } catch (e) { out4 = `${e.stdout || ""}`; }
  check("statusline omits ctx on a malformed context_window and still prints the model", !out4.includes("ctx") && out4.includes("M"));
```

- [ ] **Step 2: Run to verify they fail**

Run: `node template/.claude/hooks/smoke-test.mjs | grep -E 'FORCE|statusline|passed'`
Expected: `warns when … is set` PASSes on the tighter sentence pin (the sentence already exists), `FORCE=0 does not warn` FAILs, `still warns after a compaction` FAILs, `1.0M` FAILs, the malformed check PASSes (already degrades); summary `156 passed, 3 failed` (155 + 4 new).

- [ ] **Step 3: Implement**

In `session-start.mjs`, directly after `const lines = [];` (line 36) insert:

```js
  // Every subagent — the reviewer included — runs on ONE model while this is on (2.1.257): the
  // reviewer loses its `deep` pin and reviews on the session's model, silently. env-vars.md (raw,
  // 2026-09-05) documents it as "Set to `1`" and does NOT list it among the set-at-all variables,
  // so `0`/`false`/empty are off. Above the compact branch on purpose: a compaction must not hide it.
  const force = String(process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE ?? "").trim().toLowerCase();
  if (force && force !== "0" && force !== "false") lines.push("CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set — every subagent runs on one model, so the reviewer's `deep` pin (/review-branch) is dead this session. Unset it.");
```

Delete the old comment and check at `:141-144` (the three comment lines beginning `// Every subagent — the reviewer included` and the `if (process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE)` line).

In `statusline.mjs:22` replace `const k = (n) => \`${Math.round(n / 1000)}k\`;` with:

```js
    const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`); // 1M windows read as 1.0M, not 1000k
```

In `statusline.mjs:3` change `context %` to `context % + tokens`.

- [ ] **Step 4: Run to verify they pass**

Run: `node template/.claude/hooks/smoke-test.mjs | tail -1`
Expected: `159 passed, 0 failed`.

- [ ] **Step 5: Sync the root and commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude .claude
git commit -m "fix(session-start): FORCE warning follows the documented on/off rule and survives compaction; statusline renders 1M windows"
```

Validate: `grep -c 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE' template/.claude/hooks/session-start.mjs` → `2` (one comment, one code line); `echo '{"session_id":"x","source":"compact","cwd":"'$PWD'"}' | CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 node .claude/hooks/session-start.mjs | grep -c FORCE` → `1`.
Acceptance criteria: `FORCE=0` prints no warning; `FORCE=1` on `source: compact` prints it; a 1,000,000-token window renders `1.0M`.

### Task 3: run-check — argv fails closed, words survive the shell, bounded tail, repo-root state, pruning

**Files:**
- Replace: `template/.claude/tooling/run-check.mjs` (61 lines → the file below)
- Modify: `cli/run-check.test.js` — `:77-81` (outer-kill grandchild), new tests before the summary line
- Modify: `.gitignore` only if `.claude/state/` is not already root-anchored there (check with `grep -n 'state' .gitignore`)

**Interfaces:**
- Produces: the same CLI (`run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>`) with two contract changes callers can see: (1) a single word after `--` is a shell string as before; two or more words are re-quoted one by one, so `-- npm test -t "my test"` keeps the space; (2) the log lives at `<git root>/.claude/state/checks/<label>.log` and the header's `log=` path is relative to the cwd.

- [ ] **Step 1: Write the failing tests**

Before the `console.log('\n' + passed + …)` summary in `cli/run-check.test.js`, add:

```js
test('a leading flag where the label should be is a usage error, exit 64', () => {
  const r = run(['--timeout-sec', '5', '--', 'node -e "process.exit(0)"']);
  assert.strictEqual(r.code, 64);
  assert.ok(/usage/.test(r.out));
});

test('a non-numeric or zero --tail / --timeout-sec fails closed with exit 64', () => {
  assert.strictEqual(run(['t', '--tail', 'abc', '--', 'node -e "process.exit(0)"']).code, 64);
  assert.strictEqual(run(['t', '--tail', '0', '--', 'node -e "process.exit(0)"']).code, 64);
  assert.strictEqual(run(['t', '--timeout-sec', '-3', '--', 'node -e "process.exit(0)"']).code, 64);
});

test('words after -- are re-quoted one by one, so an argument with a space survives', () => {
  const r = run(['words', '--', 'node', '-e', 'console.log(process.argv.length + ":" + process.argv[2])', 'x', 'y z']);
  assert.strictEqual(r.code, 0);
  assert.ok(r.out.includes('3:y z'), 'expected the two extra argv words intact, got: ' + r.out);
});

test('a label that sanitizes to nothing falls back to check.log', () => {
  const r = run(['---', '--', 'node -e "console.log(1)"']);
  assert.ok(/log=\.claude\/state\/checks\/check\.log/.test(r.out), r.out);
});

test('a command with no output prints a 0-lines header and no tail', () => {
  const r = run(['quiet', '--', 'node -e "process.exit(0)"']);
  assert.strictEqual(r.out.trimEnd(), 'exit=0 · log=.claude/state/checks/quiet.log · 0 lines');
});

test('the tail of a log larger than the read window is still the last N lines', () => {
  const r = run(['big', '--tail', '3', '--', 'node -e "for (let i = 1; i <= 3000; i++) console.log(\'row \' + i + \' \' + \'x\'.repeat(90))"']);
  const lines = r.out.trimEnd().split('\n');
  assert.ok(/· 3000 lines$/.test(lines[0]), lines[0]);
  assert.strictEqual(lines.length, 4);
  assert.ok(lines[3].startsWith('row 3000 '), lines[3]);
});

test('a run from a subdirectory writes the log at the repo root', () => {
  execFileSync('git', ['init', '-q', TMP]);
  const sub = path.join(TMP, 'sub'); fs.mkdirSync(sub, { recursive: true });
  const r = (() => { try { return { code: 0, out: execFileSync('node', [SCRIPT, 'deep', '--', 'node -e "console.log(9)"'], { cwd: sub, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; } })();
  assert.strictEqual(r.code, 0);
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'state', 'checks', 'deep.log')), 'log must be at the git root');
  assert.ok(!fs.existsSync(path.join(sub, '.claude')), 'no second .claude/state under the subdirectory');
  assert.ok(/log=\.\.\/\.claude\/state\/checks\/deep\.log/.test(r.out), 'header path is relative to the cwd, got: ' + r.out);
});

test('old logs are pruned: the newest 20 stay', () => {
  for (let i = 1; i <= 22; i++) { run(['prune-' + i, '--', 'node -e "process.exit(0)"']); sleep(15); }
  const dir = path.join(TMP, '.claude', 'state', 'checks');
  const logs = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  assert.strictEqual(logs.length, 20, 'kept ' + logs.length);
  assert.ok(logs.includes('prune-22.log') && !logs.includes('prune-1.log'), 'newest kept, oldest gone');
});
```

The subdirectory test must run AFTER every test that asserts `log=.claude/state/checks/…` exactly (turning `TMP` into a git repo does not change those paths — root == cwd — but keep it late anyway); the prune test must be the LAST test, since it deletes older logs.

Shorten the orphan in the outer-kill test (`:78`): change `setTimeout(() => {}, 10000)` to `setTimeout(() => {}, 2600)` so the grandchild exits on its own ~100 ms after the test's `sleep(2000); kill; sleep(500)`.

- [ ] **Step 2: Run to verify they fail**

Run: `node cli/run-check.test.js 2>&1 | grep -E 'FAIL|passed'`
Expected: the leading-flag test FAILs (label `timeout-sec` runs), the fail-closed test FAILs (defaults silently), the re-quoting test FAILs (`y` and `z` split), the empty-label and 0-lines tests PASS, the big-tail test PASSes, the subdirectory test FAILs (log under `sub/.claude`), the prune test FAILs (22 logs); `12 passed, 5 failed`.

- [ ] **Step 3: Implement — replace `run-check.mjs` with**

```js
#!/usr/bin/env node
// run-check: run ONE gate command, keep its whole output on disk, print only what a verdict
// needs. /validate runs every gate command through this so a failing suite's thousands of
// lines never enter the context window (tool-call offloading). Exit code = the command's.
// Traces to: 2026-09-05 — /validate read full test output into the window with no cap.
// A wedged command is SIGKILLed after --timeout-sec (default 600) and reports exit 124.
//   node .claude/tooling/run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>
// ONE word after `--` is a shell string (`-- "npm test && x"`); two or more words are re-quoted
// one by one so an argument with a space survives (`-- npm test -t "my test"`). Logs live at
// <git root>/.claude/state/checks/<label>.log; the newest 20 are kept.
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, fstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

const KEEP_LOGS = 20;      // a label that stops being used must not linger forever
const TAIL_BYTES = 65536;  // only the end of the log is read to print the tail

const usage = () => { console.error("usage: run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>"); process.exit(64); };
const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1 || argv[0].startsWith("-")) usage(); // a flag where the label should be is a usage error, never a label
const label = argv[0].replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "check";
const num = (flag, dflt) => { // fail closed: "abc", 0 or -3 is a usage error, never a silent default
  const i = argv.indexOf(flag);
  if (i === -1 || i >= sep) return dflt;
  const raw = String(argv[i + 1] ?? "").trim();
  const n = Number.parseInt(raw, 10);
  if (!/^\d+$/.test(raw) || n < 1) usage();
  return n;
};
const tailN = num("--tail", 40);
const timeoutSec = num("--timeout-sec", 600);
const words = argv.slice(sep + 1);
if (!words.length) usage();
const q = (w) => (/^[A-Za-z0-9_./=:@%+,-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`);
const cmd = words.length === 1 ? words[0] : words.map(q).join(" ");

// State lives at the repo root: a run from a subdirectory must not grow a second
// .claude/state/ that the root .gitignore never sees. Both paths are real paths — git reports
// the real path, and macOS temp dirs are symlinks — so the relative log path stays short.
const cwd = realpathSync(process.cwd());
let root = cwd;
try { root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim() || root; } catch { /* not a git repo: the cwd is the root */ }
const dir = join(root, ".claude", "state", "checks");
mkdirSync(dir, { recursive: true });
const logPath = join(dir, `${label}.log`);
const rel = relative(cwd, logPath).split("\\").join("/");

// The child writes STRAIGHT to the log fd rather than through a buffer this process holds:
// the log fills while the command runs, so killing the runner from outside (a caller's own
// timeout) still leaves the partial output on disk. Shell execution is intentional: gate
// commands are repo-owner-authored, exactly like stop-gate.mjs's stopGate entries.
const fd = openSync(logPath, "w");
let res;
try {
  res = spawnSync(cmd, { shell: true, stdio: ["ignore", fd, fd], timeout: timeoutSec * 1000, killSignal: "SIGKILL" });
} finally {
  closeSync(fd);
}
// Only ETIMEDOUT is a timeout. A child that died from a signal with no such error (a crash,
// an OOM kill) is a signal death, not a deadline — saying "timed out" would misdiagnose it.
const timedOut = Boolean(res.error) && res.error.code === "ETIMEDOUT";
const code = timedOut ? 124 : res.status === null ? 1 : res.status;

// Count lines by streaming (a runaway suite can write more than V8 holds in one string), and
// read only the last TAIL_BYTES for the tail; a partial first line inside that window is dropped.
function countLines(p) {
  const h = openSync(p, "r");
  try {
    const buf = Buffer.alloc(65536); let n = 0, last = 0, total = 0, got;
    while ((got = readSync(h, buf, 0, buf.length, null)) > 0) { total += got; for (let i = 0; i < got; i++) if (buf[i] === 10) n++; last = buf[got - 1]; }
    return total === 0 ? 0 : last === 10 ? n : n + 1;
  } finally { closeSync(h); }
}
function tail(p, n) {
  const h = openSync(p, "r");
  try {
    const size = fstatSync(h).size, start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    if (buf.length) readSync(h, buf, 0, buf.length, start);
    const text = buf.toString("utf8").trimEnd();
    const all = text === "" ? [] : text.split("\n");
    return (start > 0 ? all.slice(1) : all).slice(-n);
  } finally { closeSync(h); }
}
const lineCount = countLines(logPath);
const note = timedOut ? ` · timed out after ${timeoutSec}s` : res.error ? ` · error=${res.error.code}` : res.status === null && res.signal ? ` · killed by ${res.signal}` : "";
console.log(`exit=${code} · log=${rel} · ${lineCount} lines${note}`);
if (lineCount) console.log(tail(logPath, tailN).join("\n"));

try { // housekeeping: keep the newest KEEP_LOGS logs — never fail the check for it
  const logs = readdirSync(dir).filter((f) => f.endsWith(".log")).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { f } of logs.slice(KEEP_LOGS)) unlinkSync(join(dir, f));
} catch { /* a missing or unreadable log dir is not this check's failure */ }
process.exit(code);
```

Note the trailing-blank-line semantics: the old code counted `out.trimEnd().split("\n")`; `countLines` counts newline-terminated lines. The existing tests print exactly N lines with a final newline, so both agree; if any existing test disagrees on a trailing blank line, adjust `countLines` to ignore trailing newlines rather than changing the test.

- [ ] **Step 4: Run to verify they pass**

Run: `node cli/run-check.test.js 2>&1 | tail -1`
Expected: `17 passed, 0 failed` (9 existing + 8 new).

- [ ] **Step 5: Check `.gitignore`, sync, commit**

Run: `grep -n 'claude/state' .gitignore template/.gitignore 2>/dev/null` — the root-anchored `.claude/state/` entry is now sufficient because the runner writes at the git root; no change expected.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude/tooling/run-check.mjs .claude/tooling/run-check.mjs cli/run-check.test.js
git commit -m "fix(run-check): usage errors fail closed, words survive the shell, bounded tail, repo-root logs, prune to 20"
```

Validate: `node .claude/tooling/run-check.mjs demo -- npm test | head -1` → `exit=0 · log=.claude/state/checks/demo.log · <N> lines`; `ls .claude/state/checks | wc -l` → ≤20.
Acceptance criteria: the eight new tests pass; the smoke suite is unaffected (`159 passed`); `/validate`'s documented invocation shape still works.

### Task 4: Guard — the plan-lint (M6) and the evolve-gate wording

**Files:**
- Modify: `template/.claude/hooks/guard.mjs` — insert after the secret-path block ending at `:190`; comment at `:311`
- Modify: `template/.claude/hooks/smoke-test.mjs` — new guard fixtures after `check("denies Read of .env", …)` (`:64`); label at `:144`
- Modify: `template/AGENTS.md` (the Evolve/push row that says "default on" — find with `grep -n 'default on\|default true' template/AGENTS.md README.md`), `template/.claude/harness.json` and `.claude/harness.json` `$comment` (`requireEvolveBeforePush (default true)`)
- Modify: `docs/02-enforcement-vs-guidance.md` — the list of guard checks (find with `grep -n 'guard' docs/02-enforcement-vs-guidance.md`); one new bullet, file stays ≤130

**Interfaces:**
- Produces: a PreToolUse deny on `Write` of any `plans/*-plan.md` whose content has no non-empty `Knowledge to load first:` line. `none — <reason>` passes. `Edit` is not checked (plans are written whole).

- [ ] **Step 1: Write the failing fixtures**

After `check("denies Read of .env", …)` add:

```js
{
  // Plan-lint (review M6, 2026-08-29; ADR-014): nothing checked the plan's knowledge field —
  // a planner could skip retrieval and nobody noticed until review. `none — <reason>` passes.
  const plan = (field) => ({ ...base, tool_name: "Write", tool_input: { file_path: "plans/x-plan.md", content: `---\nticket: t\n---\n# X\n\n## Context\n${field}\n- Read first: a\n` } });
  check("denies a plan write with no Knowledge to load first line", denies(runHook("guard.mjs", plan(""))));
  check("denies a plan write whose Knowledge to load first is empty", denies(runHook("guard.mjs", plan("- Knowledge to load first:   "))));
  check("allows a plan write with `none — <reason>`", !denies(runHook("guard.mjs", plan("- Knowledge to load first: LOCAL: none — no knowledge-base/ · SHARED: wiki/stack/x/"))));
  check("plan-lint ignores non-plan files under plans/", !denies(runHook("guard.mjs", { ...base, tool_name: "Write", tool_input: { file_path: "plans/notes.md", content: "no field here" } })));
  check("plan-lint ignores Edit (plans are written whole)", !denies(runHook("guard.mjs", { ...base, tool_name: "Edit", tool_input: { file_path: "plans/x-plan.md", old_string: "a", new_string: "b" } })));
  const reasonOf = (r) => { try { return JSON.parse(r.out).hookSpecificOutput.permissionDecisionReason || ""; } catch { return ""; } };
  check("plan-lint reason names the field and the template", /Knowledge to load first/.test(reasonOf(runHook("guard.mjs", plan("")))) && /plan-template\.md/.test(reasonOf(runHook("guard.mjs", plan("")))));
}
```

Rename the fixture label at `:144`: `"push gate off by default (no config)"` → `"push gate off when the key is absent (the shipped config sets it)"`.

- [ ] **Step 2: Run to verify they fail**

Run: `node template/.claude/hooks/smoke-test.mjs | grep -E 'plan|passed'`
Expected: the two deny checks and the reason check FAIL; the three allow checks PASS; `162 passed, 3 failed` (159 + 6 new).

- [ ] **Step 3: Implement**

In `guard.mjs`, after the closing `}` of the `if (["Read", "Edit", "Write", "NotebookEdit"].includes(tool)) {…}` block (line 190), insert:

```js
  // Plan-lint: a plan written without its knowledge field skipped retrieval, and nothing
  // checked it until review (review M6, 2026-08-29; ADR-014). Only Write — plans are written
  // whole by /plan-work. The literal `none — <reason>` per store passes.
  if (tool === "Write" && typeof input.file_path === "string" && /(^|[\\/])plans[\\/][^\\/]+-plan\.md$/.test(input.file_path)) {
    if (!/^\s*-?\s*Knowledge to load first:\s*\S/m.test(String(input.content || ""))) {
      deny(`Plan write blocked: '${input.file_path}' has no non-empty "Knowledge to load first:" line. /plan-work records BOTH stores (LOCAL knowledge-base/…, SHARED wiki/ or agent-kb/) or the literal \`none — <reason>\` per store — see .claude/references/plan-template.md.`);
    }
  }
```

Replace the comment at `:311` with `// Evolve->push gate (harness.json requireEvolveBeforePush — the shipped config sets true; an absent key is OFF, the hook needs === true):`.

In both `harness.json` files' `$comment`, change `requireEvolveBeforePush (default true) makes` to `requireEvolveBeforePush (shipped true; an absent key is off) makes`. In `template/AGENTS.md` and `README.md`, any "default on"/"default true" about the push gate → "on in the shipped config". In `docs/02-enforcement-vs-guidance.md`, in the guard's list of checks, add one bullet: `- Plan-lint: a \`Write\` of \`plans/*-plan.md\` with no non-empty \`Knowledge to load first:\` line is denied (M6; \`none — <reason>\` passes).`

- [ ] **Step 4: Run to verify they pass**

Run: `node template/.claude/hooks/smoke-test.mjs | tail -1`
Expected: `165 passed, 0 failed`.

- [ ] **Step 5: Prove it by effect on THIS repo's own plan, sync, commit**

Run: `echo '{"session_id":"x","hook_event_name":"PreToolUse","tool_name":"Write","cwd":"'$PWD'","tool_input":{"file_path":"plans/probe-plan.md","content":"# no field"}}' | node .claude/hooks/guard.mjs` → JSON with `"permissionDecision":"deny"`; the same with `content` containing `- Knowledge to load first: none — probe` → empty output, exit 0.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude .claude template/AGENTS.md README.md docs/02-enforcement-vs-guidance.md
git commit -m "feat(guard): deny a plan write without a Knowledge to load first line (M6); evolve-gate wording matches the code"
```

Validate: `grep -rn 'default true\|default on' template/.claude/hooks/guard.mjs template/AGENTS.md README.md .claude/harness.json template/.claude/harness.json | grep -i evolve` → nothing; `wc -l docs/02-enforcement-vs-guidance.md` → ≤130.
Acceptance criteria: the six fixtures pass; the by-effect probe denies and allows as stated; no file still says the push gate is "default true".

### Task 5: Citation anchors — `plan-anchors.mjs`, the plan-template format, `/implement` and `/plan-work` wiring

**Files:**
- Create: `template/.claude/tooling/plan-anchors.mjs`
- Create: `cli/plan-anchors.test.js`
- Modify: `package.json` `scripts.test` (append `&& node cli/plan-anchors.test.js`)
- Modify: `template/.claude/references/plan-template.md:23` (the `Read first:` line) and the Rules list (one bullet)
- Modify: `template/.claude/skills/implement/SKILL.md:23-24` (+2 lines, body 88 → 90)
- Modify: `template/.claude/skills/plan-work/SKILL.md` step 5/6 area (+1 line; the confidence rubric lands in Task 6)
- Modify: `template/.claude/agents/research-gatherer.md:41-42` (Sources line gains the label slot)
- Modify: `AGENTS.md` (root, line 46: add the pointer `rule: .claude/references/research-and-docs.md` in place; stays ≤60)

**Interfaces:**
- Produces: `node .claude/tooling/plan-anchors.mjs <plan.md> [--root <dir>]`. Parses every line containing `Read first:` or `Pattern to follow:` (and their continuation bullets — any line matching the anchor regex inside the `## Context` section); an anchor is `` `path[:N[-M]]` · "phrase" ``. Prints one line per anchor: `ok    <path>:<line> "<phrase>"` or `MISS  <path> "<phrase>"` (or `MISS  <path> — file not found`), then `anchors: <ok> ok, <miss> missing`. Exit 0 when all anchors resolve; exit 1 on any MISS; exit 1 with `no anchors found — Read first: entries need \`path\` · "phrase"` when a `Read first:` line exists but no anchor parses.

- [ ] **Step 1: Write the failing tests — `cli/plan-anchors.test.js`**

```js
#!/usr/bin/env node
'use strict';
// .claude/tooling/plan-anchors.mjs: a plan cites files by path + a grep-able phrase, never by a
// bare line number — coordinates rot, semantics hold (analysis 2026-09-05, 4.4: two plans cited
// the autonomous-mode reference by line range and both ranges had moved).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'template', '.claude', 'tooling', 'plan-anchors.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-anchors-'));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd: TMP, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
fs.mkdirSync(path.join(TMP, 'src'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'src', 'a.js'), 'const x = 1;\nfunction alpha() {}\nexport { alpha };\n');
const plan = (ctx) => { const p = path.join(TMP, 'p-plan.md'); fs.writeFileSync(p, '# P\n\n## Context\n' + ctx + '\n## Tasks\n- Read first: not parsed here\n'); return p; };

console.log('\nplan-anchors: coordinates rot, phrases hold\n');

test('every anchor found → ok lines with the live line number, exit 0', () => {
  const r = run([plan('- Read first: `src/a.js:2` · "function alpha()" — why\n- Pattern to follow: `src/a.js` · "export { alpha }" — what')]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('ok    src/a.js:2 "function alpha()"'), r.out);
  assert.ok(r.out.includes('ok    src/a.js:3 "export { alpha }"'), r.out);
  assert.ok(r.out.includes('anchors: 2 ok, 0 missing'), r.out);
});

test('a phrase that moved out of the file is a MISS, exit 1', () => {
  const r = run([plan('- Read first: `src/a.js:2` · "function beta()" — why')]);
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.includes('MISS  src/a.js "function beta()"'), r.out);
  assert.ok(r.out.includes('anchors: 0 ok, 1 missing'), r.out);
});

test('a missing file is a MISS that says so', () => {
  const r = run([plan('- Read first: `src/gone.js` · "anything" — why')]);
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.includes('MISS  src/gone.js — file not found'), r.out);
});

test('a Read first line with no parsable anchor is an error, not a silent pass', () => {
  const r = run([plan('- Read first: src/a.js:2 — the old bare-line form')]);
  assert.strictEqual(r.code, 1);
  assert.ok(/no anchors found/.test(r.out), r.out);
});

test('a plan with no Read first line at all passes with zero anchors', () => {
  const r = run([plan('- Library versions: none')]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('anchors: 0 ok, 0 missing'), r.out);
});

test('--root resolves paths against another directory', () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-anchors-root-'));
  fs.writeFileSync(path.join(other, 'b.md'), 'needle here\n');
  const r = run([plan('- Read first: `b.md` · "needle here" — why'), '--root', other]);
  assert.strictEqual(r.code, 0, r.out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node cli/plan-anchors.test.js 2>&1 | tail -1`
Expected: `0 passed, 6 failed` (the script does not exist: every `run` returns a non-zero code).

- [ ] **Step 3: Implement — `template/.claude/tooling/plan-anchors.mjs`**

```js
#!/usr/bin/env node
// plan-anchors: a plan cites files as `path[:line]` · "phrase" — the phrase is what the reader
// greps, the line number is a hint that rots. /implement runs this before Task 1; /plan-work runs
// it before scoring confidence. Traces to: 2026-09-05 — two plans cited a reference by line
// range and both ranges had moved (analysis 4.4).
//   node .claude/tooling/plan-anchors.mjs <plan.md> [--root <dir>]
// Exit 0: every anchor resolves. Exit 1: a MISS, or a Read first: line with no parsable anchor.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = resolve(rootIdx !== -1 ? argv[rootIdx + 1] : process.cwd());
const planPath = argv.find((a, i) => !a.startsWith("--") && (rootIdx === -1 || i !== rootIdx + 1));
if (!planPath) { console.error("usage: plan-anchors.mjs <plan.md> [--root <dir>]"); process.exit(64); }

const text = readFileSync(resolve(planPath), "utf8").replace(/\r\n/g, "\n");
// Only the Context section carries anchors; task bodies quote code freely.
const ctxStart = text.indexOf("\n## Context");
const ctxEnd = ctxStart === -1 ? -1 : text.indexOf("\n## ", ctxStart + 1);
const context = ctxStart === -1 ? "" : text.slice(ctxStart, ctxEnd === -1 ? undefined : ctxEnd);
const ANCHOR = /`([^`\s]+?)(?::\d+(?:-\d+)?)?`\s*·\s*"([^"]+)"/g;

let ok = 0, miss = 0;
for (const m of context.matchAll(ANCHOR)) {
  const [, file, phrase] = m;
  const abs = resolve(root, file);
  if (!existsSync(abs)) { console.log(`MISS  ${file} — file not found`); miss++; continue; }
  const body = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  const at = body.indexOf(phrase);
  if (at === -1) { console.log(`MISS  ${file} "${phrase}"`); miss++; continue; }
  const line = body.slice(0, at).split("\n").length;
  console.log(`ok    ${file}:${line} "${phrase}"`); ok++;
}
const hasReadFirst = /^\s*-?\s*(Read first|Pattern to follow):/m.test(context);
if (hasReadFirst && ok + miss === 0) {
  console.log('no anchors found — Read first: entries need `path` · "phrase" (see .claude/references/plan-template.md)');
  process.exit(1);
}
console.log(`anchors: ${ok} ok, ${miss} missing`);
process.exit(miss ? 1 : 0);
```

- [ ] **Step 4: Run to verify they pass**

Run: `node cli/plan-anchors.test.js 2>&1 | tail -1`
Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Wire the prose (in place, budget-checked)**

`plan-template.md:23` becomes:

```markdown
- Read first: `<path>[:line]` · "<phrase that exists verbatim in that file>" — <why>   # the phrase is the anchor; the line is a hint. Same form for Pattern to follow. Checked by .claude/tooling/plan-anchors.mjs
```

Append to the Rules list:

```markdown
- Every `Read first:` / `Pattern to follow:` entry anchors by `path` · "phrase"; `/plan-work` runs `node .claude/tooling/plan-anchors.mjs plans/<slug>-plan.md` before scoring confidence and `/implement` runs it before Task 1 — a MISS is a logged deviation, never a skipped read. (traces to: 2026-09-05 — two plans cited the autonomous-mode reference by line range; both ranges had moved)
```

`implement/SKILL.md` after line 24 (the "Knowledge to load first" sentence), add:

```markdown
Then `node .claude/tooling/plan-anchors.mjs <plan>`: every `MISS` is anchor rot — locate the passage by its phrase, read it anyway, and log `anchor rot: <path> "<phrase>"` under the report's Deviations row. A plan with no parsable anchors (exit 1, "no anchors found") is read by path and reported the same way.
```

`plan-work/SKILL.md`, in step 6 ("Write to disk") after the Write sentence, add one line: `Then run \`node .claude/tooling/plan-anchors.mjs plans/<slug>-plan.md\` — fix every MISS before step 7; its exit code feeds the confidence rubric.`

`research-gatherer.md:42` → `<url — one line each on what it backs; exact, with version; \`raw:\` or \`summary:\` per claim, as above>`.

Root `AGENTS.md:46`, at the end of the sentence that gives the URL form, add ` (rule: \`.claude/references/research-and-docs.md\`)`.

- [ ] **Step 6: Run the checker on THIS plan, add the test to the suite, sync, commit**

Run: `node template/.claude/tooling/plan-anchors.mjs plans/harness-improvements-m2-plan.md` → exit 1 with exactly five `MISS` lines, all phrases Tasks 1–5 themselves rewrote — `stop-gate.mjs "const gate = Array.isArray(cfg.stopGate)"` (Task 1 added a paren), `stop-gate.mjs "make the checks faster"` (Task 1), `session-start.mjs "if (process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE)"` (Task 2), `guard.mjs "default true; false opts out"` (Task 4), `plan-template.md "- Read first: <file:line> — <why>"` (this task) — and every other anchor `ok` (≥30). The plan is not edited to hide the misses: they are the mechanism reporting exactly the passages this milestone changed, and the report's Deviations row lists them.

In `package.json` `scripts.test` append `&& node cli/plan-anchors.test.js`.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
node tools/context-ledger.mjs template | tail -1
git add template/.claude .claude cli/plan-anchors.test.js package.json AGENTS.md
git commit -m "feat(anchors): plans cite path + phrase; plan-anchors.mjs checks them at /plan-work and /implement"
```

Validate: `node tools/context-ledger.mjs template` → no `!! WARN` for implement or plan-work bodies (90/100 and 86/100); `wc -l template/.claude/references/plan-template.md` → 59; `wc -l AGENTS.md` → 56.
Acceptance criteria: the six tests pass; this plan's anchors resolve; the plan template and both skills name the tool.

### Task 6: Plan-confidence rubric; verify by effect; decisions taken unasked

Tier hint: `build` (prose only, three files, every line given here).

**Files:**
- Modify: `template/.claude/skills/plan-work/SKILL.md:74-79` (step 7; +1 line → 87/100 after Task 5's +1)
- Modify: `template/.claude/rules/00-core.md:35` (extend in place) and a new line after `:36` (→ 45/45)
- Modify: `template/.claude/skills/implement/SKILL.md:65` (Evidence sentence, in place) and the report table (+1 row → 91/100)

- [ ] **Step 1: The rubric**

In `plan-work/SKILL.md`, after line 74 (the "Fill plan frontmatter" sentence), insert:

```markdown
`confidence` is capped at 6 unless ALL three hold — every `Read first:` file was read THIS session and `plan-anchors.mjs` exits 0; every external tool the plan builds against is cached at `wiki/stack/<tool>/` or was `/research`ed this session; open questions are zero. A self-score above 6 without the three is a planning failure, not optimism. (traces to: 2026-09-05 — agents skew positive grading their own work; a felt 7 never asks)
```

- [ ] **Step 2: The two core lines**

Replace `00-core.md:35` with:

```markdown
- Never claim done/fixed/passing without the command and its real output — output from the CONSUMER of the change (the hook fed its stdin JSON, the CLI, the test that reads the config), never a read-back of the file that declares it. Applies to subagent reports too — re-run, don't relay. (traces to: 2026-09-05 — a config read back as evidence for an autonomous-mode fix)
```

After line 36 (the "Concise by default" bullet) add:

```markdown
- Work that lands ends with the decisions taken without asking — each with what it costs if wrong — or says there were none. (traces to: 2026-09-05 — a version bump and a branch commit chosen unasked, mentioned in passing at the end)
```

- [ ] **Step 3: The Evidence sentence and the report row**

`implement/SKILL.md:65`: replace `Evidence means command output on record — never "looks done".` with `Evidence means command output on record from the consumer of the change (hook, CLI, test) — never a read-back of the declaring file, never "looks done".` (in place, line-neutral). In the report table (the row `| Deviations | Every departure from the plan, with why |`), add the row below it: `| Decisions taken unasked | Numbered, each with its cost if wrong — or "none" |`.

- [ ] **Step 4: Measure, sync, commit**

Run: `wc -l template/.claude/rules/00-core.md` → 45; `node tools/context-ledger.mjs template | grep -E '00-core|Status'` → the rule row shows 45 lines, no `!soft`; status stays WARN under 2000.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude .claude
git commit -m "feat(rules): confidence rubric is mechanical; evidence comes from the consumer; decisions taken unasked are listed"
```

Validate: `grep -c 'traces to' template/.claude/rules/00-core.md` → one more than before the task; `node .claude/hooks/smoke-test.mjs | tail -1` → `165 passed, 0 failed`.
Acceptance criteria: the three files carry the exact lines above; every budget holds.

### Task 7: `/evolve` reads the platform's measurements and the auto-memory delta

**Files:**
- Create: `template/.claude/tooling/memory-delta.mjs`
- Create: `cli/memory-delta.test.js`; `package.json` `scripts.test` (append)
- Modify: `template/.claude/skills/evolve/SKILL.md` — step 1 list (`:13-20`, +1 bullet), `:61` (in place), `:91` (in place) → 95/100

**Interfaces:**
- Produces: `node .claude/tooling/memory-delta.mjs snapshot|diff [--root <dir>]`. The auto-memory file is `PHE_MEMORY_FILE` if set (tests), else `<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<encoded>/memory/MEMORY.md` where `<encoded>` is the git top-level path (or `--root`) with every `/` or `\` replaced by `-` — an OBSERVED encoding (`memory.md` documents only "derived from the git repository"), which is why a missing file is a message, never an error. `snapshot` copies it to `<root>/.claude/state/evolve-memory.md`; `diff` prints each line present in the live file but not in the snapshot as `+ <line>`, or `no new MEMORY.md lines since the last /evolve`, or `no snapshot yet — run memory-delta.mjs snapshot at the end of this /evolve`, or `no auto-memory file at <path> — nothing to diff`. Exit 0 in every case; exit 64 on a bad subcommand.

- [ ] **Step 1: Write the failing tests — `cli/memory-delta.test.js`**

```js
#!/usr/bin/env node
'use strict';
// .claude/tooling/memory-delta.mjs: auto-memory `feedback` entries are corrections the team never
// got. /evolve diffs MEMORY.md against the copy taken at its last run (analysis 2026-09-05, 4.2).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'template', '.claude', 'tooling', 'memory-delta.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-delta-'));
const MEM = path.join(TMP, 'MEMORY.md');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args, env) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd: TMP, encoding: 'utf-8', env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

console.log('\nmemory-delta: corrections saved to memory reach /evolve\n');

test('no auto-memory file → says so, exit 0', () => {
  const r = run(['diff'], { PHE_MEMORY_FILE: path.join(TMP, 'absent.md') });
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/no auto-memory file at .*absent\.md/.test(r.out), r.out);
});

test('diff before any snapshot → asks for one, exit 0', () => {
  fs.writeFileSync(MEM, '- [A](a.md) — first\n');
  const r = run(['diff'], { PHE_MEMORY_FILE: MEM });
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/no snapshot yet/.test(r.out), r.out);
});

test('snapshot then a new line → the diff prints exactly that line', () => {
  assert.strictEqual(run(['snapshot'], { PHE_MEMORY_FILE: MEM }).code, 0);
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'state', 'evolve-memory.md')));
  fs.appendFileSync(MEM, '- [B](b.md) — a correction\n');
  const r = run(['diff'], { PHE_MEMORY_FILE: MEM });
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('+ - [B](b.md) — a correction'), r.out);
  assert.ok(!r.out.includes('+ - [A]'), 'unchanged lines are not printed');
});

test('nothing new → says so', () => {
  run(['snapshot'], { PHE_MEMORY_FILE: MEM });
  const r = run(['diff'], { PHE_MEMORY_FILE: MEM });
  assert.ok(/no new MEMORY\.md lines/.test(r.out), r.out);
});

test('the default path is derived from the root with slashes turned into dashes', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const encoded = TMP.replace(/[\\/]/g, '-');
  const dir = path.join(cfg, 'projects', encoded, 'memory'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), '- [C](c.md) — via config dir\n');
  const r = run(['snapshot', '--root', TMP], { CLAUDE_CONFIG_DIR: cfg, PHE_MEMORY_FILE: '' });
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(fs.readFileSync(path.join(TMP, '.claude', 'state', 'evolve-memory.md'), 'utf-8'), '- [C](c.md) — via config dir\n');
});

test('an unknown subcommand is a usage error, exit 64', () => {
  assert.strictEqual(run(['bogus'], { PHE_MEMORY_FILE: MEM }).code, 64);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node cli/memory-delta.test.js 2>&1 | tail -1`
Expected: `0 passed, 6 failed`.

- [ ] **Step 3: Implement — `template/.claude/tooling/memory-delta.mjs`**

```js
#!/usr/bin/env node
// memory-delta: auto-memory `feedback` entries are corrections the team never got. /evolve diffs
// MEMORY.md against the copy taken at its previous run, promotes what generalizes, and deletes
// it from memory (00-core.md "Memory"). Traces to: 2026-09-05 — /evolve listed "user corrections"
// as a source and never read the file that records them (analysis 4.2).
//   node .claude/tooling/memory-delta.mjs snapshot|diff [--root <dir>]
// Memory file: $PHE_MEMORY_FILE, else <$CLAUDE_CONFIG_DIR or ~/.claude>/projects/<encoded>/memory/
// MEMORY.md, <encoded> = the git top-level path with / and \ turned into - . memory.md (raw,
// 2026-09-05) documents only "derived from the git repository": the encoding is OBSERVED, so a
// missing file is reported, never thrown.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const sub = argv[0];
const rootIdx = argv.indexOf("--root");
let root = resolve(rootIdx !== -1 ? argv[rootIdx + 1] : process.cwd());
if (rootIdx === -1) { try { root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim() || root; } catch { /* not a git repo: cwd is the root */ } }
if (sub !== "snapshot" && sub !== "diff") { console.error("usage: memory-delta.mjs snapshot|diff [--root <dir>]"); process.exit(64); }

const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const memory = process.env.PHE_MEMORY_FILE || join(configDir, "projects", root.replace(/[\\/]/g, "-"), "memory", "MEMORY.md");
const snapshot = join(root, ".claude", "state", "evolve-memory.md");

if (!existsSync(memory)) { console.log(`no auto-memory file at ${memory} — nothing to diff`); process.exit(0); }
if (sub === "snapshot") {
  mkdirSync(join(root, ".claude", "state"), { recursive: true });
  copyFileSync(memory, snapshot);
  console.log(`snapshot: ${snapshot}`);
  process.exit(0);
}
if (!existsSync(snapshot)) { console.log("no snapshot yet — run memory-delta.mjs snapshot at the end of this /evolve"); process.exit(0); }
const lines = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
const before = new Set(lines(snapshot));
const added = lines(memory).filter((l) => !before.has(l));
if (!added.length) { console.log("no new MEMORY.md lines since the last /evolve"); process.exit(0); }
for (const l of added) console.log(`+ ${l}`);
process.exit(0);
```

- [ ] **Step 4: Run to verify they pass**

Run: `node cli/memory-delta.test.js 2>&1 | tail -1`
Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Wire `/evolve` (in place)**

Step 1's candidate list gains one bullet: `- New MEMORY.md lines since the last run — \`node .claude/tooling/memory-delta.mjs diff\`: a \`feedback\` entry saved to machine-local memory is a rule the team never got (promote it here, delete it from memory in step 6).`

Line 61 becomes: `Measure, don't estimate: run \`node <PHE>/tools/context-ledger.mjs\` (or the project's copy) and include the delta; ask the operator for \`/skill-doctor\` (unused skills and their cost; headless: \`claude -p "/skill-doctor"\`, needs ≥2.1.252), \`/doctor\` (proposes CLAUDE.md trims) and \`/context\` (what actually loaded) — interactive commands this skill cannot run; absent → write \`not measured\` for that input, never a guess.`

Line 91: append before the final period: `, then \`node .claude/tooling/memory-delta.mjs snapshot\` so the next run diffs against this one`.

- [ ] **Step 6: Add to the suite, sync, commit**

`package.json` `scripts.test` append `&& node cli/memory-delta.test.js`.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
node tools/context-ledger.mjs template | grep -E 'evolve|Status'
git add template/.claude .claude cli/memory-delta.test.js package.json
git commit -m "feat(evolve): read /skill-doctor, /doctor, /context and the auto-memory delta; memory-delta.mjs snapshots at the marker"
```

Validate: `node .claude/tooling/memory-delta.mjs diff` in this repo → `no snapshot yet — …` (the real memory dir exists here, so the path resolves); `wc -l template/.claude/skills/evolve/SKILL.md` → 100 (95 body + 5 frontmatter).
Acceptance criteria: the six tests pass; `/evolve` names the three commands and the delta tool; the marker bullet snapshots.

### Task 8: M3 — the tracking-root resolution is stated once

Tier hint: `build`.

**Files:**
- Modify: `template/.claude/skills/accept/SKILL.md:14`, `implement/SKILL.md:25` and `:80`, `validate/SKILL.md:89`, `review-branch/SKILL.md:28` — each in place, line-neutral

- [ ] **Step 1: Confirm the count with the enumeration grep**

Run: `grep -rn 'git worktree list --porcelain' template/.claude/skills/ | wc -l` → 5; `grep -n 'git worktree list --porcelain' template/.claude/references/work-tracking.md` → the canonical definition under "## The tracking root" (line 23-25).

- [ ] **Step 2: Replace each restatement with a cite**

In each of the five lines, replace the parenthetical mechanic `resolve: first \`worktree \` line of \`git worktree list --porcelain\`` with `resolve per \`.claude/references/work-tracking.md\` "The tracking root"`, keeping everything else in the parenthesis (the `commit there as \`track(<id>): …\`` clause, the `backlog/ never lives in the worktree` clause). `accept/SKILL.md:14` has the form `resolving it against the TRACKING ROOT (first \`worktree \` line of \`git worktree list --porcelain\` — …)` → `resolving it against the TRACKING ROOT (\`.claude/references/work-tracking.md\` "The tracking root" — …)`.

- [ ] **Step 3: Validate with the enumeration grep, sync, commit**

Run: `grep -rn 'git worktree list --porcelain' template/.claude/skills/` → nothing; `grep -rn 'work-tracking.md" "The tracking root"\|work-tracking.md\` "The tracking root"' template/.claude/skills/ | wc -l` → 5; `for s in accept implement validate review-branch; do wc -l template/.claude/skills/$s/SKILL.md; done` → unchanged from before the task.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude/skills .claude/skills
git commit -m "refactor(skills): tracking-root resolution lives in work-tracking.md only (review M3)"
```

Acceptance criteria: zero restatements in skills; the reference still holds the definition; body line counts unchanged.

### Task 9: Ledger — skill bodies in tokens, docs measured, three docs trimmed, ledger in the root gate

**Files:**
- Modify: `tools/context-ledger.mjs` (args `:13-19`, skills loop `:74-98`, summary `:100-121`)
- Create: `cli/context-ledger.test.js`; `package.json` `scripts.test` (append)
- Modify: `docs/99-sources.md` (145 → ≤130), `docs/01-context-engineering.md` (140 → ≤130), `docs/03-loops.md` (136 → ≤130)
- Modify: `AGENTS.md` (root, line 47 — "docs ≤130 as a review guideline" → measured), `template/.claude/references/harness-maintenance.md` section 4 table (+1 row: skill body tokens; 108 → 109 after Task 10, fine)
- Modify: `.claude/harness.json` (root, not synced) — `stopGate` gains `"node tools/context-ledger.mjs template --docs docs"`

**Interfaces:**
- Produces: `node tools/context-ledger.mjs [dir] [--budget N] [--docs <dir>]`. New second table `Skill bodies — loaded on invocation; re-attached after compaction at ≤5,000 tokens each` with `lines` and `est.tok` per skill (every skill, invocation-disabled included); soft warn above 4000 est. tokens, hard violation above 5000 (the platform's per-skill re-attach cap, `skills.md` read raw 2026-09-05). `--docs <dir>`: every `*.md` directly in that dir is listed with its line count; above 130 is a hard violation (exit 1). Neither table adds to the always-loaded TOTAL.

- [ ] **Step 1: Write the failing tests — `cli/context-ledger.test.js`**

```js
#!/usr/bin/env node
'use strict';
// tools/context-ledger.mjs: the always-loaded tax, plus (2026-09-05, analysis 3.1/6.4) skill
// bodies measured in tokens — a 100-line skill can be 4k tokens and is cut at 5k after
// compaction — and docs/ measured at all, so the 130-line rule stops being decorative.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'tools', 'context-ledger.mjs');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
function project(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'big'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'quiet'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# A\nline two\nline three\n');
  fs.writeFileSync(path.join(dir, '.claude', 'rules', 'always.md'), '# always\n- rule\n');
  fs.writeFileSync(path.join(dir, '.claude', 'rules', 'scoped.md'), '---\npaths:\n  - "src/**"\n---\n# scoped\n');
  // 200 words per line: the token thresholds must trip WITHOUT the 100/120 line caps tripping first.
  const bigBody = Array.from({ length: Math.max(1, Math.round(opts.bigWords / 200)) }, () => Array.from({ length: 200 }, (_, i) => 'w' + i).join(' ')).join('\n');
  fs.writeFileSync(path.join(dir, '.claude', 'skills', 'big', 'SKILL.md'), '---\nname: big\ndescription: "d"\ndisable-model-invocation: true\n---\n' + bigBody + '\n');
  fs.writeFileSync(path.join(dir, '.claude', 'skills', 'quiet', 'SKILL.md'), '---\nname: quiet\ndescription: "always listed"\n---\nshort body\n');
  if (opts.docs) {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    for (const [name, n] of Object.entries(opts.docs)) fs.writeFileSync(path.join(dir, 'docs', name), Array.from({ length: n }, (_, i) => 'l' + i).join('\n') + '\n');
  }
  return dir;
}

console.log('\ncontext-ledger: measured, not estimated\n');

test('unscoped rules count, paths-scoped rules do not, disabled skills cost nothing always-loaded', () => {
  const r = run([project({ bigWords: 100 })]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('.claude/rules/always.md'), r.out);
  assert.ok(!/^\.claude\/rules\/scoped\.md/m.test(r.out), 'scoped rule must not be a row');
  assert.ok(r.out.includes('.claude/skills/quiet/SKILL.md (frontmatter)'), r.out);
  assert.ok(!r.out.includes('.claude/skills/big/SKILL.md (frontmatter)'), 'disabled skill must not be an always-loaded row');
});

test('skill bodies get their own table in tokens, disabled skills included, not added to TOTAL', () => {
  const r = run([project({ bigWords: 100 })]);
  assert.ok(/Skill bodies/.test(r.out), r.out);
  assert.ok(/^\.claude\/skills\/big\/SKILL\.md\s+\d+\s+\d+/m.test(r.out), 'big body row with lines and tokens');
  const total = Number((r.out.match(/^TOTAL\s+(\d+)/m) || [])[1]);
  assert.ok(total > 0 && total < 100, 'TOTAL stays the always-loaded tax only, got ' + total);
});

test('a skill body over 5000 est. tokens is a hard violation, exit 1', () => {
  const r = run([project({ bigWords: 4000 })]); // 4000 words × 1.33 ≈ 5320 tokens
  assert.strictEqual(r.code, 1, r.out);
  assert.ok(/HARD .*skills\/big.*tokens/.test(r.out), r.out);
});

test('a skill body between 4000 and 5000 est. tokens is a soft warn, exit 0', () => {
  const r = run([project({ bigWords: 3200 })]); // ≈ 4256 tokens
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/WARN .*skills\/big.*tokens/.test(r.out), r.out);
});

test('--docs lists every doc with its line count; 130 passes, 131 is a hard violation', () => {
  const ok = run([project({ bigWords: 100, docs: { 'a.md': 130 } }), '--docs', 'docs']);
  assert.strictEqual(ok.code, 0, ok.out);
  assert.ok(/^docs\/a\.md\s+130/m.test(ok.out), ok.out);
  const over = run([project({ bigWords: 100, docs: { 'a.md': 130, 'b.md': 131 } }), '--docs', 'docs']);
  assert.strictEqual(over.code, 1, over.out);
  assert.ok(/HARD docs\/b\.md: 131 lines > 130/.test(over.out), over.out);
});

test('--docs on a missing directory is a hard violation, never a silent pass', () => {
  const r = run([project({ bigWords: 100 }), '--docs', 'nope']);
  assert.strictEqual(r.code, 1, r.out);
  assert.ok(/HARD .*nope/.test(r.out), r.out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node cli/context-ledger.test.js 2>&1 | grep -E 'FAIL|passed'`
Expected: the first test PASSes (existing behaviour), the other five FAIL; `1 passed, 5 failed`.

- [ ] **Step 3: Implement**

In `tools/context-ledger.mjs`:

Args (`:13-19`) — add a `docsDir` option:

```js
let budget = 2000, dir = process.cwd(), docsDir = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--budget") budget = Number(args[++i]) || 2000;
  else if (args[i].startsWith("--budget=")) budget = Number(args[i].slice(9)) || 2000;
  else if (args[i] === "--docs") docsDir = args[++i] || "docs";
  else dir = resolve(args[i]);
}
```

Update the usage comment at `:3` to `//   node tools/context-ledger.mjs [projectDir] [--budget N] [--docs <dir>]   (default budget: 2000 est. tokens)` and add a line after `:8`: `// --docs <dir>: every *.md in <dir> is listed with its line count; >130 is a hard violation.`

Add before the skills loop (`:74`): `const SKILL_TOKENS = [4000, 5000]; // soft / hard: the platform re-attaches ≤5,000 tokens per skill after compaction (skills.md, raw, 2026-09-05)` and `const skillRows = [];`.

Inside the skills loop, right after `const bodyLines = …` (`:85`) add:

```js
    const bodyTokens = est(text.slice(bodyStart));
    skillRows.push({ file: `.claude/skills/${d.name}/SKILL.md`, lines: bodyLines, tokens: bodyTokens });
    if (bodyTokens > SKILL_TOKENS[1]) hardViolations.push(`.claude/skills/${d.name}/SKILL.md: body ${bodyTokens} est. tokens > hard cap ${SKILL_TOKENS[1]} — cut after compaction; relocate detail to references/`);
    else if (bodyTokens > SKILL_TOKENS[0]) warns.push(`.claude/skills/${d.name}/SKILL.md: body ${bodyTokens} est. tokens > soft cap ${SKILL_TOKENS[0]}.`);
```

After the TOTAL line (`:108`) add the two tables:

```js
if (skillRows.length) {
  const sw = Math.max(5, ...skillRows.map((r) => r.file.length));
  console.log(`\nSkill bodies — loaded on invocation; re-attached after compaction at ≤${SKILL_TOKENS[1].toLocaleString("en-US")} tokens each (not in TOTAL)\n`);
  console.log(`${"file".padEnd(sw)}  ${"lines".padStart(5)}  ${"est.tok".padStart(7)}`);
  for (const r of skillRows) console.log(`${r.file.padEnd(sw)}  ${String(r.lines).padStart(5)}  ${String(r.tokens).padStart(7)}`);
}
if (docsDir) {
  const DOC_LINES = 130; // AGENTS.md "docs ≤130" — measured here so the rule stops being decorative
  const abs = resolve(dir, docsDir);
  if (!existsSync(abs)) hardViolations.push(`${docsDir}/: directory not found — a docs budget nobody can measure is not a budget`);
  else {
    const docs = readdirSync(abs).filter((n) => n.endsWith(".md")).sort();
    const dw = Math.max(5, ...docs.map((n) => `${docsDir}/${n}`.length));
    console.log(`\nDocs — ≤${DOC_LINES} lines each (not in TOTAL)\n`);
    for (const n of docs) {
      const lines = (read(join(abs, n)) ?? "").replace(/\n+$/, "").split("\n").length;
      console.log(`${`${docsDir}/${n}`.padEnd(dw)}  ${String(lines).padStart(5)}`);
      if (lines > DOC_LINES) hardViolations.push(`${docsDir}/${n}: ${lines} lines > ${DOC_LINES}`);
    }
  }
}
```

(`readdirSync` and `existsSync` are already imported; `read` is the CRLF-normalising reader at `:23`.)

- [ ] **Step 4: Run to verify they pass**

Run: `node cli/context-ledger.test.js 2>&1 | tail -1`
Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Measure the real template and docs**

Run: `node tools/context-ledger.mjs template --docs docs`
Expected: the skill-bodies table (16 rows) with no `HARD`; docs table with `!! HARD docs/01-context-engineering.md: 140 lines > 130`, `docs/03-loops.md: 136`, `docs/99-sources.md: 145`; exit 1. Record the three largest skill bodies' token counts in the report.

- [ ] **Step 6: Trim the three docs to ≤130 — preserve, don't rewrite**

Rule: a line may be cut only if its claim survives in a named file; each cut records `<claim> → <surviving file>` in the commit body. Never cut a `Sources` entry, a `traces to`, or a dated verification line. Candidates, by the heading map measured 2026-09-05:
- `docs/99-sources.md` (145): the `Model policy` section (lines 114-133, 19 lines) restates what `docs/04-model-policy.md` and `dispatch-protocol.md` now own since M1 Task 9 — keep the source citations, drop the restated doctrine; keep `Claims unverified` (133-145) intact.
- `docs/01-context-engineering.md` (140): `Right altitude` (81-102) overlaps `harness-maintenance.md` section 4-5 and `docs/00`; fold to the sentences that are unique here. Its `Sources` (134-140) stays.
- `docs/03-loops.md` (136): `Review lenses stack` (82-100) — the lens list also lives in `review-branch/SKILL.md`; keep the doctrine sentence, drop the enumerated duplicate.

Run: `node tools/context-ledger.mjs template --docs docs | grep -E 'docs/|Status'` → every doc ≤130, exit 0.

- [ ] **Step 7: Arm the root gate, state the rule, add the test, commit**

In root `.claude/harness.json` (root-owned; the sync never touches it) add `"node tools/context-ledger.mjs template --docs docs"` to `stopGate` (it runs in <1 s). In root `AGENTS.md:47` change `docs ≤130 as a review guideline` to `docs ≤130 (`--docs docs`, a root stop-gate command)` and the Commands table's ledger row to `node tools/context-ledger.mjs template --docs docs`. In `harness-maintenance.md` section 4 table add the row `| Skill body (tokens) | ≤4000 est. soft, 5000 hard — the per-skill re-attach cap after compaction |`.

`package.json` `scripts.test` append `&& node cli/context-ledger.test.js`.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
npm test > /dev/null 2>&1; echo "npm test exit=$?"
git add tools/context-ledger.mjs cli/context-ledger.test.js package.json docs AGENTS.md .claude/harness.json template/.claude/references/harness-maintenance.md .claude/references/harness-maintenance.md
git commit -m "feat(ledger): skill bodies measured in tokens, docs measured and gated; docs 01/03/99 trimmed to 130"
```

Validate: `node tools/context-ledger.mjs template --docs docs; echo exit=$?` → `exit=0`; `wc -l docs/*.md | sort -n | tail -4` → no file above 130; `wc -l template/.claude/references/harness-maintenance.md` → 108.
Acceptance criteria: six ledger tests pass; the root stop gate contains the ledger; the three docs are at or under 130 with every cut accounted for in the commit body.

### Task 10: Migrations belong in CLI code, never in skill prose

Tier hint: `build`.

**Files:**
- Modify: `template/.claude/references/harness-maintenance.md` section 3 table (+1 row → 109/120)
- Modify: `template/.claude/skills/harness-init/SKILL.md:61` (in place — the `autonomous` deletion line) and `:83` (in place — the placeholder allowlist gains `page`); body stays 100/100
- Modify: `docs/02-enforcement-vs-guidance.md` (+1 line; stays ≤130)

- [ ] **Step 1: The rule row**

In `harness-maintenance.md` section 3 (`## 3. Change protocol` table), add the row:

```markdown
| A retired or renamed key, skill, or path | The migration is CLI code — `cli/migrations.js` (`RENAMED_SKILLS`), `cli/harness-config.js` (`RETIRED_KEYS`) — pinned by a test and applied on `init`/`update`. A skill may CALL a subcommand or catch a hand-copied survivor; it never carries the logic, because prose cannot be verified headlessly (traces to: 2026-09-05 — a `/harness-init` migration line could not be checked by effect; the real one went into the CLI) |
```

- [ ] **Step 2: The two in-place skill edits**

`harness-init/SKILL.md:61`: append to the sentence ` — a fallback only: \`cli/harness-config.js\` RETIRED_KEYS is the mechanism and strips the key on \`init\`/\`update\`` (same line, no new line). `harness-init/SKILL.md:83`: change the allowlist `'<(a|n|id|div|slug|tool|button|dialog)>$'` to `'<(a|n|id|div|slug|tool|button|dialog|page)>$'` (the `<page>` token in the docs-URL form is a placeholder for the reader, not for the adopter).

`docs/02-enforcement-vs-guidance.md`: under the guidance/enforcement split, add one bullet: `- Migrations (retired keys, renamed skills) are enforcement, so they live in \`cli/\` with a test — never in a skill body, which no headless check can verify (ADR-021, one step wider).`

- [ ] **Step 3: Validate, sync, commit**

Run: `wc -l template/.claude/references/harness-maintenance.md` → 109; `node tools/context-ledger.mjs template | grep -E 'harness-init|Status'` → no `!soft` for harness-init (body 100); `wc -l docs/02-enforcement-vs-guidance.md` → ≤130.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude .claude docs/02-enforcement-vs-guidance.md
git commit -m "docs(harness): migrations are CLI code with a test, never skill prose; /harness-init names the mechanism"
```

Acceptance criteria: the row exists with its trace; the skill line names the CLI mechanism; `page` is allowlisted; budgets hold.

### Task 11: Model-role residuals — a blank Codex role throws, the wording reconciles

**Files:**
- Modify: `cli/emit-codex.js:108` (`!codexHalf[tier]` → `!(tier in codexHalf)`)
- Modify: `cli/emit-codex.test.js` (new asserts after the `noCodexErr` assert, ~`:125`)
- Modify: `template/.claude/skills/models/SKILL.md:34` (in place), `docs/04-model-policy.md:46-47` (in place)

- [ ] **Step 1: Write the failing assert**

After the `a map with no codex half at all still throws` assert, add:

```js
// A role PRESENT but blank is a malformed map, not a pre-release map: it must throw, not take
// the package default behind a warning that says the role is missing (M1 final review).
var BLANK_ROLE = JSON.parse(JSON.stringify(DEFAULT_MODELS));
BLANK_ROLE.codex.routine = '';
var blankErr = null, blankWarnings = [];
try { agentMdToToml(routineMd, 'r', BLANK_ROLE, function (m) { blankWarnings.push(m); }); } catch (e) { blankErr = e; }
assert('a role present but blank throws (no model mapped) instead of defaulting',
  blankErr instanceof Error && /no model mapped/i.test(blankErr.message));
assert('...and emits no "has no role" warning for a role the map does have',
  blankWarnings.length === 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node cli/emit-codex.test.js | grep -E 'FAIL|passed'`
Expected: both new asserts FAIL; `161 passed, 2 failed`.

- [ ] **Step 3: Implement**

`cli/emit-codex.js:108`: change `!codexHalf[tier]` to `!(tier in codexHalf)` and extend the comment above the block: `// \`in\`, not falsiness: a role that is present but blank is malformed and must reach resolveModel's throw, not the pre-release fallback.`

`models/SKILL.md:34`: replace `Never builds.` with `Never a build task: a \`routine\` implementer takes text-only or trivially easy one-file edits only.` `docs/04-model-policy.md:46-47`: replace `so the map has nothing to name for it.` with `so the map names it through the \`deep\` row and never carries a \`review\` row.`

- [ ] **Step 4: Verify, sync, commit**

Run: `node cli/emit-codex.test.js | tail -1` → `163 passed, 0 failed`; `grep -rn 'never builds\|Never builds' template docs` → nothing.

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add cli/emit-codex.js cli/emit-codex.test.js template/.claude/skills/models .claude/skills/models docs/04-model-policy.md
git commit -m "fix(emit): a blank Codex role throws instead of defaulting; routine wording reconciled"
```

Acceptance criteria: the two asserts pass; the three tier descriptions agree that `routine` takes text-only or trivially easy one-file edits and never a build.

### Task 12: Root-harness residuals — retired-dir sweep, tarball, the two adapted skills, the absent-local-KB line

**Files:**
- Modify: `tools/self-harness.mjs:57-80` (`extras()` also sweeps root-only top-level dirs); `cli/self-harness.test.js` (new test)
- Modify: `package.json` `files` (drop `tools/self-harness.mjs`); `cli/cli-hardening.test.js` after `:304` (assert it is NOT packed)
- Modify: `template/.claude/hooks/session-start.mjs:84-85` (absent local dir); `template/.claude/hooks/smoke-test.mjs` (fixture near the `Knowledge (local)` fixture — find with `grep -n 'Knowledge (local)' template/.claude/hooks/smoke-test.mjs`)
- Rewrite (root-owned, ADAPTED — never synced): `.claude/skills/architecture-map/SKILL.md`, `.claude/skills/debugging-this-repo/SKILL.md` (≤70-line bodies each)

- [ ] **Step 1: Failing test for the sweep — in `cli/self-harness.test.js`, after the last `test(...)`**

```js
test('a top-level dir the template no longer ships is swept from the root (retired-dir gap)', () => {
  // Own root + template, built the way the file's shared `tpl`/`root`/`args` are built above.
  const root2 = path.join(TMP, 'root-retired');
  fs.mkdirSync(path.join(root2, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root2, '.claude', 'harness.json'), JSON.stringify({ stopGate: [], harness: ['claude'] }) + '\n');
  const tpl2 = path.join(TMP, 'template-retired', '.claude'); makeTemplate(tpl2);
  const args2 = ['--root', root2, '--template', tpl2];
  assert.strictEqual(run(args2, root2).code, 0, 'first sync');
  fs.mkdirSync(path.join(root2, '.claude', 'oldskills'), { recursive: true });
  fs.writeFileSync(path.join(root2, '.claude', 'oldskills', 'x.md'), 'retired\n');
  fs.mkdirSync(path.join(root2, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(root2, '.claude', 'state', 'keep.json'), '{}');
  fs.mkdirSync(path.join(root2, '.claude', 'agent-memory'), { recursive: true });
  fs.writeFileSync(path.join(root2, '.claude', 'agent-memory', 'keep.md'), 'mine\n');
  const chk = run(args2.concat('--check'), root2);
  assert.strictEqual(chk.code, 1, chk.out);
  assert.ok(/extra\s+oldskills\/x\.md/.test(chk.out), chk.out);
  assert.ok(!/state\/keep\.json|agent-memory\/keep\.md/.test(chk.out), 'root-only dirs are never extras');
  assert.strictEqual(run(args2, root2).code, 0, 're-sync');
  assert.ok(!fs.existsSync(path.join(root2, '.claude', 'oldskills')), 'retired dir removed');
  assert.ok(fs.existsSync(path.join(root2, '.claude', 'state', 'keep.json')) && fs.existsSync(path.join(root2, '.claude', 'agent-memory', 'keep.md')), 'machine state untouched');
});
```

Failing assert for packaging — in `cli/cli-hardening.test.js` after the `packs('tools/context-ledger.mjs')` assert:

```js
  assert.ok(!packs('tools/self-harness.mjs'), 'tools/self-harness.mjs is framework-only (root sync) and must not ship in the tarball');
```

Failing fixture for the absent local KB — next to the existing `Knowledge (local)` fixture in `smoke-test.mjs`:

```js
  // This repo keeps its knowledge in the vault: the local dir is absent, and the line said
  // RETRIEVE from a directory that does not exist (M1 review, Task 1 minor).
  const noKb = mkdtempSync(join(tmpdir(), "phe-nokb-"));
  mkdirSync(join(noKb, ".claude"), { recursive: true });
  writeFileSync(join(noKb, ".claude", "harness.json"), JSON.stringify({ knowledge: { local: "knowledge-base" } }));
  const nk = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: noKb });
  let nkCtx = ""; try { nkCtx = JSON.parse(nk.out).hookSpecificOutput.additionalContext; } catch { /* no JSON: the check fails */ }
  check("absent local knowledge dir is reported as ABSENT, not as a store to retrieve from", nkCtx.includes("Knowledge (local): knowledge-base/ is ABSENT") && !nkCtx.includes("knowledge-base/ — RETRIEVE"));
```

- [ ] **Step 2: Run to verify they fail**

Run: `node cli/self-harness.test.js 2>&1 | tail -1` → `9 passed, 1 failed`; `node cli/cli-hardening.test.js 2>&1 | grep -E 'FAIL|passed'` → the packaging assert FAILs; `node template/.claude/hooks/smoke-test.mjs | grep -E 'ABSENT|passed'` → FAIL.

- [ ] **Step 3: Implement**

`tools/self-harness.mjs` — add after `const BACKUP = …`: `const ROOT_ONLY_DIRS = new Set(["agent-memory", "state"]); // machine state under root .claude/ that the template never ships` and replace `extras()` with:

```js
function extras() {
  const shipped = new Set(files(TEMPLATE));
  const out = [];
  // Every top-level dir under the root .claude/ is swept — the template's own dirs for files it
  // stopped shipping, and dirs the template no longer ships AT ALL (a retired top-level dir was
  // invisible to a sweep that only walked the template's dirs, M1 review). Machine state is exempt.
  for (const e of readdirSync(DEST, { withFileTypes: true })) {
    if (!e.isDirectory() || e.isSymbolicLink() || ROOT_ONLY_DIRS.has(e.name)) continue;
    for (const f of files(join(DEST, e.name), DEST)) {
      if (shipped.has(f) || BACKUP.test(f)) continue;
      if (ADAPTED.some((a) => f.startsWith(a + "/") && existsSync(join(TEMPLATE, a)))) continue;
      out.push(f);
    }
  }
  return out;
}
```

`templateDirs()` (`:57-61`) had `extras()` as its only caller (`grep -n templateDirs tools/self-harness.mjs` → lines 59 and 70 today): delete it and its "Top-level directories the template OWNS" comment.

`package.json` `files`: remove the `"tools/self-harness.mjs"` entry.

`session-start.mjs:84-85` becomes:

```js
        const local = typeof k.local === "string" && k.local ? k.local : "knowledge-base";
        lines.push(existsSync(join(cwd, local))
          ? `Knowledge (local): ${local}/ — RETRIEVE before structural work, CAPTURE after; protocol: .claude/references/knowledge-protocol.md`
          : `Knowledge (local): ${local}/ is ABSENT — this project keeps its knowledge elsewhere (AGENTS.md says where) or has not run /harness-init; the two knowledge skills point at the real store.`);
```

Rewrite the two root skills as THIS repo's content (frontmatter unchanged: `name`, `description`, `user-invocable: false`; `architecture-map` keeps `allowed-tools: Bash(find *)` and its live-tree line). `architecture-map` body (≤70 lines): the four-layer map from the vault (`~/Dev/The Vault/projects/perfectHarnessEngineering/architecture.md` — cite, do not copy), the owner table from `AGENTS.md` "Structure map", where new code goes (hook logic → `template/.claude/hooks/` with a smoke fixture; adopter-side tooling → `template/.claude/tooling/` with a `cli/*.test.js`; framework-only tooling → `tools/`; CLI/migrations → `cli/`; doctrine → `docs/`; rules/skills/references budgets), the boundaries (root `.claude/` is generated by `tools/self-harness.mjs` except `harness.json`, `settings.local.json`, `state/`, `agent-memory/` and these two skills; hooks dependency-free; executable logic never in skill prose; `AGENTS.md` is the only cross-harness surface), and "missing analogue → place beside the closest existing file, RECORD in the vault at /evolve". `debugging-this-repo` body (≤70 lines): reproduce with `node template/.claude/hooks/smoke-test.mjs` and the `cli/*.test.js` runners (`npm test` for all); drive a hook by effect (`echo '<stdin JSON>' | node .claude/hooks/<hook>.mjs`); gate logs at `.claude/state/checks/<label>.log` (run-check); known failure classes → `template/.claude/references/harness-maintenance.md` section 6 and the vault runbook (`runbook.md`, "instrument failures"); the three checks before blaming the framework (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` exported? root `.claude/` drifted — `node tools/self-harness.mjs --check`? stale `.claude/state/gate-*.json` snapshot from a RED session?); "no flaky-test quarantine exists — a red test is real".

- [ ] **Step 4: Run to verify they pass**

Run: `node cli/self-harness.test.js 2>&1 | tail -1` → `10 passed, 0 failed`; `node cli/cli-hardening.test.js 2>&1 | tail -1` → all passed; `node template/.claude/hooks/smoke-test.mjs | tail -1` → `166 passed, 0 failed`; `npm pack --dry-run 2>/dev/null | grep -c 'tools/self-harness.mjs'` → `0`.

- [ ] **Step 5: Prove the session line by effect, sync, commit**

Run: `echo '{"session_id":"x","source":"startup","cwd":"'$PWD'"}' | node .claude/hooks/session-start.mjs | grep -o 'Knowledge (local)[^"\\]*'` → the ABSENT form (this repo has no `knowledge-base/`). `node tools/context-ledger.mjs template | grep -E 'architecture-map|debugging'` → the root skills are not measured there (they are root content); check them with `wc -l .claude/skills/architecture-map/SKILL.md .claude/skills/debugging-this-repo/SKILL.md` → each ≤76 (70 body + frontmatter).

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add tools/self-harness.mjs cli/self-harness.test.js cli/cli-hardening.test.js package.json template/.claude/hooks .claude/hooks .claude/skills/architecture-map .claude/skills/debugging-this-repo
git commit -m "fix(root): sweep retired template dirs, keep self-harness out of the tarball, adapt the two knowledge skills to this repo, report an absent local KB honestly"
```

Acceptance criteria: the retired-dir test passes and `state/`/`agent-memory/` are never swept; the tarball no longer ships `tools/self-harness.mjs`; the root knowledge skills point at the vault and this repo's real commands; session start says ABSENT here.

### Task 13: Whole-milestone verification, 3.4.0, report, vault

Tier hint: `build`.

**Files:**
- Modify: `package.json` (`"version": "3.3.0"` → `"3.4.0"`)
- Create: `reports/harness-improvements-m2-implementation-report.md`
- Modify (vault): `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (ADR-026), `_index.md` (Current focus bullet; Index Law)

- [ ] **Step 1: Run the whole-milestone verification (below) and record every output**

Every command in "End-to-end verification" is run fresh and its real output quoted in the report's Verification table — never copied from a task's own report.

- [ ] **Step 2: Bump the version**

`package.json` version → `3.4.0`. Rationale for the report: M1 removed a config key and flipped `requireEvolveBeforePush` on for new installs, M1 added a role, M2 adds two tooling scripts, a guard deny, a ledger flag and a run-check contract change (words after `--`); adopters on `update` keep their config verbatim (`user config wins`), so nothing breaks, but the surface grew — a minor bump per the 3.1/3.2/3.3 precedent.

Run: `npm test > /dev/null 2>&1; echo exit=$?` → `exit=0`; `node -e 'console.log(require("./package.json").version)'` → `3.4.0`.

- [ ] **Step 3: Write the implementation report**

`reports/harness-improvements-m2-implementation-report.md` in the shape of `reports/harness-improvements-m1-implementation-report.md`: header table (Task status, Knowledge, Deviations, Files changed with the commit range, Follow-ups, Plan); "What the milestone changed" (one line per Tier 2 item and one per defect class); per-task status table with fresh evidence cells; Verification; Follow-ups (deferred minors, if any); Decisions taken without asking (numbered rulings with cost-if-wrong — or "none"); Manual — pending the operator (`/skill-doctor`, `/doctor`, `/context` are operator-run: list the exact commands and what the next `/evolve` will ask for); Known prose-only invariants (the confidence rubric is a self-check; the memory-dir encoding is observed; the docs trims' surviving homes); Version; Decisions recorded in the vault.

- [ ] **Step 4: Vault write-back (Index Law)**

Append `ADR-026 — Tier 2 mechanisms: plans anchor by phrase (plan-anchors.mjs), the plan-lint guard (M6), auto-memory deltas reach /evolve (memory-delta.mjs), skill bodies and docs are measured in the ledger and gated at the root, migrations are CLI code` to `decisions.md` in the file's existing ADR shape (context · decision · consequences · date), and a `[x] Harness improvements milestone 2, 2026-09-05` bullet under Current focus in `_index.md` (replace the `[~] … milestone 1 … awaiting merge` bullet's status with `[x]` and "merged 2026-09-05"). The `_index.md` `updated:` frontmatter date stays 2026-09-05.

- [ ] **Step 5: Commit**

```bash
git add package.json reports/harness-improvements-m2-implementation-report.md
git commit -m "chore(release): 3.4.0 — harness improvements milestone 2; implementation report"
```

Validate: `git log --oneline main..HEAD | wc -l` → ≥14; `git status --short` → clean; `git push --dry-run origin feat/harness-improvements-m2` → DENIED by the guard (`/evolve has not run since the last commit`) — that denial is the evidence the push gate is armed; `/evolve` is the next stage, not this task.
Acceptance criteria: the report exists with fresh evidence; the vault carries ADR-026 and the focus bullet; the version is 3.4.0; the suite is green.

## End-to-end verification

Run after Task 13, in this order; every line's real output goes into the report.

1. `node tools/self-harness.mjs --check` → `self-harness: root .claude/ matches template/.claude/`, exit 0; `git status --short .claude` → clean.
2. `node template/.claude/hooks/smoke-test.mjs | tail -1` → `166 passed, 0 failed` (150 + 5 stop-gate + 4 session/statusline + 6 guard + 1 knowledge line).
3. `npm test > /dev/null 2>&1; echo exit=$?` → `exit=0`, and `npm test 2>&1 | grep -c 'passed, 0 failed'` → one per suite, including the four new files (`plan-anchors`, `memory-delta`, `context-ledger`, and `run-check` at 17).
4. `node tools/context-ledger.mjs template --docs docs; echo exit=$?` → always-loaded total ≤2000 (WARN at most), a skill-bodies table with no `HARD`, every doc ≤130, `exit=0`.
5. Stop gate by effect, one scratch repo: `stopGate: [42, "node -e \"process.exit(0)\""]` → the turn ends (empty stdout, exit 0); an INCOMPLETE gate with `stopGateTamperPaths` set writes `tamper-<sid>.json`.
6. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=0 … session-start.mjs` (source startup) → no FORCE line; `FORCE=1` with `source: compact` → the FORCE line and `Compaction dropped`.
7. `node .claude/tooling/run-check.mjs words -- node -e "console.log(process.argv[2])" "a b"` → the tail prints `a b`; `node .claude/tooling/run-check.mjs --tail 5 -- npm test; echo $?` → usage, `64`; from `docs/`: `node ../.claude/tooling/run-check.mjs sub -- node -e "console.log(1)"` → header `log=../.claude/state/checks/sub.log`, no `docs/.claude`.
8. Guard by effect: a `Write` of `plans/probe-plan.md` without the field → `permissionDecision":"deny"`; with `none — probe` → allowed.
9. `node .claude/tooling/plan-anchors.mjs plans/harness-improvements-m2-plan.md` → exit 1 with exactly seven `MISS` lines, every one a passage this milestone rewrote: the five listed in Task 5 step 6, plus `cli/emit-codex.js "!codexHalf[tier] && DEFAULT_MODELS.codex[tier]"` (Task 11) and `tools/self-harness.mjs "function templateDirs()"` (Task 12 deleted it); every other anchor `ok` (≥30). An eighth MISS is a real regression to explain.
10. `node .claude/tooling/memory-delta.mjs diff` → `no snapshot yet — …` (this repo's memory file exists); `PHE_MEMORY_FILE=/nonexistent node .claude/tooling/memory-delta.mjs diff` → `no auto-memory file at /nonexistent — nothing to diff`.
11. `grep -rn 'git worktree list --porcelain' template/.claude/skills/` → nothing; `grep -rn 'make the checks faster' template/.claude/hooks/` → nothing; `grep -rn 'default true' template/.claude/hooks/guard.mjs` → nothing; `grep -rn 'Never builds' template docs` → nothing.
12. `npm pack --dry-run 2>/dev/null | grep -c 'tools/self-harness.mjs'` → `0`; `node -e 'console.log(require("./package.json").version)'` → `3.4.0`.
13. `git push --dry-run origin feat/harness-improvements-m2` → denied with `Push blocked: /evolve has not run since the last commit` (the gate is armed; `/evolve` follows `/validate` and `/review-branch`).

## Risks & assumptions

- **Fixture counts drift.** The `N passed` expectations (155/160/166/167) assume no other fixture is added mid-run; a task that adds an extra check adjusts the later numbers and says so in its report — the invariant is `0 failed`.
- **run-check's word contract.** Two-or-more words after `--` are now re-quoted; a caller that used to pass shell syntax as separate words (`-- npm test && x`) would run `npm` with a literal `&&`. The stop gate does not call run-check (it runs `stopGate` strings itself); `/validate` invokes it with plain words. If a `/validate` invocation shape in `validate/SKILL.md` relies on shell syntax across words, wrap it in `sh -c "…"` in that skill (one line, in place) and note it under Deviations.
- **Docs trims lose intent.** Mitigation: the cut-only-if-it-survives-elsewhere rule, every cut named in the commit body, and the report's "Known prose-only invariants" listing the surviving homes. Task 9 is the one task a reviewer should read the diff of line by line.
- **The memory-dir encoding is observed, not documented.** `memory-delta.mjs` reports a missing file and exits 0, so a wrong guess costs a `nothing to diff` line, never a failed `/evolve`; `PHE_MEMORY_FILE` is the escape hatch.
- **The FORCE on/off rule.** Read raw on 2026-09-05: "Set to `1`", and the variable is absent from the page's set-at-all list. If a later page revision moves it into that list, the hook's `0`-is-off rule becomes wrong; the fixture's comment carries the date so the next verifier knows what to re-check.
- **Root gate time.** Adding the ledger to the root `stopGate` adds <1 s to every turn end (five commands total; `stopGateTotalSec` 75). Measure once in Task 9 and record it.
- **Self-harness sweep widening.** The new `extras()` sweeps every root `.claude/` dir except `agent-memory/` and `state/`; a root-only dir someone adds later (unknown to the template) will be reported as extra and deleted on sync — by design (root `.claude/` is generated), and recoverable from git.
- **Handoff.** Fourteen tasks is 1.5× M1; the midpoint handoff after Task 6 is planned, not optional, when `ctx` is past ~120k.
- **Assumption: no worktree.** As in M1 (Ruling 1), work happens in the primary checkout on `feat/harness-improvements-m2`; `/implement`'s worktree step is not followed (memory: never-work-outside-project-folder; ADR-013).
