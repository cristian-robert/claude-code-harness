---
ticket: ad-hoc
created: 2026-09-01
complexity: M
confidence: 8/10
tier: deep
---

# coleam00/skills audit — four adoptions + vault recordings

> **For agentic workers:** execute task-by-task with per-task validation (superpowers:executing-plans discipline). Hooks tasks are TDD against `smoke-test.mjs`: new fixture RED first, then implement to GREEN.

## Goal

Adopt the four mechanisms that survived the ADR-020 audit of github.com/coleam00/skills (2026-09-01 session): (1) close the environment-dump and quote-fold routes in `guard.mjs`, (2) opt-in tamper check in `stop-gate.mjs`, (3) a rules-truth (drift) bullet in `/evolve`'s prune pass, (4) surface `permission_denials` in `loop.mjs`. Record the audit in the repo docs (sources row, anti-scope rows) and in the vault (ADR-022, two agent-kb notes, resources rows). Declined mechanisms get recorded reasons per ADR-020 — the record IS the deliverable for those.

## Context

- Knowledge to load first: LOCAL: none — this repo's KB is the vault (ADR-001/014 predates local knowledge-base/ here) · SHARED: `~/Dev/The Vault/projects/perfectHarnessEngineering/_index.md`, `decisions.md` (ADR-002 ratchet, ADR-007 Node hooks, ADR-019 bounded loops, ADR-020 audit doctrine), `~/Dev/The Vault/CLAUDE.md` (Index Law, frontmatter contract in `system/schemas/frontmatter.md`)
- Read first: `template/.claude/hooks/guard.mjs:18-30` — existing SECRET_* patterns and the fail-safe-false-positive stance the new patterns must match
- Read first: `template/.claude/hooks/smoke-test.mjs:60-95` — fixture shape: `check("name", denies(runHook("guard.mjs", {...base, tool_name, tool_input})))`; stop-gate fixtures further down build tmp dirs with a `harness.json`
- Read first: `template/.claude/hooks/stop-gate.mjs` (82 lines, whole file) — verdict flow RED/INCOMPLETE/GREEN, `.claude/state/` persistence, fail-open contract
- Pattern to follow: upstream reference regexes in `/private/tmp/claude-501/-Users-cristian-robertiosef-Dev-perfectHarnessEngineering/c6b175fe-8987-4b84-95aa-4467686baaf8/scratchpad/coleam00-skills/hooks/pre_tool_use_secrets.py:46-70` (ENV_DUMP set, `_normalize` quote-folding) and `stop_tests_must_pass.py:45-127` (snapshot-once tamper design). MIT-licensed; adapt, don't port verbatim — ours are Node, fail-open, exec-form (ADR-007)
- Library versions: none — zero-dep Node 18+ hooks, plain markdown elsewhere

## Out of scope

- Shipping the coupling guard (`dependencies.json` read-before-edit) — no PHE incident; recorded as agent-kb pattern instead (Task 6)
- PostToolUse JSONL audit trail — attribution tried and withdrawn (ADR-018); anti-scope row only
- Python hook authorship / `hooks-create` port — would fork ADR-007 (Node .mjs only); anti-scope row only
- Dark-factory orchestration (issues queue, merge bots, deploy triggers) — different scope than `loop/`; anti-scope row only
- `~/.claude/hooks/` installed copies — untouched this increment; adopters re-init to pick up template changes
- Template `CLAUDE.md`/`AGENTS.md`/rules files — no always-loaded line changes; ledger totals must not move

## Tasks

### Task 1: guard.mjs — env-dump routes, extra credential paths, quote-folding

- Files: `template/.claude/hooks/guard.mjs`, `template/.claude/hooks/smoke-test.mjs`
- Steps:
  1. Add fixtures to `smoke-test.mjs` next to the existing Bash-secret block (after the line-85 prose fixture), exactly these twelve:
     ```js
     check("denies Bash printenv", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "printenv" } })));
     check("denies Bash bare env piped", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "env | sort" } })));
     check("allows Bash env-prefixed command", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "env FOO=1 npm test" } })));
     check("denies Bash echo of secret-named var", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "echo $OPENAI_API_KEY" } })));
     check("allows Bash echo of benign var", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "echo $PATH" } })));
     check("denies Bash node -p process.env", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "node -p process.env" } })));
     check("denies Bash python -c os.environ", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "python3 -c 'import os; print(dict(os.environ))'" } })));
     check("allows Bash grep for process.env", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "grep -rn process.env src/" } })));
     check("denies Bash /proc/self/environ", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat /proc/self/environ" } })));
     check("denies Bash quote-split .env", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat .e'nv'" } })));
     check("denies Read of .netrc", denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/home/u/.netrc" } })));
     check("denies Read of .aws/credentials", denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/home/u/.aws/credentials" } })));
     ```
  2. Run `node template/.claude/hooks/smoke-test.mjs` → the new deny fixtures FAIL (RED). Confirm which pass already (e.g. `.aws/credentials` may match `credentials.json`? it does not — pattern is `credentials\.json`; expect all ~10 new denies red except any accidentally covered).
  3. In `guard.mjs`:
     - Extend `SECRET_EXTRA` to: `/(^|[\\/])(id_rsa|id_ed25519|.*\.pem|credentials\.json|\.npmrc|\.netrc)$|(^|[\\/])\.aws[\\/]credentials$|(^|[\\/])\.ssh[\\/]/i`
     - Add after `BASH_SECRET`:
       ```js
       // Environment dumps ARE secret reads: blocking the .env file but not `printenv`
       // guards one door of two (coleam00/skills audit, 2026-09-01). `env FOO=1 cmd`
       // stays allowed — only a BARE env (piped/redirected/terminal) is a dump.
       const ENV_DUMP = [
         /(^|[;&|]\s*)printenv\b/,
         /(^|[;&|]\s*)env\s*(\||>|$)/,
         /\becho\b[^;&|]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)\w*/i,
         /\/proc\/(self|\d+)\/environ\b/,
       ];
       // Inline-interpreter env dump: two independent conditions, because the code
       // argument may contain ; & | inside quotes (a single spanning regex misses
       // `python3 -c 'import os; print(os.environ)'`). Fail-safe over precise.
       const INLINE_INTERP = /\b(node\s+(-e|-p|--eval|--print)|python3?\s+-c|ruby\s+-e|perl\s+-e)\b/;
       const ENV_TOKEN = /(process\.env|os\.environ|ENV\[)/;
       // Quote-folding: a shell resolves cat .e'nv' and cat .env identically; a regex
       // does not. Fold quotes/whitespace and re-check — measured bypass upstream.
       const foldQuotes = (s) => s.replace(/["']/g, "").replace(/\s+/g, " ");
       ```
     - In the Bash branch: deny when any ENV_DUMP matches the raw command, or when `INLINE_INTERP.test(cmd) && ENV_TOKEN.test(cmd)` (reason names the env-dump rule + `.env.example` alternative); run the existing secret-fragment matching against BOTH `cmd` and `foldQuotes(cmd)` (additive — deny if either matches). Do not touch the git-mutation tokenizer.
  4. Re-run smoke test → ALL fixtures green, including every pre-existing one (`env FOO=1 npm test`, `echo hello world`, `echo $PATH`, `grep process.env` must still pass).
  5. Commit: `feat(hooks): guard denies env dumps, quote-split secrets, netrc/aws/ssh paths`
- Validate: `node template/.claude/hooks/smoke-test.mjs` → exit 0, count grows by 12
- Acceptance criteria: all 12 new fixtures green; zero pre-existing fixture regressions; no always-loaded file touched

### Task 2: stop-gate.mjs — opt-in tamper check

- Files: `template/.claude/hooks/stop-gate.mjs`, `template/.claude/hooks/smoke-test.mjs`, `template/.claude/harness.json`
- Steps:
  1. Study the existing stop-gate fixtures in `smoke-test.mjs` (tmp-dir + harness.json rig). Add four fixtures using a tmp repo with `stopGate: ["node -e process.exit(<0|1>)"]` and `stopGateTamperPaths: ["tests/"]`, a `tests/a.test.js` file, and a fake `session_id`:
     - RED run → blocks AND writes `.claude/state/tamper-<sid>.json` containing a sha1 for `tests/a.test.js`
     - then edit `tests/a.test.js`, flip gate to green → BLOCKS with reason containing "tamper"
     - restore the file content, gate green → passes AND snapshot file deleted
     - control: same rig without `stopGateTamperPaths` → RED then GREEN behaves exactly as today, no snapshot file ever created
  2. Run smoke test → new fixtures RED.
  3. Implement in `stop-gate.mjs` (keep fail-open + `stop_hook_active` early-exit untouched):
     - Config: `stopGateTamperPaths` (array; absent/empty = feature off). Matcher, documented in code: entry ending `/` = path prefix; entry starting `*.` = suffix; else exact path. Enumerate candidates via `git ls-files` (already-committed files only — a brand-new test file is added coverage, never punished; upstream design point).
     - Snapshot file `.claude/state/tamper-<first 8 of session_id>.json`, `{ "<path>": "<sha1>" }` via `node:crypto`. Write ONCE on a RED verdict if absent — re-snapshotting per block would let files be edited one turn at a time (upstream design point).
     - On a GREEN verdict with a snapshot present: re-hash; any changed file → block with reason: `Stop gate went GREEN only after edits to gated files: <list>. If the test change is legitimate, explain it to the user and get confirmation; otherwise revert it. (harness.json stopGateTamperPaths)` and KEEP the snapshot. No changes → delete the snapshot and pass.
     - All tamper I/O wrapped in try/catch → on any error, behave as if the feature is off.
  4. Re-run smoke test → all green. Add `"stopGateTamperPaths": [],` to `template/.claude/harness.json` and one sentence to its `$comment`: `stopGateTamperPaths arms an anti-gaming check: on a RED gate the hook snapshots files matching these entries (prefix "dir/", suffix "*.ext", or exact path; committed files only) and refuses a later GREEN that required editing them — traces to a documented upstream escape where an agent rewrote a failing test to finish.`
  5. Commit: `feat(hooks): opt-in stop-gate tamper check (stopGateTamperPaths)`
- Validate: `node template/.claude/hooks/smoke-test.mjs` → exit 0, count grows by 4
- Acceptance criteria: default config = byte-identical gate behavior; armed config blocks the dishonest green and names the files; snapshot lifecycle (write-once / keep-on-tamper / clear-on-honest-green) covered by fixtures

### Task 3: /evolve — drift bullet in the prune pass

- Files: `template/.claude/skills/evolve/SKILL.md`
- Steps:
  1. After the line `- Guidance duplicated elsewhere (a hook already enforces it; the code itself says it)` (line 58), insert exactly one bullet:
     `- Rules now FALSE against this branch's diff — a moved path, a renamed module, a retired command: a wrong rule misleads every future session; propose the minimal one-line fix, never a catalog of the new layout`
  2. `wc -l` the file → must be ≤100 (currently 98 → 99). If a later edit ever pushes it over, the cut candidate is step 7's scrum sentence — but do NOT cut anything this increment.
  3. Commit: `docs(skills): evolve prune pass also checks rule truth against the diff`
- Validate: `node tools/context-ledger.mjs template` → no budget violation reported; `wc -l template/.claude/skills/evolve/SKILL.md` → ≤100
- Acceptance criteria: exactly one line added; no rewrite of surrounding text (verify with `git diff` — one `+` line, zero `-` lines)

### Task 4: loop.mjs — surface permission denials per iteration

- Files: `loop/loop.mjs`
- Steps:
  1. Verify the field name first (hard rule: platform claims get verified): confirm via code.claude.com docs (headless/CLI reference) that the `claude -p --output-format json` result envelope carries `permission_denials` (array). Record the doc URL in the implementation report. If the field does not exist under that name, find the real one; if none exists, record the deviation and drop the task's code change.
  2. In the result-parsing block (around `loop/loop.mjs:146`), add to the log entry: `...(Array.isArray(parsed?.permission_denials) && parsed.permission_denials.length > 0 && { denials: parsed.permission_denials.map(d => d.tool_name || String(d)).slice(0, 10) }),` and extend the console line with `denials=${entry.denials?.length ?? 0}`.
  3. Add one sentence to the SAFETY comment block: `A denied tool does not fail the iteration — the agent "completes" having done nothing (guard.mjs denials still fire here by design), so denials are surfaced per iteration; a nonzero count in loop.log is the first place to look when an iteration made no progress.`
  4. `node --check loop/loop.mjs` and `node loop/loop.mjs --dry-run` → both clean.
  5. Commit: `feat(loop): log permission denials per iteration`
- Validate: `node --check loop/loop.mjs && node loop/loop.mjs --dry-run` → exit 0
- Acceptance criteria: dry-run output unchanged; entry gains `denials` only when nonempty; doc URL for the field recorded in the report

### Task 5: repo docs — sources row + anti-scope rows

- Files: `docs/99-sources.md`, `docs/00-harness-engineering.md`
- Steps:
  1. `docs/99-sources.md`: insert after source 17 (before `## Model policy`):
     ```markdown
     ## 18 · coleam00/skills — github.com/coleam00/skills (audited 2026-09-01, latest commit 2026-08-26)
     The packaged "AI Layer" from Medin's course — 33 skills + 6 Python hooks. Audited per ADR-020; most at parity with or exceeded by `template/` (expected: PHE distilled sources 5–7 from the same author). What it contributed: the env-dump + quote-fold guard coverage and its measured split-quote bypass; the stop-gate tamper check with its documented escape (agent rewrote a failing `2+2==5` test to finish — "argued past, through a door the guarantee itself held open"); the drift axis (wrong rules mislead; pruning only catches rules that stopped earning); the denied-tool-in-headless silent failure. Declined with reasons in docs/00 anti-scope. Its hooks README cites arXiv 2604.25850 (self-written 9KB prompt alone scored BELOW baseline; enforcement layers carried all gains) — corroborates ADR-005/006.
     ```
  2. `docs/00-harness-engineering.md` anti-scope table, add three rows:
     ```markdown
     | PostToolUse JSONL audit trail (coleam00/skills) | Attribution was attempted and withdrawn here (ADR-018) — revisit only with a real incident; `loop/loop.log` already records per-iteration evidence for autonomous runs and interactive transcripts live in `~/.claude/projects/` |
     | Declared-file-coupling guard (`dependencies.json` read-before-edit) | Genuinely novel primitive, zero PHE incidents — the ratchet forbids shipping it; recorded as `agent-kb/patterns/declared-file-coupling` for the day a contract-mismatch incident occurs |
     | Python hook authoring (`hooks-create` port) | Would fork ADR-007 (Node .mjs, exec form, smoke-tested); `/evolve`'s hook route + `smoke-test.mjs` own authored hooks here |
     ```
  3. `docs/00` Sources list: append one bullet: `- coleam00/skills (2026) — audited mechanism-by-mechanism 2026-09-01 per ADR-020; four adoptions (guard env-dump coverage, stop-gate tamper check, /evolve drift bullet, loop denial surfacing), three reasoned declines above. See docs/99 · 18 and vault ADR-022`
  4. Check `wc -l docs/00-harness-engineering.md` — ≤130 guideline; if over, note it in the report rather than cutting someone else's rows.
  5. Commit: `docs: record coleam00/skills audit — source 18, anti-scope rows`
- Validate: `grep -c 'coleam00/skills' docs/99-sources.md docs/00-harness-engineering.md` → ≥1 each
- Acceptance criteria: declined items each carry a reason (ADR-020: the recorded rejection IS the deliverable); source row names what was adopted AND what it taught

### Task 6: vault recordings (Index Law applies)

- Files (in `~/Dev/The Vault/`): `agent-kb/tooling/ablation-runner.md` (new), `agent-kb/tooling/_index.md`, `agent-kb/patterns/declared-file-coupling.md` (new), `agent-kb/patterns/_index.md`, `projects/perfectHarnessEngineering/decisions.md` (ADR-022), `projects/perfectHarnessEngineering/resources.md`, `projects/perfectHarnessEngineering/_index.md`
- Steps:
  1. Read `system/templates/index-template.md` + one existing pattern note (`bounded-agent-loops.md`) for house style; frontmatter per `system/schemas/frontmatter.md` (`type: reference`, `updated: 2026-09-01`, tags).
  2. `ablation-runner.md`: the two-arm methodology (control vs stripped, ≥2 runs per arm, throwaway worktrees from HEAD, strip only the always-loaded set, grade per-rule and BLIND, "untested ≠ no difference", weight new-file evidence over edited-file evidence, ablate against the weakest model in the team's mix); pointer to the MIT scripts at github.com/coleam00/skills `.claude/skills/ablate-ai-layer/scripts/`; verdict table (control-follows/stripped-violates = load-bearing; both-follow = delete; both-violate = make it a hook or delete). Link `[[agent-kb/patterns/executable-logic-never-in-prose|executable-logic-never-in-prose]]`.
  3. `declared-file-coupling.md`: the primitive (couplings declared once in config; agent cannot edit a file before reading its declared dependencies this session; block mode vs context-inject mode; fails open until configured); status line: **not shipped in PHE — no incident; adopt when a contract-mismatch incident lands** (ADR-002 ratchet). Link `[[agent-kb/patterns/bounded-agent-loops|bounded-agent-loops]]` as the sibling "enforcement over instruction" family.
  4. `decisions.md`: append ADR-022 — "coleam00/skills audited per ADR-020; four adoptions, three declines" with Date/Status/Context/Decision/Consequences in house format: adoptions each name their trace (upstream measured bypass / documented escape / audit-as-incident per ADR-020's third verdict), declines point at docs/00 anti-scope.
  5. `resources.md`: add reference-sources row for coleam00/skills (audited, not cloned into repo — scratchpad only) and a row for arXiv 2604.25850 with its one-line finding.
  6. `_index.md` updates in the SAME change: `agent-kb/tooling/_index.md` gains the note (Purpose/Contents), `agent-kb/patterns/_index.md` gains its note, project `_index.md` bumps `updated:`, adjusts the Current-focus line that calls `tooling/` an empty scaffold, and adds ADR-022 to the decisions blurb. Check `projects/_index.md` registry row — bump only if it carries a date column.
  7. If `~/Dev/The Vault` is a git repo, commit there as `docs(phe): ADR-022 coleam00/skills audit + agent-kb ablation/coupling notes`; if not, files only.
- Validate: `ls ~/Dev/The\ Vault/agent-kb/tooling/ablation-runner.md ~/Dev/The\ Vault/agent-kb/patterns/declared-file-coupling.md` → both exist; `grep -c 'ADR-022' ~/Dev/The\ Vault/projects/perfectHarnessEngineering/decisions.md` → ≥1; every touched folder's `_index.md` modified in the same change
- Acceptance criteria: Index Law satisfied (no touched folder with a stale `_index.md`); frontmatter matches the schema; ADR-022 records adoptions WITH traces and declines WITH pointers

## End-to-end verification

1. `node template/.claude/hooks/smoke-test.mjs` → exit 0, total fixture count = old count + 16 (12 guard + 4 stop-gate); state the before/after counts in the report.
2. `node tools/context-ledger.mjs template` → same always-loaded total as before (1659 est. tokens, WARN 83%) — this increment must not move it.
3. `node --check` on `guard.mjs`, `stop-gate.mjs`, `smoke-test.mjs`, `loop/loop.mjs`; `node loop/loop.mjs --dry-run` → clean.
4. `git diff main --stat` shows ONLY the files this plan names.
5. Vault spot-check per Task 6 Validate.

## Risks & assumptions

- **False-positive cost accepted** (matches guard's existing fail-safe stance): `echo $DEPLOY_KEY_NAME`-style benign vars deny; `.ssh/` blocks even `.ssh/config` reads; a repo file literally named `something.pem` in prose denies (already true today). Escape hatch is unchanged: the user runs the command themselves.
- **`echo $API…` deliberately NOT matched** (upstream matches `API`, which false-positives on `$API_URL`); KEY/TOKEN/SECRET/PASSWORD/PASSWD/CREDENTIAL covers `API_KEY` via KEY.
- **`permission_denials` field name unverified until Task 4 step 1** — the task self-corrects from docs, and dropping the change is an allowed outcome recorded as a deviation.
- **Tamper matcher is prefix/suffix, not full glob** — Node 18 has no `fs.globSync`; zero-dep constraint (ADR-007 spirit). Documented in the harness.json `$comment`.
- **Session-scoped snapshot keyed by `session_id`** — two concurrent sessions on one repo cannot cross-trip; a session that never goes green leaves a stale snapshot file in gitignored `.claude/state/` (harmless, next RED overwrites... no: write-once checks existence — stale file from a PREVIOUS session id is a different filename, so no collision; disk residue accepted).
- **Vault may not be a git repo** — Task 6 step 7 handles both.
