---
ticket: ad-hoc
created: 2026-08-03
complexity: L
confidence: 8/10
tier: deep
---

# Project-local `knowledge-base/` (Increment 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the local knowledge store — a git-tracked `knowledge-base/` scaffold, its config key, its writer, its readers and its mechanical gate — so a clean project gets an enforced project-scoped KB end to end, with zero migration machinery.

**Architecture:** Two stores, one boundary rule. LOCAL `knowledge-base/` (in the repo, git-tracked, travels with the code branch) holds project-scoped facts — architecture, ADRs, runbook, credential pointers, capture, cited research. SHARED (an Obsidian vault, recorded in `.claude/harness.json` → `knowledge.shared`) keeps evergreen `wiki/` + `agent-kb/` only. Promotion MOVES, never copies, so no fact is ever in both stores. `cli/knowledge-config.js` owns the config key, `template/.claude/references/knowledge-base-scaffold/` is the shipped skeleton, `architect-agent` is the writer, `tools/kb-check.mjs` is the gate, and `guard.mjs` denies the two writes that would re-fork the truth.

**Tech Stack:** Node ≥18. CommonJS in `cli/` (require/module.exports, `var`, no arrow functions in exported code). ESM (`.mjs`) only under `template/.claude/hooks/` and `tools/`. Hand-rolled tests — no jest, no mocha, no `node:test`. Markdown payload under `template/`.

## Global Constraints

- Plans live at `plans/<slug>-plan.md`. This one is `plans/knowledge-base-local-plan.md`.
- `harness.json` shape (replaces the `vault` key) — fixed, do not invent variants:
  `"knowledge": { "local": "knowledge-base", "shared": { "mode": "existing" | "none", "path": "/abs/path" | null }, "migratedAt": null | "<ISO-8601>" }`
- `cli/knowledge-config.js` exports exactly: `KNOWLEDGE_PROMPT` (string), `parseKnowledgeAnswer(input) -> { mode, sharedPath } | null` (null = unparseable, caller re-asks), `readKnowledgeConfig(projectRoot) -> knowledge | null` (never throws), `writeKnowledgeConfig(projectRoot, config) -> void` (merges; THROWS on malformed harness.json; always preserves the on-disk `migratedAt`), `stampMigratedAt(projectRoot, iso) -> void` (the ONE writer of `migratedAt`).
- `tools/kb-check.mjs` is a CLI script, exit 0 green / exit 1 red, printing findings. Exactly three checks: (a) every folder under `knowledge-base/` has an `_index.md`; (b) no KB file is byte-identical to the shipped scaffold placeholder; (c) no secret-shaped strings in `knowledge-base/`. "Accurate `_index.md`" is semantic and is deliberately NOT claimed.
- CommonJS idiom in `cli/`: copy `cli/vault-config.js` exactly — `'use strict';`, `require`, `var`, named `function` declarations, `module.exports = { name: name, ... }`. No arrow functions, no destructuring in parameters.
- Tests are hand-rolled: a local `assert(name, condition)` helper counting `passed`/`failed`, printing `  PASS: <name>` / `  FAIL: <name>`, ending with `'\n' + passed + ' passed, ' + failed + ' failed'` and `process.exit(failed > 0 ? 1 : 0)`. Copy `cli/vault-config.test.js:14-19,84-85` verbatim.
- ANY edit under `template/.claude/hooks/` REQUIRES `node template/.claude/hooks/smoke-test.mjs` green PLUS a NEW fixture for the new behavior. Hard repo rule.
- Budgets, measured by `node tools/context-ledger.mjs template`: template `CLAUDE.md`/`AGENTS.md` ≤60 lines, `.claude/rules/*.md` ≤45 lines, skill BODIES ≤100 lines (frontmatter excluded). `template/AGENTS.md` is at **59/60** and `.claude/rules/00-core.md` is at **45/45** RIGHT NOW — adding a line means cutting one. `harness-init/SKILL.md` body is at **98/100**, `implement/SKILL.md` at **94/100**, `validate/SKILL.md` at **75/100**.
- Baseline measured today: ledger TOTAL 1656 est. tokens, Status WARN (83%). This plan's edits re-measure to **1654** (AGENTS.md 938 → 943, `00-core.md` 556 → 549, everything else unchanged). No regression means the new TOTAL is ≤ 1654 with no `!! WARN` and no `!! HARD` lines.
- `cli/skill-preview-guards.test.js:43` asserts `previews >= 7` and exactly 7 exist today. One of them is `architecture-map/SKILL.md:14` — the live `` !`find …` `` preview MUST survive the skill shrink, tail included (`|| echo "(dir scan failed)"`).
- `cli/cli-hardening.test.js:327-343` pins regression placeholder tokens that must still exist across `template/AGENTS.md` + `architecture-map/SKILL.md` + `debugging-this-repo/SKILL.md`: `<file>`, `<incident>`, `<shared-dir>`, `<root cause>`, `<env-var>`, `<file:line>`, `<exact error text>`. `cli/cli-hardening.test.js:345-357` pins `<id>`, `<slug>`, `<n>`, `<tool>` in `template/AGENTS.md`.
- `cli/cli-hardening.test.js:408-429` pins init call ORDER structurally: `backupAndCopy(` … `< installHarnessConfig(\n    targetDir` `< writeHarnessTargets(targetDir, targets)` `< var instructionFiles = [{ name: 'AGENTS.md' }]`. Never move those four; the knowledge write goes between `writeHarnessTargets` and the instruction copy, exactly where the vault write sits today (`cli/init.js:471`).
- `cli/emit-codex.test.js:721` asserts the emitted `architect-agent` instructions still contain the word "vault" (case-insensitive). The rewritten agent MUST keep naming the shared vault.
- `cli/emit-codex.test.js:667-693` walks `template/.claude/references/` for `/\b(opus|sonnet|haiku|fable)\b/i` and skips ONLY `vault-scaffold`. Nothing under `knowledge-base-scaffold/` may name a model.
- `cli/cli-hardening.test.js:250-265` asserts `cli/index.js --help` does not match `/kb-search|lean-index|Knowledge base tools/i`. The new help line must not use those words.
- Conventional commits: `feat:` / `fix:` / `refactor:` / `docs:` / `chore:` / `test:`. Never commit on `main`/`master` — branch first: `feat/knowledge-base-local`.
- Every task ends with a real command and its real expected output. "Looks done" is not a state.
- OUT OF SCOPE (increment 2): `cli/knowledge-migrate.js`, the `/knowledge-migrate` skill, `cli/migrations.js`, `cli/update.js`, the ledger file `.claude/state/knowledge-migration.json`, leak gate, backup, link resolver. Increment 1 adds NO migration machinery whatsoever. A legacy `vault` key in an adopter's `harness.json` is simply preserved untouched by `installHarnessConfig`; nothing reads it after this increment.

## File Structure

| File | The ONE responsibility |
|---|---|
| `cli/knowledge-config.js` (create) | `harness.json.knowledge` read/write + the init prompt and its parser |
| `cli/knowledge-config.test.js` (create) | The 38 asserts, ported from `cli/vault-config.test.js` |
| `cli/vault-config.js` (delete) | — replaced |
| `cli/vault-config.test.js` (delete) | — replaced |
| `cli/init.js` (modify) | Ask the shared-store question, record `knowledge`, print the summary |
| `cli/protected-files.js` (modify) | `knowledge-base` joins `NEEDS_RESTORE` as a registry entry — nothing reads it today; `update` never writes outside `.claude/`/`examples/` |
| `cli/harness-config.js` (modify) | Comment accuracy: the merge-discipline siblings are now `knowledge-config.js` |
| `cli/model-tiers.js` (modify) | Comment accuracy: `harness.json` holds `knowledge`, not `vault` |
| `cli/index.js` (modify) | Route `kb-check` to `tools/kb-check.mjs`, mirroring `file-size-check` |
| `cli/kb-check.test.js` (create) | Drive `tools/kb-check.mjs` as a real process; assert exit codes + findings |
| `cli/cli-hardening.test.js` (modify) | The pinned `GATE_CMD` literal gains `knowledge-base/` |
| `package.json` (modify) | Description, keywords, packed files, test scripts |
| `tools/kb-check.mjs` (create) | The three mechanical KB checks with real exit codes |
| `template/.claude/references/knowledge-base-scaffold/**` (create, 7 files) | The shipped local-KB skeleton |
| `template/.claude/references/vault-scaffold/**` (modify + delete) | Shrinks to shared-only: no pointer block, no project template, doctrine rewritten |
| `template/.claude/references/knowledge-protocol.md` (create) | The two-store contract: boundary rule, ladders, write policy, per-stage table |
| `template/.claude/references/vault-protocol.md` (delete) | — replaced |
| `template/.claude/references/plan-template.md` (modify) | `Knowledge to load first:` requires both stores or `none — <reason>` |
| `template/.claude/agents/architect-agent.md` (modify) | The KB's WRITER — resolution chain repointed at `knowledge-base/` |
| `template/.claude/agents/code-reviewer.md` (modify) | Boundaries + recorded decisions, read from the BASE branch |
| `template/.claude/skills/architecture-map/SKILL.md` (modify) | Thin pointer to `knowledge-base/architecture.md`; keeps the live tree preview |
| `template/.claude/skills/debugging-this-repo/SKILL.md` (modify) | Thin pointer to `knowledge-base/runbook.md` |
| `template/.claude/skills/validate/SKILL.md` (modify) | `kb-check` becomes a gate command |
| `template/.claude/skills/implement/SKILL.md` (modify) | One Knowledge row in the report table |
| `template/.claude/skills/harness-init/SKILL.md` (modify) | Scaffold `knowledge-base/`; placeholder gate covers it |
| `template/.claude/skills/evolve/SKILL.md` (modify) | RECORD + promotion rows point at the two stores |
| `template/.claude/skills/backlog/SKILL.md` (modify) | Prior-art retrieval cites the knowledge protocol |
| `template/.claude/skills/plan-work/SKILL.md` (modify) | agent-kb bullet cites the knowledge protocol |
| `template/AGENTS.md` (modify) | Pointer-block slot removed; knowledge routing + kb-check command row |
| `template/.claude/rules/00-core.md` (modify) | Two routing rows rewritten IN PLACE (file is at cap) |
| `template/.claude/hooks/session-start.mjs` (modify) | Emit the two-store orientation lines |
| `template/.claude/hooks/guard.mjs` (modify) | Deny `Write(<shared>/projects/**)` except the `_index.md` registry row, and secret-shaped `Write(knowledge-base/**)` |
| `template/.claude/hooks/smoke-test.mjs` (modify) | 6 session-start fixtures + 13 guard fixtures |
| `docs/05-knowledge-layer.md` (modify) | Rewritten around the two-store boundary rule |
| `docs/99-sources.md`, `README.md` (modify) | One dangling pointer-block reference each |
| `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (modify) | ADR-014, ADR-015, ADR-016; ADR-010 cross-reference |

---

### Task 1: `cli/knowledge-config.js` — the config key and its prompt

**Files:**
- Create `cli/knowledge-config.js`
- Test: create `cli/knowledge-config.test.js`

**Interfaces:**
- Consumes: `writeJsonAtomic(filePath, obj)` from `cli/harness-config.js` (already exported); `writeHarnessTargets(projectRoot, targets)` from `cli/harness-targets.js` (already exported, used by the coexistence asserts).
- Produces: `LOCAL_DIR`, `KNOWLEDGE_PROMPT`, `parseKnowledgeAnswer`, `readKnowledgeConfig`, `writeKnowledgeConfig`, `stampMigratedAt`. Task 2 consumes `KNOWLEDGE_PROMPT`, `parseKnowledgeAnswer` and `writeKnowledgeConfig`; `LOCAL_DIR` and `readKnowledgeConfig` are used by the test only in increment 1 and by `cli/knowledge-migrate.js` in increment 2; `stampMigratedAt` by increment 2's step 8 and increment 3's Task 9.

- [ ] **Step 1: Branch off `main`.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git checkout -b feat/knowledge-base-local
  ```
  Expected output: `Switched to a new branch 'feat/knowledge-base-local'`

- [ ] **Step 2: Write the failing test.** Create `cli/knowledge-config.test.js` with exactly this content (38 asserts, harness copied verbatim from `cli/vault-config.test.js:14-19,84-85`):
  ```js
  // cli/knowledge-config.test.js
  //
  // Tests knowledge-config parsing and persistence of the `knowledge` key in
  // .claude/harness.json, and its coexistence with the `harness` key.
  //
  // The LOCAL store is not a question: every project gets `knowledge-base/`. Only the
  // SHARED store (an Obsidian vault holding evergreen wiki/ + agent-kb/) is asked about,
  // which is why parseKnowledgeAnswer returns {mode, sharedPath} and never a local path.

  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const crypto = require('crypto');

  const { parseKnowledgeAnswer, readKnowledgeConfig, writeKnowledgeConfig, stampMigratedAt } = require('./knowledge-config');
  const { writeHarnessTargets } = require('./harness-targets');

  var passed = 0;
  var failed = 0;
  function assert(name, condition) {
    if (condition) { console.log('  PASS: ' + name); passed++; }
    else { console.log('  FAIL: ' + name); failed++; }
  }

  const TEST_DIR = path.join(os.tmpdir(), 'knowledge-config-test-' + crypto.randomUUID());

  console.log('parseKnowledgeAnswer:');
  var HOME = os.homedir();
  assert('absolute path -> existing', JSON.stringify(parseKnowledgeAnswer('/Users/x/Vault')) === JSON.stringify({ mode: 'existing', sharedPath: '/Users/x/Vault' }));
  assert('trailing slash trimmed', parseKnowledgeAnswer('/Users/x/Vault/').sharedPath === '/Users/x/Vault');
  assert('~ expands to home', parseKnowledgeAnswer('~/Vault').sharedPath === path.join(HOME, 'Vault'));
  assert('"skip" -> none', JSON.stringify(parseKnowledgeAnswer('skip')) === JSON.stringify({ mode: 'none', sharedPath: null }));
  assert('"none" -> none', parseKnowledgeAnswer('none').mode === 'none');
  assert('"SKIP" (any case) -> none', parseKnowledgeAnswer('SKIP').mode === 'none');
  assert('empty -> none', parseKnowledgeAnswer('').mode === 'none');
  assert('whitespace trimmed', parseKnowledgeAnswer('  skip  ').mode === 'none');
  assert('relative path -> null (re-ask)', parseKnowledgeAnswer('some/rel/path') === null);
  assert('garbage -> null', parseKnowledgeAnswer('maybe?') === null);
  assert('non-string -> null', parseKnowledgeAnswer(undefined) === null);

  console.log('readKnowledgeConfig:');
  var PROJ = path.join(TEST_DIR, 'proj');
  fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true });
  assert('missing harness.json -> null', readKnowledgeConfig(PROJ) === null);
  fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ stopGate: [] }));
  assert('harness.json without knowledge key -> null', readKnowledgeConfig(PROJ) === null);
  fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ not json');
  assert('malformed harness.json -> null (no throw)', readKnowledgeConfig(PROJ) === null);
  // An array IS an object to typeof. Returning one breaks the declared return type and the
  // first caller to touch `.shared.mode` gets a TypeError instead of the "not configured" path.
  fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ knowledge: [1, 2] }));
  assert('array-valued knowledge -> null, not the array', readKnowledgeConfig(PROJ) === null);

  console.log('writeKnowledgeConfig preserves other keys:');
  fs.writeFileSync(
    path.join(PROJ, '.claude', 'harness.json'),
    JSON.stringify({ stopGate: ['npm test'], workTracking: { backend: 'none' } }, null, 2)
  );
  writeKnowledgeConfig(PROJ, { mode: 'existing', sharedPath: '/v' });
  var after = JSON.parse(fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8'));
  assert('knowledge key written in the fixed shape', JSON.stringify(after.knowledge) === JSON.stringify({ local: 'knowledge-base', shared: { mode: 'existing', path: '/v' }, migratedAt: null }));
  assert('stopGate preserved', JSON.stringify(after.stopGate) === '["npm test"]');
  assert('workTracking preserved', after.workTracking.backend === 'none');
  assert('round-trips through readKnowledgeConfig', readKnowledgeConfig(PROJ).shared.path === '/v');

  console.log('writeKnowledgeConfig refuses to destroy malformed config:');
  fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ oops not json');
  var threw = false;
  try { writeKnowledgeConfig(PROJ, { mode: 'none', sharedPath: null }); } catch (e) { threw = true; }
  assert('throws on malformed existing harness.json', threw);
  assert('malformed file left untouched', fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8') === '{ oops not json');

  console.log('coexistence with writeHarnessTargets:');
  var CO = path.join(TEST_DIR, 'coexist');
  fs.mkdirSync(path.join(CO, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(CO, '.claude', 'harness.json'), JSON.stringify({ stopGate: ['x'] }, null, 2));
  writeKnowledgeConfig(CO, { mode: 'none', sharedPath: null });
  writeHarnessTargets(CO, ['claude', 'codex']);
  var co = JSON.parse(fs.readFileSync(path.join(CO, '.claude', 'harness.json'), 'utf-8'));
  assert('knowledge survives a later writeHarnessTargets', co.knowledge.shared.mode === 'none');
  assert('harness written alongside knowledge', JSON.stringify(co.harness) === '["claude","codex"]');
  assert('stopGate still preserved through both writes', JSON.stringify(co.stopGate) === '["x"]');

  console.log('writeKnowledgeConfig creates harness.json when absent:');
  var FRESH = path.join(TEST_DIR, 'fresh');
  fs.mkdirSync(path.join(FRESH, '.claude'), { recursive: true });
  writeKnowledgeConfig(FRESH, { mode: 'none', sharedPath: null });
  assert('creates harness.json when absent', readKnowledgeConfig(FRESH).local === 'knowledge-base');

  console.log('stampMigratedAt:');
  writeKnowledgeConfig(FRESH, { mode: 'existing', sharedPath: '/v' });
  stampMigratedAt(FRESH, '2026-08-03T00:00:00Z');
  assert('stampMigratedAt sets migratedAt', readKnowledgeConfig(FRESH).migratedAt === '2026-08-03T00:00:00Z');
  assert('a later writeKnowledgeConfig preserves the stamp',
    (writeKnowledgeConfig(FRESH, { mode: 'none', sharedPath: null }), readKnowledgeConfig(FRESH).migratedAt) === '2026-08-03T00:00:00Z');

  console.log('input validation:');
  // Passing the whole knowledge object instead of {mode, sharedPath} used to write
  // `shared: { path: null }` with NO mode key and no error — a config no reader can act on.
  var badCfg = false;
  try { writeKnowledgeConfig(FRESH, { local: 'knowledge-base', shared: { mode: 'none', path: null } }); }
  catch (e) { badCfg = true; }
  assert('writeKnowledgeConfig rejects a config with no valid mode', badCfg);
  var nullCfg = false;
  try { writeKnowledgeConfig(FRESH, null); } catch (e) { nullCfg = true; }
  assert('writeKnowledgeConfig rejects a null config', nullCfg);
  assert('the rejected write left the previous config intact', readKnowledgeConfig(FRESH).shared.mode === 'none');

  // stampMigratedAt('') would silently UN-SAY a completed one-way migration.
  var emptyIso = false;
  try { stampMigratedAt(FRESH, ''); } catch (e) { emptyIso = true; }
  assert('stampMigratedAt refuses an empty iso', emptyIso);
  assert('the migration record survived the refused stamp', readKnowledgeConfig(FRESH).migratedAt === '2026-08-03T00:00:00Z');

  // A falsy-but-PRESENT stamp is still a stamp: preserve-if-truthy silently rewrote it.
  fs.writeFileSync(
    path.join(FRESH, '.claude', 'harness.json'),
    JSON.stringify({ knowledge: { local: 'knowledge-base', shared: { mode: 'none', path: null }, migratedAt: '' } }, null, 2)
  );
  writeKnowledgeConfig(FRESH, { mode: 'none', sharedPath: null });
  assert('migratedAt is preserved if PRESENT, not if truthy', readKnowledgeConfig(FRESH).migratedAt === '');

  // A `null` harness.json must give the actionable message, not a raw TypeError on .knowledge.
  var NULLJ = path.join(TEST_DIR, 'nulljson');
  fs.mkdirSync(path.join(NULLJ, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(NULLJ, '.claude', 'harness.json'), 'null');
  var stampErr = null;
  try { stampMigratedAt(NULLJ, '2026-08-03T00:00:00Z'); } catch (e) { stampErr = e; }
  assert('stampMigratedAt on a null harness.json throws the actionable message, not a TypeError',
    stampErr !== null && !(stampErr instanceof TypeError) && stampErr.message.indexOf('not a JSON object') !== -1);

  // The SAME guard on the other writer, which had none of its own coverage: deleting
  // writeKnowledgeConfig's null/array check left this suite at 34 passed, 0 failed while a
  // `null` harness.json threw a raw TypeError at the caller. Both halves of the guard are
  // pinned separately — dropping only `Array.isArray` sets `.knowledge` on an array, which
  // serialises back to a plain array and silently discards the key it was asked to write.
  var writeErr = null;
  try { writeKnowledgeConfig(NULLJ, { mode: 'none', sharedPath: null }); } catch (e) { writeErr = e; }
  assert('writeKnowledgeConfig on a null harness.json throws the actionable message, not a TypeError',
    writeErr !== null && !(writeErr instanceof TypeError) && writeErr.message.indexOf('not a JSON object') !== -1);
  assert('the refused null write left the file untouched',
    fs.readFileSync(path.join(NULLJ, '.claude', 'harness.json'), 'utf-8') === 'null');

  fs.writeFileSync(path.join(NULLJ, '.claude', 'harness.json'), '[1,2]');
  var arrayErr = null;
  try { writeKnowledgeConfig(NULLJ, { mode: 'none', sharedPath: null }); } catch (e) { arrayErr = e; }
  assert('writeKnowledgeConfig on an ARRAY harness.json refuses instead of writing a key that cannot survive',
    arrayErr !== null && arrayErr.message.indexOf('not a JSON object') !== -1);
  assert('the refused array write left the file untouched',
    fs.readFileSync(path.join(NULLJ, '.claude', 'harness.json'), 'utf-8') === '[1,2]');

  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
  ```

- [ ] **Step 3: Run it and see it fail.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-config.test.js
  ```
  Expected output contains: `Error: Cannot find module './knowledge-config'` and a non-zero exit code.

- [ ] **Step 4: Write the module.** Create `cli/knowledge-config.js` with exactly this content:
  ```js
  'use strict';

  // The two knowledge stores this project uses. Persisted in .claude/harness.json under
  // `knowledge`, asked once at `init`:
  //
  //   "knowledge": {
  //     "local":  "knowledge-base",                                  // ALWAYS in the repo, git-tracked
  //     "shared": { "mode": "existing"|"none", "path": "/abs"|null }, // the Obsidian vault, evergreen only
  //     "migratedAt": null                                            // stamped by the migration (increment 2)
  //   }
  //
  // LOCAL is neither optional nor asked about: project-scoped knowledge lives in the repo,
  // and every rule, skill and hook in the payload names `knowledge-base/` literally. Only
  // the SHARED store is a question, because not everyone keeps one.
  //
  // Merge discipline mirrors harness-targets.js: harness.json is shared (it holds the stop
  // gate and work-tracking config), so a write preserves every other key and REFUSES
  // (throws) rather than overwrite a harness.json it cannot parse.

  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { writeJsonAtomic } = require('./harness-config');

  const LOCAL_DIR = 'knowledge-base';

  const KNOWLEDGE_PROMPT =
    'Project knowledge lives in ./knowledge-base/ (git-tracked, scaffolded by /harness-init).\n' +
    'Do you also keep a SHARED store — an Obsidian vault for evergreen wiki/ + agent-kb/?\n' +
    '  <path>  absolute path to that shared vault (e.g. ~/Dev/The Vault)\n' +
    '  skip    no shared store — local knowledge-base/ only\n' +
    'Shared store (path / skip): ';

  function parseKnowledgeAnswer(input) {
    if (typeof input !== 'string') return null;
    var a = input.trim();
    var lower = a.toLowerCase();
    if (a === '' || lower === 'skip' || lower === 'none') return { mode: 'none', sharedPath: null };
    // An absolute path (or ~-rooted) is an existing shared store. Expand ~ and trim a
    // trailing slash so the recorded path is canonical.
    if (a.charAt(0) === '/' || a.slice(0, 2) === '~/') {
      var p = a.slice(0, 2) === '~/' ? path.join(os.homedir(), a.slice(2)) : a;
      if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
      return { mode: 'existing', sharedPath: p };
    }
    // Anything else (a relative path, a typo) is unparseable — caller re-asks.
    return null;
  }

  function harnessJsonPath(projectRoot) {
    return path.join(projectRoot, '.claude', 'harness.json');
  }

  function readKnowledgeConfig(projectRoot) {
    var p = harnessJsonPath(projectRoot);
    if (!fs.existsSync(p)) return null;
    var parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      return null; // reads must never crash init/update
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    // Arrays are objects. Returning one breaks the declared return type and a caller's
    // `k.shared.mode` TypeErrors on it — the top level is array-guarded, so this must be too.
    if (!parsed.knowledge || typeof parsed.knowledge !== 'object' || Array.isArray(parsed.knowledge)) return null;
    return parsed.knowledge;
  }

  // Merge the knowledge key into harness.json, preserving every other key. Refuse to write
  // through a harness.json we cannot parse — silently discarding the stop gate is never
  // acceptable (parity with harness-targets.writeHarnessTargets).
  function writeKnowledgeConfig(projectRoot, config) {
    // Validate the INPUT, not just the file. Passing the whole knowledge object (rather than
    // the {mode, sharedPath} the parser returns) used to write `shared: { path: null }` with
    // no `mode` key at all, and no error — a config no reader can interpret.
    if (!config || (config.mode !== 'existing' && config.mode !== 'none')) {
      throw new Error('writeKnowledgeConfig requires { mode: "existing" | "none", sharedPath }.');
    }
    var p = harnessJsonPath(projectRoot);
    var current = {};
    if (fs.existsSync(p)) {
      var raw = fs.readFileSync(p, 'utf-8');
      try {
        current = JSON.parse(raw);
      } catch (e) {
        throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.');
      }
      if (current === null || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
      }
    }
    // A migratedAt stamp already on disk survives a re-init: it records that the one-way
    // move out of the shared store already happened, and re-running init must not un-say it.
    var previous = current.knowledge && typeof current.knowledge === 'object' ? current.knowledge : {};
    current.knowledge = {
      local: LOCAL_DIR,
      shared: { mode: config.mode, path: config.sharedPath || null },
      // Preserve-if-PRESENT, not preserve-if-truthy: the contract is "always preserves", and
      // a falsy-but-present stamp is still a stamp that must not be rewritten here.
      migratedAt: Object.prototype.hasOwnProperty.call(previous, 'migratedAt') ? previous.migratedAt : null,
    };
    writeJsonAtomic(p, current);
  }

  // Stamp the one-way migration. Separate from writeKnowledgeConfig on purpose:
  // that function must never let a re-run of `init` un-say a completed migration,
  // so it always re-reads migratedAt from disk. This is the ONE writer of the field.
  function stampMigratedAt(projectRoot, iso) {
    // The stamp IS the one-way record. An empty or non-string value would silently un-say a
    // completed migration, which is the one thing this field exists to make impossible.
    if (typeof iso !== 'string' || iso === '') {
      throw new Error('stampMigratedAt requires a non-empty ISO timestamp string.');
    }
    var p = harnessJsonPath(projectRoot);
    if (!fs.existsSync(p)) throw new Error(p + ' does not exist — nothing to stamp.');
    var current;
    try { current = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.'); }
    // Same guard writeKnowledgeConfig has: a `null` or array harness.json must produce the
    // actionable message, not a raw TypeError on `.knowledge`.
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
    }
    if (!current.knowledge || typeof current.knowledge !== 'object') {
      throw new Error(p + ' has no `knowledge` key — run `init` before stamping a migration.');
    }
    current.knowledge.migratedAt = iso;
    writeJsonAtomic(p, current);
  }

  module.exports = {
    LOCAL_DIR: LOCAL_DIR,
    KNOWLEDGE_PROMPT: KNOWLEDGE_PROMPT,
    parseKnowledgeAnswer: parseKnowledgeAnswer,
    readKnowledgeConfig: readKnowledgeConfig,
    writeKnowledgeConfig: writeKnowledgeConfig,
    stampMigratedAt: stampMigratedAt,
  };
  ```

- [ ] **Step 5: Run it and see it pass.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-config.test.js
  ```
  Expected final line: `38 passed, 0 failed` (exit 0) — the count as this task ran. Task 8's fix
  round 1 later added the two reader/writer-seam asserts, so re-running this today gives `40`.

- [ ] **Step 6: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/knowledge-config.js cli/knowledge-config.test.js && git commit -m "feat(cli): knowledge-config — the two-store harness.json key"
  ```
  Expected output contains: `2 files changed`

---

### Task 2: Wire `init` to the knowledge key; retire `vault-config`

**Files:**
- Modify `cli/init.js` (`:11` require, `:26` comment, `:371-382` prompt block, `:471` write call, `:601`, `:608`, `:619-622` summary)
- Modify `cli/protected-files.js` (`:15-20` `NEEDS_RESTORE`)
- Modify `cli/harness-config.js` (`:10`, `:101`)
- Modify `cli/model-tiers.js` (`:10`)
- Modify `package.json` (`:4` description, `:8` keywords, `:18` + `:20` test scripts)
- Delete `cli/vault-config.js`, `cli/vault-config.test.js`

**Interfaces:**
- Consumes: `KNOWLEDGE_PROMPT`, `parseKnowledgeAnswer`, `writeKnowledgeConfig` from Task 1.
- Produces: a `harness.json` carrying `knowledge` after `npx perfect-harness-engineering init`. Task 8 (session-start) and Task 9 (guard) read that key at runtime.

- [ ] **Step 1: Delete the old module and its test — this is the RED.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git rm cli/vault-config.js cli/vault-config.test.js
  ```
  Expected output: `rm 'cli/vault-config.js'` and `rm 'cli/vault-config.test.js'`

- [ ] **Step 2: Run init's module graph and see it fail.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node -e "require('./cli/init.js')"
  ```
  Expected output contains: `Error: Cannot find module './vault-config'`

- [ ] **Step 3: Repoint the require in `cli/init.js:11`.** Replace
  ```js
  const { VAULT_PROMPT, parseVaultAnswer, writeVaultConfig } = require('./vault-config');
  ```
  with
  ```js
  const { KNOWLEDGE_PROMPT, parseKnowledgeAnswer, writeKnowledgeConfig } = require('./knowledge-config');
  ```
  and in the comment at `cli/init.js:26` replace `(harness, then vault, then maybe git-init)` with `(harness, then knowledge, then maybe git-init)`.

- [ ] **Step 4: Replace the prompt block at `cli/init.js:371-382`.** Replace
  ```js
    // Which Obsidian vault (if any) backs architecture & knowledge? Asked once,
    // recorded in harness.json; /harness-init does the scaffolding + wiring.
    var vault = null;
    while (vault === null) {
      var vaultAnswer = await ask(VAULT_PROMPT);
      vault = parseVaultAnswer(vaultAnswer);
      if (vault === null) {
        console.log('  Enter an absolute path, or "s" to scaffold, or "skip".');
      }
    }
    console.log('  Vault: ' + (vault.mode === 'existing' ? vault.path : vault.mode));
    console.log('');
  ```
  with
  ```js
    // Project-scoped knowledge ALWAYS lands in ./knowledge-base/ — that is not a question.
    // The only question is whether a SHARED store (an Obsidian vault holding evergreen
    // wiki/ + agent-kb/) also exists. Asked once, recorded in harness.json; /harness-init
    // scaffolds knowledge-base/ and wires the architect agent at it.
    var knowledge = null;
    while (knowledge === null) {
      var knowledgeAnswer = await ask(KNOWLEDGE_PROMPT);
      knowledge = parseKnowledgeAnswer(knowledgeAnswer);
      if (knowledge === null) {
        console.log('  Enter an absolute path to your shared vault, or "skip".');
      }
    }
    console.log('  Knowledge: ./knowledge-base/ (local)' +
      (knowledge.mode === 'existing' ? ' + shared store at ' + knowledge.sharedPath : ' — no shared store'));
    console.log('');
  ```

- [ ] **Step 5: Replace the write call at `cli/init.js:471`.** Replace the single line
  ```js
    writeVaultConfig(targetDir, vault);
  ```
  with
  ```js
    writeKnowledgeConfig(targetDir, knowledge);
  ```
  Do NOT move it: `cli/cli-hardening.test.js:408-429` pins `backupAndCopy < installHarnessConfig < writeHarnessTargets < var instructionFiles = [{ name: 'AGENTS.md' }]`, and this line must stay between the third and the fourth.

- [ ] **Step 6: Fix the three summary lines.** At `cli/init.js:601` replace
  ```js
    console.log('  .claude/references/  on-demand references + vault-scaffold');
  ```
  with
  ```js
    console.log('  .claude/references/  on-demand references + knowledge-base-scaffold + vault-scaffold');
  ```
  At `cli/init.js:608` replace
  ```js
      console.log('  2. Run /harness-init — it fits the payload to your stack, arms the gate, and (optionally) scaffolds a vault');
  ```
  with
  ```js
      console.log('  2. Run /harness-init — it fits the payload to your stack, arms the gate, and scaffolds ./knowledge-base/');
  ```
  At `cli/init.js:619-622` replace
  ```js
    if (vault.mode === 'scaffold' || vault.mode === 'existing') {
      console.log('  Vault: /harness-init will ' + (vault.mode === 'scaffold' ? 'scaffold it and ' : '') +
        'wire the pointer block and point the architect agent at projects/<name>/.');
    }
  ```
  with
  ```js
    console.log('  Knowledge: /harness-init scaffolds ./knowledge-base/ from ' +
      '.claude/references/knowledge-base-scaffold/ and points the architect agent at it.' +
      (knowledge.mode === 'existing'
        ? ' Shared store ' + knowledge.sharedPath + ' keeps evergreen wiki/ + agent-kb/ only.'
        : ''));
  ```

- [ ] **Step 7: Add `knowledge-base` to `NEEDS_RESTORE` in `cli/protected-files.js:15-20`.** Replace
  ```js
  var NEEDS_RESTORE = [
    'backlog',
    'sprints',
    'plans',
    'reports',
  ];
  ```
  with
  ```js
  var NEEDS_RESTORE = [
    'backlog',
    'sprints',
    'plans',
    'reports',
    // Project-scoped knowledge. Registry entry only — nothing reads NEEDS_RESTORE today;
    // update never writes outside .claude/ and examples/, so knowledge-base/ is safe by construction.
    'knowledge-base',
  ];
  ```

- [ ] **Step 8: Fix the two stale comments.** In `cli/harness-config.js:10` replace `remembered (harness, vault, models — each added reactively after someone noticed it` with `remembered (harness, knowledge, models — each added reactively after someone noticed it`. In `cli/harness-config.js:101` replace `vault-config.js, model-tiers.js); reading it as the base of the merge inherits that` with `knowledge-config.js, model-tiers.js); reading it as the base of the merge inherits that`. In `cli/model-tiers.js:10` replace `// vault, work tracking), so a write preserves every other key and REFUSES (throws)` with `// knowledge, work tracking), so a write preserves every other key and REFUSES (throws)`.

- [ ] **Step 9: Update `package.json`.** At `:4` replace the `description` value's tail `doc-grounded research reuse, and a vault-linked knowledge loop. Installs a hardened .claude/ payload.` with `doc-grounded research reuse, and a git-tracked project-local knowledge base with a shared-vault promotion path. Installs a hardened .claude/ payload.` At `:8` replace the `keywords` array with
  ```json
    "keywords": ["claude", "claude-code", "harness", "agentic", "piv-loop", "context-engineering", "knowledge-base", "obsidian"],
  ```
  At `:18` and `:20`, replace every occurrence of `node cli/vault-config.test.js` with `node cli/knowledge-config.test.js`.

- [ ] **Step 10: Run the module graph and see it load.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node -e "require('./cli/init.js'); console.log('init.js loads')"
  ```
  Expected output: `init.js loads`

- [ ] **Step 11: Prove the pinned call ordering survived.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js
  ```
  Expected final line: `19 passed, 0 failed`

- [ ] **Step 12: Prove a real `init` still records config end to end.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/update-harness-config.test.js && node cli/init-input.test.js && node cli/knowledge-config.test.js
  ```
  Expected: `20 passed, 0 failed`, then `12 passed, 0 failed`, then `38 passed, 0 failed` — the
  third count as this task ran; `40` today, per Task 8 fix round 1.

- [ ] **Step 13: Prove nothing still references the deleted module.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -rn "vault-config\|parseVaultAnswer\|writeVaultConfig\|VAULT_PROMPT" cli/ package.json || echo "clean"
  ```
  Expected output: `clean`

- [ ] **Step 14: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add -A cli package.json && git commit -m "refactor(cli): init records knowledge{local,shared}; retire vault-config"
  ```
  Expected output contains: `7 files changed`

---

### Task 3: The KB scaffold and its mechanical gate

**Files:**
- Create `template/.claude/references/knowledge-base-scaffold/_index.md`, `architecture.md`, `decisions.md`, `resources.md`, `runbook.md`, `inbox/_index.md`, `research/_index.md`
- Create `tools/kb-check.mjs`
- Test: create `cli/kb-check.test.js`
- Modify `cli/index.js` (add the `kb-check` case + one help line)
- Modify `package.json` (`files` array, test scripts)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `tools/kb-check.mjs` reachable as `npx perfect-harness-engineering kb-check` and as `node tools/kb-check.mjs [kbDir] [--scaffold <dir>]`; the scaffold path `template/.claude/references/knowledge-base-scaffold/`. Task 5 wires the command into `AGENTS.md` + `/validate`; Task 6 tells the architect agent to copy the scaffold; Task 10 makes the placeholder gate cover `knowledge-base/`.

- [ ] **Step 1: Create `template/.claude/references/knowledge-base-scaffold/_index.md`:**
  ```markdown
  ---
  type: index
  folder: knowledge-base
  updated: YYYY-MM-DD
  tags:
    - index
  ---

  # Knowledge base — <Project Name>

  **The project-scoped store.** Everything an agent needs to know about THIS product that the code
  cannot tell it. Git-tracked, reviewed in the PR, travelling with the code branch.

  > [!info] Navigation — 3 reads to anything
  > 1. this map · 2. the file it names · 3. the section that file names.

  ## Contents

  - [[architecture]] — module map, `## Boundaries`, data flow. `architect-agent` writes it.
  - [[decisions]] — ADRs: what was chosen and why. `architect-agent` appends.
  - [[runbook]] — how to run/deploy/drive the app, plus known failure classes.
  - [[resources]] — links, infra, and a credentials INDEX (pointers only, never values).
  - [[inbox/_index|inbox/]] — raw project capture, untriaged.
  - [[research/_index|research/]] — project research and the briefs this repo cites.

  ## Promoted out — pointers only

  <!-- /evolve MOVES a generalized fact to the shared store and leaves ONE line here.
       Shape: - topic → `wiki/<path>` (moved YYYY-MM-DD). Never a copy of the content. -->

  - _(nothing promoted yet)_

  ## Agent SOP

  1. Read this map, then ONLY the file your question needs. Never load the whole KB.
  2. Writing? Update the Contents list above in the SAME change and bump `updated:` (Index Law).
  3. Generalizes past this project? Do NOT copy it to the shared store — `/evolve` MOVES it.
  4. Secrets never land here. Record where a credential lives, never its value.
  ```

- [ ] **Step 2: Create `template/.claude/references/knowledge-base-scaffold/architecture.md`:**
  ````markdown
  ---
  type: note
  project: <Project Name>
  updated: YYYY-MM-DD
  tags:
    - architecture
  ---

  # Architecture — <Project Name>

  How the product is built. High-level enough to stay true; link to code for detail.
  `architect-agent` RECORDs here after every verified structural change.

  ## Stack

  - **Language / runtime:** <lang@version>
  - **Framework:** <framework>
  - **Datastore:** <engine>
  - **Hosting / infra:** <where it runs>

  ## Module map

  | Dir | Owns | Entry point |
  |---|---|---|
  | `<backend-dir>/routes/` | HTTP layer only — parse → service → envelope | `<file>` |
  | `<backend-dir>/services/` | Business logic: rules, calculations, workflows | `<file>` |
  | `<frontend-dir>/components/` | Product UI composed from primitives | `<file>` |
  | `<shared-dir>/` | Cross-cutting types/utils used by ≥2 areas | `<file>` |

  ## Where new code goes

  - New endpoint → `<backend-dir>/routes/` (thin) with logic in `services/`. Canonical pattern: `<file:line>`.
  - New UI → `<frontend-dir>/components/`; a shared component only at the third consumer — copy twice first.
  - Needed by ≥2 areas → `<shared-dir>/` — types and utils only, never app logic.

  ## Boundaries

  What never imports what. `code-reviewer` reads THIS section; a violation is a review blocker.

  - `<frontend-dir>` never imports from `<backend-dir>`; shared types live in `<shared-dir>`. (traces to: `<incident>`)
  - Only `<data-layer-dir>` touches the DB. (traces to: `<incident>`)
  - Verify after any cross-module import: `<boundary-check-cmd>`.

  ## Data flow

  ```mermaid
  graph LR
      A[Client] --> B[API]
      B --> C[(DB)]
  ```

  ## Integration points

  - <external service, API, webhook, or sibling project this depends on or feeds>

  ## Open questions

  - <unresolved design question>
  ````

- [ ] **Step 3: Create `template/.claude/references/knowledge-base-scaffold/decisions.md`:**
  ```markdown
  ---
  type: adr
  project: <Project Name>
  updated: YYYY-MM-DD
  tags:
    - decisions
  ---

  # Decisions — <Project Name>

  Architecture Decision Records. Newest first. Each captures **what** was chosen and **why**, so
  future-you (and the agent) do not relitigate settled calls. `/review-branch` reads the
  BASE-branch copy of this file and flags any diff that contradicts a recorded decision without
  superseding it.

  ## ADR-001 — <one-line title>

  - **Date:** YYYY-MM-DD
  - **Status:** accepted <!-- proposed | accepted | superseded by ADR-00N -->
  - **Context:** <the problem and the forces at play>
  - **Decision:** <what was chosen>
  - **Consequences:** <trade-offs, follow-ups, what this rules out>

  <!-- Copy the block above for each new decision. Never rewrite a superseded ADR's text —
       add a new one and mark the old one `superseded by ADR-00N`. -->
  ```

- [ ] **Step 4: Create `template/.claude/references/knowledge-base-scaffold/resources.md`:**
  ```markdown
  ---
  type: note
  project: <Project Name>
  updated: YYYY-MM-DD
  tags:
    - resources
  ---

  # Resources — <Project Name>

  Where everything lives: the deploys, the dashboards, and POINTERS to credentials.

  ## Links

  | What | Where |
  |---|---|
  | Production | <url> |
  | Staging | <url> |
  | CI / CD | <url> |
  | Issue tracker | <url> |
  | Design / docs | <url> |

  ## Infrastructure

  - **Hosting:** <provider>
  - **Database:** <engine and where it runs>
  - **Domains / DNS:** <registrar>
  - **Third-party services:** <list>

  ## Credentials INDEX

  > [!danger] Pointers only — this file is git-tracked and may be published
  > Record **where** a credential lives, never the value itself. `.claude/hooks/guard.mjs`
  > denies a secret-shaped write here, and `kb-check` fails the gate on one.
  > A pointer that itself looks secret-shaped is waived one line at a time by appending
  > `<!-- kb-check:allow -->` to that line; the waiver is visible in the diff.

  | Credential | Lives in | Notes |
  |---|---|---|
  | <name, e.g. deploy key> | <password manager or platform secret store> | <rotation cadence> |

  ## External references

  - <spec, contract, or doc this product is built against>
  ```

- [ ] **Step 5: Create `template/.claude/references/knowledge-base-scaffold/runbook.md`:**
  ```markdown
  ---
  type: note
  project: <Project Name>
  updated: YYYY-MM-DD
  tags:
    - runbook
  ---

  # Runbook — <Project Name>

  How to run, deploy and operate the product, plus the failure classes this repo has actually hit.
  `debugging-this-repo` reads this BEFORE diagnosing; `/validate` hands it to `qa-evaluator` as the
  how-to-drive reference.

  ## Setup · run · test · deploy

  | Step | Command | Requires first |
  |---|---|---|
  | Setup | `<cmd>` | <prereq> |
  | Run | `<cmd>` | <prereq> |
  | Test | `<cmd>` | <prereq> |
  | Deploy | `<cmd>` | <prereq> |

  ## Logs & observability

  Where to look BEFORE reproducing — a log line is cheaper than a repro.

  | Source | Where | Read with |
  |---|---|---|
  | Local run | `<path or stdout>` | `<cmd>` |
  | Test output | `<path>` | `<cmd>` |
  | Deployed | `<dashboard or URL>` | `<cmd or link>` |

  Raise verbosity: `<flag or env-var>`.

  ## Repro recipes

  - One failing test in isolation: `<cmd>`
  - Full local stack: `<cmd>` — requires `<service>` running first.

  ## Known failure classes

  Each row: symptom (grep-able) → cause → fix → the incident it traces to.

  | Symptom | Cause | Fix | Traces to |
  |---|---|---|---|
  | `<exact error text>` | `<root cause>` | `<verified fix cmd>` | `<incident>` |

  ## Before blaming the framework

  1. `<env-var>` set? Unset silently hits the wrong target — check FIRST when data looks wrong.
  2. Toolchain versions match `<version file>`?
  3. Stale build or cache: `<clean cmd>`.
  ```

- [ ] **Step 6: Create `template/.claude/references/knowledge-base-scaffold/inbox/_index.md`:**
  ```markdown
  ---
  type: index
  folder: knowledge-base/inbox
  updated: YYYY-MM-DD
  tags:
    - index
  ---

  # knowledge-base / inbox

  **Raw project capture.** Anything learned mid-work that has no home yet. Nothing here is
  quotable as fact until it graduates into `architecture.md` / `decisions.md` / `runbook.md` /
  `resources.md`.

  Tool and library research is NOT captured here — that stages in the SHARED store's
  `inbox/research/` and graduates to `wiki/stack/<tool>/`. See
  `.claude/references/knowledge-protocol.md`.

  ## Contents

  <!-- One line per capture: - [[note]] — what it is, and which core file it should graduate into. -->

  - _(empty)_

  ## Agent SOP

  1. Capture fast here; triage at `/evolve`, not mid-task.
  2. Moving a note out → delete it here and update Contents above in the same change (Index Law).
  3. A capture that contradicts a core file is a conflict for the human, never a silent overwrite.
  ```

- [ ] **Step 7: Create `template/.claude/references/knowledge-base-scaffold/research/_index.md`:**
  ```markdown
  ---
  type: index
  folder: knowledge-base/research
  updated: YYYY-MM-DD
  tags:
    - index
  ---

  # knowledge-base / research

  **Project research, and the briefs this repo actually cites.** A brief lands here only when a
  plan, an ADR or a rule cites it; uncited exploration stays in the shared store's `inbox/research/`.

  ## Contents

  <!-- One line per brief: - [[brief]] — topic, and what cites it (plan / ADR / rule path). -->

  - _(empty)_

  ## Agent SOP

  1. Before researching, check here AND the shared `wiki/stack/<tool>/` — never re-derive.
  2. Every brief carries `doc-sources:` (URL + version) or `sources:` (repo file paths), so it
     stays re-verifiable against reality.
  3. A brief that generalizes past this project is MOVED to the shared store by `/evolve`, never
     copied.
  ```

- [ ] **Step 8: Write the failing test.** Create `cli/kb-check.test.js`:
  ```js
  // cli/kb-check.test.js
  //
  // tools/kb-check.mjs is the /validate + /evolve gate on a project-local knowledge base.
  // Driven as a REAL process (it is ESM; require() cannot load it), so the exit CODE — the
  // only thing a gate is ever judged by — is what these asserts read.
  //
  // These asserts are written to KILL MUTANTS, not to describe happy paths. An earlier
  // version of this suite passed 12/12 against four separately broken implementations: the
  // secret regex reduced to AWS-only, subdirs() walking one level instead of recursing, (b)
  // comparing byte LENGTH instead of byte CONTENT, and (c) scanning only resources.md. Each
  // of those is now pinned by a fixture that fails when the behaviour is removed.

  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const crypto = require('crypto');
  const { spawnSync } = require('child_process');

  var passed = 0;
  var failed = 0;
  function assert(name, condition) {
    if (condition) { console.log('  PASS: ' + name); passed++; }
    else { console.log('  FAIL: ' + name); failed++; }
  }

  const KB_CHECK = path.join(__dirname, '..', 'tools', 'kb-check.mjs');
  const SCAFFOLD = path.join(__dirname, '..', 'template', '.claude', 'references', 'knowledge-base-scaffold');
  const TEST_DIR = path.join(os.tmpdir(), 'kb-check-test-' + crypto.randomUUID());

  function run(args) {
    var r = spawnSync(process.execPath, [KB_CHECK].concat(args), { encoding: 'utf-8' });
    var out = (r.stdout || '') + (r.stderr || '');
    // A missing or broken script must fail EVERY assert, not accidentally satisfy the ones
    // that only look for a red exit code — a script that crashes on every invocation also
    // exits non-zero. Any stack frame in kb-check.mjs, a syntax error or a failed import
    // poisons the result into a code no assert accepts.
    if (/Cannot find module|SyntaxError|^\s+at .*kb-check\.mjs/m.test(out)) return { code: -1, out: out };
    return { code: r.status, out: out };
  }

  function countOf(haystack, needle) {
    return haystack.split(needle).length - 1;
  }

  // Walked here rather than hardcoded so adding a file to the scaffold cannot silently
  // weaken the "every placeholder is reported" assert below.
  function walkFiles(dir) {
    var out = [];
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var p = path.join(dir, entries[i].name);
      if (entries[i].isDirectory()) out = out.concat(walkFiles(p));
      else out.push(p);
    }
    return out;
  }
  const SCAFFOLD_FILE_COUNT = walkFiles(SCAFFOLD).length;

  console.log('the shipped scaffold:');
  var self = run([SCAFFOLD, '--scaffold', SCAFFOLD]);
  assert('the shipped scaffold is GREEN', self.code === 0);
  assert('(b) is skipped when the checked dir IS the scaffold', self.out.indexOf('(b) skipped') !== -1);
  assert('the shipped scaffold carries no secret-shaped string of its own', self.out.indexOf('(c)') === -1);

  console.log('(a) Index Law:');
  var A = path.join(TEST_DIR, 'a');
  fs.mkdirSync(path.join(A, 'research'), { recursive: true });
  fs.writeFileSync(path.join(A, '_index.md'), '# kb\n');
  var a = run([A, '--scaffold', SCAFFOLD]);
  assert('a folder with no _index.md is RED', a.code === 1);
  assert('the finding names the folder', a.out.indexOf('(a) no _index.md in research/') !== -1);
  fs.writeFileSync(path.join(A, 'research', '_index.md'), '# research\n');
  assert('adding the _index.md turns it GREEN', run([A, '--scaffold', SCAFFOLD]).code === 0);

  // subdirs() must recurse to ARBITRARY depth. A one-level walk satisfies every shallow
  // fixture above while leaving every nested folder in a real knowledge base unchecked.
  var A3 = path.join(TEST_DIR, 'a3');
  fs.mkdirSync(path.join(A3, 'one', 'two', 'three'), { recursive: true });
  fs.writeFileSync(path.join(A3, '_index.md'), '# depth root\n');
  fs.writeFileSync(path.join(A3, 'one', '_index.md'), '# one\n');
  fs.writeFileSync(path.join(A3, 'one', 'two', '_index.md'), '# two\n');
  var a3 = run([A3, '--scaffold', SCAFFOLD]);
  assert('(a) reaches a folder three levels down', a3.code === 1);
  assert('the depth-3 finding names the nested path',
    a3.out.indexOf('(a) no _index.md in ' + path.join('one', 'two', 'three') + '/') !== -1);
  fs.writeFileSync(path.join(A3, 'one', 'two', 'three', '_index.md'), '# three\n');
  assert('filling the depth-3 _index.md turns it GREEN', run([A3, '--scaffold', SCAFFOLD]).code === 0);

  console.log('(b) untouched scaffold placeholders:');
  var B = path.join(TEST_DIR, 'b');
  fs.cpSync(SCAFFOLD, B, { recursive: true });
  var b = run([B, '--scaffold', SCAFFOLD]);
  assert('a byte-identical copy of the scaffold is RED', b.code === 1);
  assert('the finding names architecture.md', b.out.indexOf('(b) still the shipped placeholder: architecture.md') !== -1);
  assert('EVERY placeholder is reported, not just the first',
    countOf(b.out, '(b) still the shipped placeholder:') === SCAFFOLD_FILE_COUNT);

  // Byte IDENTITY, not byte COUNT. Comparing lengths passes every "I edited it" fixture
  // that happens to change the file size, while a same-length edit — a filled-in <placeholder>
  // of equal width, a corrected date — would still be reported as untouched forever.
  var archOriginal = fs.readFileSync(path.join(SCAFFOLD, 'architecture.md'));
  var sameLength = Buffer.from(archOriginal);
  sameLength[0] = sameLength[0] === 0x23 ? 0x2a : 0x23; // '#' <-> '*': one byte, same length
  fs.writeFileSync(path.join(B, 'architecture.md'), sameLength);
  assert('the edited file still has the scaffold byte LENGTH',
    fs.readFileSync(path.join(B, 'architecture.md')).length === archOriginal.length);
  var bEdited = run([B, '--scaffold', SCAFFOLD]);
  assert('a same-LENGTH but different-CONTENT file is no longer a placeholder',
    bEdited.out.indexOf('placeholder: architecture.md') === -1);
  assert('and the remaining placeholders are still RED',
    bEdited.code === 1 &&
    countOf(bEdited.out, '(b) still the shipped placeholder:') === SCAFFOLD_FILE_COUNT - 1);

  console.log('(c) secret shapes:');
  var C = path.join(TEST_DIR, 'c');
  fs.mkdirSync(path.join(C, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(C, '_index.md'), '# kb\n');
  fs.writeFileSync(path.join(C, 'inbox', '_index.md'), '# inbox\n');
  fs.writeFileSync(path.join(C, 'resources.md'), '# Resources\n\nDeploy key lives in 1Password — pointer only.\n');
  assert('a credentials INDEX (pointers only) is GREEN', run([C, '--scaffold', SCAFFOLD]).code === 0);

  // One assert per credential FAMILY, and every one of them written into inbox/ rather than
  // resources.md: a scan scoped to the single filename its fixture happened to use is not a
  // scan of the knowledge base. Each string is a real-format sample of that vendor's key.
  var FAMILIES = [
    ['an AWS access key id', 'aws_key: AKIAIOSFODNN7EXAMPLE'],
    ['an Anthropic API key', 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
    ['an OpenAI project key', 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
    ['a GitHub fine-grained PAT', 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz1234'],
    ['a GitHub OAuth token', 'gho_16C7e42F292c6912E7710c838347Ae178B4a'],
    ['a Stripe live secret key', 'sk_' . 'live_' . 'x' x 24],
    ['a Slack bot token', 'xox' . 'b-' . '0' x 12],
    ['a Google API key', 'AIzaSyD-1234567890abcdefghijklmnopqrstu'],
    ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
    ['an aws_secret_access_key assignment', 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
    ['a PEM private key header', '-----BEGIN RSA PRIVATE KEY-----'],
  ];
  var LEAK = path.join(C, 'inbox', 'leak.md');
  for (var fi = 0; fi < FAMILIES.length; fi++) {
    fs.writeFileSync(LEAK, '# note\n\n' + FAMILIES[fi][1] + '\n');
    var fam = run([C, '--scaffold', SCAFFOLD]);
    assert(FAMILIES[fi][0] + ' anywhere in the KB is RED',
      fam.code === 1 && fam.out.indexOf('(c) secret-shaped string: inbox/leak.md:3') !== -1);
  }
  fs.rmSync(LEAK);
  assert('removing the leaked file turns it GREEN again', run([C, '--scaffold', SCAFFOLD]).code === 0);

  // Prose that merely uses the vocabulary must not fire, or the gate gets disabled by whoever
  // hits it third.
  fs.writeFileSync(path.join(C, 'inbox', 'prose.md'),
    '# note\n\nThe API key rotation runbook lives in the runbook. We use a token bucket.\n');
  assert('prose about tokens and API keys is GREEN', run([C, '--scaffold', SCAFFOLD]).code === 0);

  console.log('dotfiles are content; only named plumbing is skipped:');
  var D = path.join(TEST_DIR, 'd');
  fs.mkdirSync(path.join(D, '.obsidian'), { recursive: true });
  fs.writeFileSync(path.join(D, '_index.md'), '# kb\n');
  fs.writeFileSync(path.join(D, '.obsidian', 'app.json'), '{"apiKey":"AKIAIOSFODNN7EXAMPLE"}\n');
  assert('.obsidian/ is operator plumbing and stays ignored', run([D, '--scaffold', SCAFFOLD]).code === 0);

  // A dotfile is still git-tracked and still published. Skipping everything starting with "."
  // was a universal bypass of the only secrets check: knowledge-base/.secrets.md passed GREEN
  // with a live AWS key in it.
  fs.writeFileSync(path.join(D, '.secrets.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
  var dFile = run([D, '--scaffold', SCAFFOLD]);
  assert('a secret in a DOTFILE is RED',
    dFile.code === 1 && dFile.out.indexOf('(c) secret-shaped string: .secrets.md:1') !== -1);
  fs.rmSync(path.join(D, '.secrets.md'));

  fs.mkdirSync(path.join(D, '.private'), { recursive: true });
  fs.writeFileSync(path.join(D, '.private', '_index.md'), '# private\n');
  fs.writeFileSync(path.join(D, '.private', 'x.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
  var dDir = run([D, '--scaffold', SCAFFOLD]);
  assert('a secret in a DOT-DIRECTORY is RED',
    dDir.code === 1 && dDir.out.indexOf('(c) secret-shaped string: ' + path.join('.private', 'x.md') + ':1') !== -1);
  fs.rmSync(path.join(D, '.private'), { recursive: true });
  assert('.obsidian/ is STILL ignored once the real dotfiles are gone',
    run([D, '--scaffold', SCAFFOLD]).code === 0);

  console.log('the <!-- kb-check:allow --> escape hatch:');
  // The spec REQUIRES resources.md to carry credential POINTERS, which are shaped exactly like
  // the thing being hunted. Without a hatch the gate false-positives on its own scaffold's
  // documented use and gets switched off.
  var E = path.join(TEST_DIR, 'e');
  fs.mkdirSync(E, { recursive: true });
  fs.writeFileSync(path.join(E, '_index.md'), '# kb\n');
  var POINTER_LINES = [
    'password: 1Password/Shared-Engineering',
    'token: stored-in-github-actions-secrets',
    'api_key: AWS-Secrets-Manager/prod/app',
  ];
  fs.writeFileSync(path.join(E, 'resources.md'), '# Resources\n\n' + POINTER_LINES.join('\n') + '\n');
  var e1 = run([E, '--scaffold', SCAFFOLD]);
  assert('realistic credential POINTERS do trip the widened regex without the hatch',
    e1.code === 1 && countOf(e1.out, '(c) secret-shaped string:') === POINTER_LINES.length);
  var allowed = POINTER_LINES.map(function (l) { return l + ' <!-- kb-check:allow -->'; });
  fs.writeFileSync(path.join(E, 'resources.md'), '# Resources\n\n' + allowed.join('\n') + '\n');
  assert('the same pointers with <!-- kb-check:allow --> are GREEN', run([E, '--scaffold', SCAFFOLD]).code === 0);
  // The hatch is LINE-scoped: waiving three pointer lines must not disarm the whole file.
  fs.appendFileSync(path.join(E, 'resources.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
  var e3 = run([E, '--scaffold', SCAFFOLD]);
  assert('the hatch is line-scoped — a real key elsewhere in the file is still RED',
    e3.code === 1 && countOf(e3.out, '(c) secret-shaped string:') === 1);

  console.log('symlinks are followed for content, never crashed on:');
  // Widening the walker to `e.isFile() || e.isSymbolicLink()` fed symlinks straight into
  // readFileSync: ENOENT on a dangling link, EISDIR on a link to a directory. Because findings
  // are only flushed at the end, ONE bad link turned a KB holding a real credential into a Node
  // stack trace and zero reported findings — fail-closed on the exit code, fail-OPEN on the
  // information. Every fixture below therefore carries a real AWS key in a normal file, and
  // asserts that BOTH findings survive: the exit code alone cannot tell a crash from a catch.
  var S = path.join(TEST_DIR, 'symlink');
  fs.mkdirSync(path.join(S, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(S, '_index.md'), '# kb\n');
  fs.writeFileSync(path.join(S, 'sub', '_index.md'), '# sub\n');

  // A symlinked note is as published as a copied one, so a resolvable link is still SCANNED.
  fs.writeFileSync(path.join(S, 'sub', 'real.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
  fs.symlinkSync(path.join(S, 'sub', 'real.md'), path.join(S, 'link-to-file.md'));
  var sFile = run([S, '--scaffold', SCAFFOLD]);
  assert('a symlink to a real file is still scanned for secrets',
    sFile.code === 1 && sFile.out.indexOf('(c) secret-shaped string: link-to-file.md:1') !== -1);
  fs.rmSync(path.join(S, 'link-to-file.md'));
  fs.rmSync(path.join(S, 'sub', 'real.md'));

  // Case 1: DANGLING link (ENOENT). The co-located key is the assert that would have caught
  // the regression — a crash reports neither, a catch reports both.
  fs.writeFileSync(path.join(S, 'leak.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
  fs.symlinkSync(path.join(S, 'no-such-target.md'), path.join(S, 'broken.md'));
  var sDangling = run([S, '--scaffold', SCAFFOLD]);
  assert('a DANGLING symlink is reported, not crashed on',
    sDangling.code === 1 && sDangling.out.indexOf('(c) UNREADABLE symlink: broken.md') !== -1);
  assert('the dangling symlink does not suppress a real key elsewhere in the KB',
    sDangling.out.indexOf('(c) secret-shaped string: leak.md:1') !== -1);
  fs.rmSync(path.join(S, 'broken.md'));

  // Case 2: link to a DIRECTORY (EISDIR). Reported rather than skipped for the same reason
  // (b) NOT RUN is reported: an unscannable path is an unscanned subtree, not a clean one.
  fs.symlinkSync(path.join(S, 'sub'), path.join(S, 'dirlink'));
  var sDir = run([S, '--scaffold', SCAFFOLD]);
  assert('a symlink to a DIRECTORY is reported, not crashed on',
    sDir.code === 1 && sDir.out.indexOf('(c) UNREADABLE symlink: dirlink') !== -1);
  assert('the directory symlink does not suppress a real key elsewhere in the KB',
    sDir.out.indexOf('(c) secret-shaped string: leak.md:1') !== -1);
  fs.rmSync(path.join(S, 'dirlink'));
  fs.rmSync(path.join(S, 'leak.md'));
  assert('the KB is GREEN again once the bad links and the key are gone',
    run([S, '--scaffold', SCAFFOLD]).code === 0);

  console.log('missing knowledge base:');
  assert('a missing knowledge-base/ is RED, not a silent pass',
    run([path.join(TEST_DIR, 'nope'), '--scaffold', SCAFFOLD]).code === 1);

  console.log('a check that could not RUN is not a check that passed:');
  // The blocker this suite missed: an entirely unfilled knowledge base reported GREEN whenever
  // the scaffold was not where the tool guessed — which is the default in every repo whose
  // .claude/ has no references/, including this one.
  var U = path.join(TEST_DIR, 'unfilled');
  fs.cpSync(SCAFFOLD, U, { recursive: true });
  var bogus = run([U, '--scaffold', path.join(TEST_DIR, 'no-such-scaffold')]);
  assert('an unfilled KB with a bogus --scaffold is RED, not "skipped"', bogus.code === 1);
  assert('the finding says NOT RUN and names the missing scaffold', bogus.out.indexOf('(b) NOT RUN') !== -1);

  console.log('argv is parsed strictly:');
  // A gate that mis-parses its own invocation silently checks the wrong directory. The exit
  // CODE alone cannot pin this: the lax parser ALSO exits 1, because its mis-parse falls
  // through to a default scaffold path that does not exist and trips (b) NOT RUN. The
  // rejection MESSAGE is the only thing that separates "refused the argv" from "failed for an
  // unrelated reason" — asserting the code alone let all four of these pass against the bug.
  var noValue = run([U, '--scaffold']);
  assert('a valueless --scaffold is rejected by name',
    noValue.code === 1 && noValue.out.indexOf('--scaffold requires a directory argument') !== -1);
  var flagValue = run([U, '--scaffold', '--verbose']);
  assert('--scaffold followed by another flag is rejected by name',
    flagValue.code === 1 && flagValue.out.indexOf('--scaffold requires a directory argument') !== -1);
  var unknown = run([U, '--bogus']);
  assert('an unknown flag is rejected by name',
    unknown.code === 1 && unknown.out.indexOf('unknown flag --bogus') !== -1);
  // Two REAL directories, so a lax parser silently prefers the second and checks the wrong KB.
  var twoPos = run([A, U]);
  assert('a second positional is rejected, not silently preferred',
    twoPos.code === 1 && twoPos.out.indexOf('unexpected second positional argument') !== -1);

  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
  ```

- [ ] **Step 9: Run it and see it fail.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/kb-check.test.js
  ```
  Expected final line: `3 passed, 46 failed` (exit 1). The three passes are vacuous while the script prints nothing: two assert the ABSENCE of a substring in empty output, and one is a pure `fs` fact about the fixture that never calls the tool.

- [ ] **Step 10: Write `tools/kb-check.mjs`:**
  ```js
  #!/usr/bin/env node
  // kb-check: the three MECHANICAL checks on a project-local knowledge base.
  //   node tools/kb-check.mjs [kbDir] [--scaffold <dir>]
  // Defaults: kbDir = ./knowledge-base, scaffold = ./.claude/references/knowledge-base-scaffold
  //
  // Only three things about a KB are decidable without reading it for meaning, and those are
  // the only three claimed here:
  //   (a) every folder under the KB has an _index.md            (the Index Law)
  //   (b) no KB file is byte-identical to its shipped scaffold placeholder
  //   (c) no secret-shaped string appears anywhere in the KB
  // "The _index.md is ACCURATE" is semantic and is deliberately NOT claimed.
  // Exit 0 = green, 1 = red. Findings print one per line.
  import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
  import { join, resolve, relative } from "node:path";

  // This literal is the source of truth today. `.claude/hooks/guard.mjs` does NOT yet carry
  // it — a later increment lands the same regex there as `KB_SECRET`, DUPLICATED rather than
  // imported (hooks are copied standalone into adopter repos and must stay dependency-free
  // and copy-safe). Once it lands: guard.mjs blocks the WRITE, this blocks the COMMIT, and a
  // smoke-test assert must pin the two regex source strings byte-identical.
  //
  // Shape detection, not entropy. Every alternative below was probed against a real
  // credential of that vendor's current format; the narrower predecessor caught only AKIA,
  // PEM headers and bare `key: value`, and was blind to Anthropic, OpenAI, GitHub, Stripe,
  // Slack, Google and JWT shapes.
  const SECRET_SHAPE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-(?:proj|ant|[a-z]{2,8})-[A-Za-z0-9_\-]{20,}|\bsk-[A-Za-z0-9]{20,}|\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abprs]-[A-Za-z0-9-]{20,}|\bAIza[A-Za-z0-9_\-]{35}\b|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}|(?:password|passwd|api[_-]?key|secret|token)[A-Za-z0-9_.\-]*\s*[:=]\s*["']?[A-Za-z0-9_\-+/]{12,})/i;

  // Argv is parsed strictly. A gate that mis-parses its own invocation checks the wrong
  // directory and says GREEN: a valueless `--scaffold` used to fall through to the default,
  // and a stray second positional silently overwrote the first.
  const USAGE = "usage: kb-check [kbDir] [--scaffold <dir>]";
  let kbArg = null, scaffoldArg = null;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--scaffold") {
      scaffoldArg = argv[++i];
      if (scaffoldArg === undefined || scaffoldArg.slice(0, 2) === "--") {
        console.log(`kb-check: --scaffold requires a directory argument. ${USAGE}`);
        process.exit(1);
      }
    } else if (argv[i].slice(0, 2) === "--") {
      console.log(`kb-check: unknown flag ${argv[i]}. ${USAGE}`);
      process.exit(1);
    } else if (kbArg !== null) {
      console.log(`kb-check: unexpected second positional argument ${argv[i]} — ${USAGE}`);
      process.exit(1);
    } else {
      kbArg = argv[i];
    }
  }
  const kbDir = resolve(kbArg || "knowledge-base");
  const scaffoldDir = resolve(scaffoldArg || join(".claude", "references", "knowledge-base-scaffold"));

  if (!existsSync(kbDir)) {
    console.log(`kb-check: ${kbDir} does not exist — the project has no knowledge base yet.`);
    process.exit(1);
  }

  // Named plumbing only. The earlier rule — skip everything starting with "." — was written
  // for .obsidian/ (operator-owned, gitignored) and generalised into a universal bypass of the
  // secrets check: a credential in knowledge-base/.secrets.md passed GREEN. Dotfiles are still
  // git-tracked and still published. Symlinks are followed for content because a symlinked
  // note is as published as a copied one.
  const PLUMBING = new Set([".obsidian", ".git", ".claude"]);

  function subdirs(dir) {
    const out = [dir];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !PLUMBING.has(e.name)) out.push(...subdirs(join(dir, e.name)));
    }
    return out;
  }

  function allFiles(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (PLUMBING.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...allFiles(p));
      else if (e.isFile()) out.push(p);
      // A symlink is followed only once it is CONFIRMED to resolve to a regular file. Handing
      // one straight to readFileSync crashes the whole run — ENOENT on a dangling link, EISDIR
      // on a link to a directory — and `findings` is not flushed until the end, so a KB holding
      // a real credential printed a stack trace and reported nothing. Fail-closed on the exit
      // code but fail-OPEN on the information is strictly worse than never following links.
      // A link that does not resolve to a file is REPORTED, not skipped: same rule as (b) NOT
      // RUN — an unscannable path is an unscanned subtree, not a clean one.
      else if (e.isSymbolicLink()) {
        let readable = false;
        try { readable = statSync(p).isFile(); } catch { readable = false; }
        if (readable) out.push(p);
        else findings.push(`(c) UNREADABLE symlink: ${relative(kbDir, p)}`);
      }
    }
    return out;
  }

  const findings = [];

  // (a) Index Law
  for (const d of subdirs(kbDir)) {
    if (!existsSync(join(d, "_index.md"))) {
      findings.push(`(a) no _index.md in ${relative(kbDir, d) || "."}/`);
    }
  }

  const files = allFiles(kbDir);

  // (b) untouched scaffold placeholders
  if (kbDir === scaffoldDir) {
    console.log("kb-check: (b) skipped — the checked dir IS the shipped scaffold.");
  } else if (!existsSync(scaffoldDir)) {
    // A check that could not RUN is not a check that PASSED. Skipping this one silently
    // turned an entirely unfilled knowledge base into a GREEN gate.
    findings.push(`(b) NOT RUN — no scaffold at ${scaffoldDir}. Placeholders are unchecked; pass --scaffold <dir>.`);
  } else {
    for (const f of files) {
      const twin = join(scaffoldDir, relative(kbDir, f));
      if (!existsSync(twin)) continue;
      if (readFileSync(f).equals(readFileSync(twin))) {
        findings.push(`(b) still the shipped placeholder: ${relative(kbDir, f)}`);
      }
    }
  }

  // (c) secret shapes
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Escape hatch. resources.md exists to hold credential POINTERS ("password:
      // 1Password/Shared-Engineering"), which are shaped exactly like the thing being
      // hunted. Line-scoped and explicit: an author waives the check one line at a time,
      // and the waiver is visible in the diff.
      if (lines[i].indexOf("<!-- kb-check:allow -->") !== -1) continue;
      if (SECRET_SHAPE.test(lines[i])) {
        findings.push(`(c) secret-shaped string: ${relative(kbDir, f)}:${i + 1}`);
      }
    }
  }

  for (const f of findings) console.log(f);
  console.log(findings.length
    ? `\nkb-check: RED — ${findings.length} finding(s) in ${kbDir}`
    : `kb-check: GREEN — ${files.length} file(s) in ${kbDir}`);
  process.exit(findings.length ? 1 : 0);
  ```

- [ ] **Step 11: Run it and see it pass.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/kb-check.test.js
  ```
  Expected final line: `49 passed, 0 failed` (exit 0). Stays 49 here on purpose: Task 9 Step 10 adds
  a 50th assert, but `KB_SECRET` does not exist yet at this point in the sequence.

- [ ] **Step 12: Run the tool against the scaffold directly (the acceptance command).**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node tools/kb-check.mjs template/.claude/references/knowledge-base-scaffold --scaffold template/.claude/references/knowledge-base-scaffold; echo "exit=$?"
  ```
  Expected output:
  ```
  kb-check: (b) skipped — the checked dir IS the shipped scaffold.
  kb-check: GREEN — 7 file(s) in /Users/cristian-robertiosef/Dev/perfectHarnessEngineering/template/.claude/references/knowledge-base-scaffold
  exit=0
  ```

- [ ] **Step 13: Route the subcommand.** In `cli/index.js`, insert this case immediately after the `file-size-check` case (which ends at `:45` with `}`), before `case '--version':`:
  ```js
    case 'kb-check': {
      // The three mechanical checks on the project's knowledge-base/ (index law, unfilled
      // placeholders, secret shapes). Routed to tools/kb-check.mjs exactly like
      // file-size-check routes to the ledger; the default scaffold path resolves against
      // the CONSUMER's .claude/references/, which is where init installed it.
      const kbPath = require('path');
      const kbSpawn = require('child_process').spawnSync;
      const kbTool = kbPath.join(__dirname, '..', 'tools', 'kb-check.mjs');
      const kbResult = kbSpawn(process.execPath, [kbTool, ...process.argv.slice(3)], { stdio: 'inherit' });
      process.exit(kbResult.status === null ? 1 : kbResult.status);
      break;
    }
  ```
  And add one help line to `cli/index.js:61`, directly after the `file-size-check` line:
  ```
    npx perfect-harness-engineering kb-check         Check knowledge-base/ — index law, unfilled placeholders, secret shapes
  ```

- [ ] **Step 14: Pack the tool and wire the test script.** In `package.json:15` replace
  ```json
    "files": ["cli/", "template/", "tools/context-ledger.mjs", "docs/*.md", "README.md"],
  ```
  with
  ```json
    "files": ["cli/", "template/", "tools/context-ledger.mjs", "tools/kb-check.mjs", "docs/*.md", "README.md"],
  ```
  In `package.json:18` and `:20`, append ` && node cli/kb-check.test.js` immediately after `node cli/knowledge-config.test.js`.

- [ ] **Step 15: Prove the CLI surface is intact and the new command runs.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add -A template/.claude/references/knowledge-base-scaffold && node cli/index.js --help | grep kb-check && node cli/cli-hardening.test.js | tail -2
  ```
  Expected output: the help line containing `kb-check`, then a blank line, then `19 passed, 0 failed`.

- [ ] **Step 16: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add -A template/.claude/references/knowledge-base-scaffold tools/kb-check.mjs cli/kb-check.test.js cli/index.js package.json && git commit -m "feat(kb): knowledge-base scaffold + kb-check gate"
  ```
  Expected output contains: `11 files changed`

---

### Task 4: Shrink `vault-scaffold/` to shared-only

**Files:**
- Delete `template/.claude/references/vault-scaffold/system/pointer-block.md`
- Delete `template/.claude/references/vault-scaffold/system/templates/project-template/_index.md`, `architecture.md`, `decisions.md`, `resources.md`, `runbook.md`
- Modify `template/.claude/references/vault-scaffold/CLAUDE.md` (7 doctrine edits, applied BOTTOM-UP by Steps 3–9 in exactly this order: `:108-110`, `:77-88`, `:41`, `:38`, `:24-31`, `:21`, `:13`)
- Modify `template/.claude/references/vault-scaffold/_index.md` (`:24`, `:36-37`)
- Modify `template/.claude/references/vault-scaffold/system/_index.md` (`:11`, `:15`, `:17`, `:21`, `:23`)
- Modify `template/.claude/references/vault-scaffold/system/templates/_index.md` (`:16`, `:21`)
- Modify `template/.claude/references/vault-scaffold/projects/_index.md` (`:12`, `:18-20`, `:22-24`, `:26-31`, `:33-38`)

**Interfaces:**
- Consumes: nothing.
- Produces: a shared-store scaffold that no longer claims to hold project knowledge. Task 5's `knowledge-protocol.md` and Task 11's `docs/05` describe the same doctrine.

- [ ] **Step 1: Delete the six files.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git rm template/.claude/references/vault-scaffold/system/pointer-block.md template/.claude/references/vault-scaffold/system/templates/project-template/_index.md template/.claude/references/vault-scaffold/system/templates/project-template/architecture.md template/.claude/references/vault-scaffold/system/templates/project-template/decisions.md template/.claude/references/vault-scaffold/system/templates/project-template/resources.md template/.claude/references/vault-scaffold/system/templates/project-template/runbook.md
  ```
  Expected output: six `rm '…'` lines.

- [ ] **Step 2: Run the dangling-reference check and see it fail (RED).**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -rn "pointer-block\|project-template" template/.claude/references/vault-scaffold/
  ```
  Expected: 13 matching lines across `CLAUDE.md` (3), `_index.md` (2), `system/_index.md` (3), `system/templates/_index.md` (2), `projects/_index.md` (3) — every one of them now points at a file that no longer exists.

- [ ] **Step 3: Doctrine edit 1 of 7 — `vault-scaffold/CLAUDE.md:108-110`.**

  > **Steps 3–9 rewrite this ONE file and run BOTTOM-UP — highest line number first.** Two of them
  > change the file's length (`:77-88`'s 12 lines become 13, +1; `:24-31`'s 8 lines become 10, +2),
  > so a top-down run would leave `:38`, `:41`, `:77-88` and `:108-110` stale by +2/+3 by the time
  > they execute — the same hazard Steps 10a–11 are already ordered bottom-up for. Every `:N` in
  > Steps 3–9 is an ORIGINAL-FILE line number, correct only because nothing above it has moved
  > yet: **match on the quoted text, never on the number.**

  Replace the whole `## Pointing a project repo at this vault` section (heading + its one paragraph) with
  ```
  ## How a repo reaches this vault

  A harnessed repo records the absolute path to this vault in its own
  `.claude/harness.json` → `knowledge.shared` (`{ "mode": "existing", "path": "<ABSOLUTE_VAULT_PATH>" }`),
  written once by `npx perfect-harness-engineering init`. There is no pointer block to paste and
  nothing to keep in sync: the repo's agents read `wiki/` and `agent-kb/` from that path.
  ```

- [ ] **Step 4: Doctrine edit 2 of 7 — `vault-scaffold/CLAUDE.md:77-88`.** Replace the whole `## Project Wiki Doctrine` section (from the heading through the `Register every new project…` paragraph) with
  ```
  ## Project Knowledge Doctrine — it is NOT here

  Each product keeps its own knowledge in its own repo, at `<repo>/knowledge-base/`: `_index.md`,
  `architecture.md`, `decisions.md`, `resources.md`, `runbook.md`, `inbox/`, `research/`. It is
  git-tracked, reviewed in the PR, and travels with the code branch — so it survives a clone,
  and every `sources:` path in it is relative and verifiable.

  This vault holds the EVERGREEN half only. When a lesson generalizes past one project, `/evolve`
  **MOVES** it here and deletes the local copy, leaving a one-line pointer in the repo's
  `knowledge-base/_index.md`. Never copy: a fact in two stores is a fork waiting to happen.

  Record every product as a row in [[projects/_index|projects/_index.md]] — repo path and status,
  not knowledge.
  ```

- [ ] **Step 5: Doctrine edit 3 of 7 — `vault-scaffold/CLAUDE.md:41`.** Replace
  ```
  - **`system/`** — Plumbing. `templates/` (project-wiki + index templates), `schemas/` (frontmatter contract), `pointer-block.md`. DO NOT TOUCH as a note dump.
  ```
  with
  ```
  - **`system/`** — Plumbing. `templates/` (the `_index.md` template), `schemas/` (frontmatter contract). DO NOT TOUCH as a note dump.
  ```

- [ ] **Step 6: Doctrine edit 4 of 7 — `vault-scaffold/CLAUDE.md:38`.** Replace
  ```
  - **`projects/`** — Stage 2 working knowledge. One subfolder per product = its wiki. `projects/_index.md` is the **project registry** (status of every project). Vault-centric: this is the single source of truth for project knowledge; repos point *here* (see [Pointing a repo at this vault](#pointing-a-project-repo-at-this-vault)).
  ```
  with
  ```
  - **`projects/`** — the **registry only**. `projects/_index.md` records, per product, where its repo and its `knowledge-base/` live. No project knowledge is stored here; a project subfolder is a migration leftover, not the shape.
  ```

- [ ] **Step 7: Doctrine edit 5 of 7 — `vault-scaffold/CLAUDE.md:24-31`.** Replace
  ````
  Mental model — **staging → working → evergreen**:

  ```
  inbox/  →  projects/<name>/  →  wiki/  +  agent-kb/
  capture     working knowledge     evergreen distillation
  ```

  Raw material lands in `inbox/`. When it's about a specific product, it graduates into that product's wiki under `projects/`. When a lesson generalizes past one project, it's harvested into `wiki/` (or `agent-kb/` if it's about building agents).
  ````
  with
  ````
  Mental model — **staging → evergreen**, with project knowledge living OUTSIDE this vault:

  ```
  <repo>/knowledge-base/  ──MOVE on generalization──>  wiki/  +  agent-kb/
  project-scoped, git-tracked                          evergreen distillation
                        inbox/  →  wiki/ + agent-kb/
                        staging     evergreen
  ```

  Raw material lands in `inbox/`. Project-scoped facts never land here at all — they live in that repo's `knowledge-base/`. When a lesson generalizes past one project, `/evolve` **MOVES** it here (and deletes the local copy, leaving a pointer line): exactly one copy of any fact exists.
  ````

- [ ] **Step 8: Doctrine edit 6 of 7 — `vault-scaffold/CLAUDE.md:21`.** Replace
  ```
  - **Build a wiki per project** → `projects/<name>/`
  ```
  with
  ```
  - **Keep project knowledge in its repo** → that repo's own git-tracked `knowledge-base/`, never here
  ```

- [ ] **Step 9: Doctrine edit 7 of 7 — `vault-scaffold/CLAUDE.md:13`.** Replace
  ```
  > - `system/` — machine-readable plumbing (templates, schemas, pointer block). Edit its files *deliberately* when changing conventions; never dump notes here.
  ```
  with
  ```
  > - `system/` — machine-readable plumbing (index template, frontmatter schema). Edit its files *deliberately* when changing conventions; never dump notes here.
  ```

- [ ] **Step 10a: `vault-scaffold/_index.md` — two edits, applied BOTTOM-UP so the earlier line number stays valid.** First replace the two `Quick actions` bullets at `:36-37`
  ```
  - **Start a new project wiki** → copy [[system/templates/project-template/_index|the project template]] to `projects/<name>/`, then register it in [[projects/_index|projects/_index]].
  - **Point a repo at this vault** → paste [[system/pointer-block|system/pointer-block.md]] into that repo's `CLAUDE.md`.
  ```
  with
  ```
  - **Start a new project** → its knowledge goes in that repo's own `knowledge-base/`; register the repo in [[projects/_index|projects/_index]].
  - **Point a repo at this vault** → set `knowledge.shared.path` in that repo's `.claude/harness.json`.
  ```
  Then replace the map row at `:24`
  ```
  | ⚙️ **system** | Plumbing: templates, schemas, pointer block. | [[system/_index\|system]] |
  ```
  with
  ```
  | ⚙️ **system** | Plumbing: index template, frontmatter schema. | [[system/_index\|system]] |
  ```

- [ ] **Step 10b: `vault-scaffold/system/_index.md` — four replacements and one deletion, BOTTOM-UP (`:23`, `:21`, `:17`, `:15`, `:11`).** Replace `:23`
  ```
  3. Changing how repos reference the vault → update `pointer-block.md` (the one source), not individual repos ad hoc.
  ```
  with
  ```
  3. Changing how repos reference this vault → they read `.claude/harness.json` → `knowledge.shared.path`; nothing here needs editing.
  ```
  Replace `:21`
  ```
  1. Creating a project → copy `templates/project-template/`. Creating any folder → base its `_index.md` on `templates/index-template.md`.
  ```
  with
  ```
  1. Creating any folder → base its `_index.md` on `templates/index-template.md`.
  ```
  DELETE `:17` outright (the file it names is gone):
  ```
  - [[system/pointer-block|pointer-block.md]] — copy-paste block that points a code repo at this vault.
  ```
  Replace `:15`
  ```
  - [[system/templates/_index|templates/]] — the project-wiki template and the `_index.md` template.
  ```
  with
  ```
  - [[system/templates/_index|templates/]] — the `_index.md` template.
  ```
  Replace `:11` — the whole line, not its tail; replacing only `and the repo pointer block.` leaves an ungrammatical sentence:
  ```
  **Plumbing.** Machine-readable templates, schemas, and the repo pointer block. This is not a note dump — edit these files *deliberately* when you're changing a vault convention.
  ```
  with
  ```
  **Plumbing.** Machine-readable templates and schemas for this vault. This is not a note dump — edit these files *deliberately* when you're changing a vault convention.
  ```

- [ ] **Step 10c: `vault-scaffold/system/templates/_index.md` — one replacement and one deletion, BOTTOM-UP (`:21`, `:16`).** Replace `:21`
  ```
  2. New project → copy the whole `project-template/` folder to `projects/<name>/`, then fill it in and register it in [[projects/_index|projects/_index]].
  ```
  with
  ```
  2. New project → its knowledge lives in that repo's `knowledge-base/`; nothing is scaffolded here.
  ```
  Then DELETE `:16` outright (the folder it names is gone):
  ```
  - [[system/templates/project-template/_index|project-template/]] — the full per-project wiki (copy to `projects/<name>/`).
  ```

- [ ] **Step 11: Rewrite `vault-scaffold/projects/_index.md:12` and its two lower sections.** Replace `:12` with
  ```
  **The registry — pointers, not knowledge.** Each row records where a product's repo (and its git-tracked `knowledge-base/`) lives. Project knowledge is NOT stored in this vault; see [[CLAUDE#Project Knowledge Doctrine — it is NOT here]].
  ```
  Replace the `## Start a new project` section (`:26-31`) with
  ```
  ## Register a new project

  1. Add a row to the Registry above: name, kind, status, repo path.
  2. Bump `updated:` (Index Law).
  3. In that repo, run `npx perfect-harness-engineering init` — it records this vault's path in
     `.claude/harness.json` → `knowledge.shared` and `/harness-init` scaffolds its `knowledge-base/`.
  ```
  Replace the `## Agent SOP` section (`:33-38`) with
  ```
  ## Agent SOP

  1. Looking for a product's architecture or decisions? They are in that product's repo, under
     `knowledge-base/` — not here. This file only tells you which repo.
  2. A leftover `projects/<name>/` subfolder is un-migrated knowledge, not the shape. Report it;
     never write new knowledge into one.
  3. Shipped or dead project → update `status:` in the row and bump `updated:`.
  ```
  Finally, in the Registry table header at `:18-20`, replace `| Project | Kind | Status | Wiki |` / `|---|---|---|---|` / `| _(no projects yet)_ | — | — | — |` with `| Project | Kind | Status | Repo (holds its knowledge-base/) |` / `|---|---|---|---|` / `| _(no projects yet)_ | — | — | — |`, and replace the HTML-comment example at `:22-24` with
  ```
  <!-- Add a row per project. Example:
  | Acme API | app | active | `~/Dev/acme-api` |
  -->
  ```

- [ ] **Step 12: Run the doctrine check and see it pass (GREEN).**
  Greps the DOCTRINE PHRASES, not two filenames — a filename grep returns `clean` for an
  implementation that deleted the six files and made zero doctrine edits.
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -rniE "pointer-block|project-template|projects/<name>|project wiki|one wiki per|working knowledge|vault-centric" template/.claude/references/vault-scaffold/ || echo clean
  ```
  Expected output: `clean`. Ratcheted: this is a `/validate` gate row.

- [ ] **Step 13: Prove the payload is still fully committed and emits cleanly.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add -A template/.claude/references/vault-scaffold && node cli/emit-codex.test.js | tail -2 && node cli/cli-hardening.test.js | tail -2
  ```
  Expected: `149 passed, 0 failed`, then `19 passed, 0 failed`.

- [ ] **Step 14: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git commit -m "refactor(vault-scaffold): shared store only — no project wikis, no pointer block"
  ```
  Expected output contains: `11 files changed`

---

### Task 5: `knowledge-protocol.md` and every prose citation

**Files:**
- Create `template/.claude/references/knowledge-protocol.md`
- Delete `template/.claude/references/vault-protocol.md`
- Modify `template/AGENTS.md` (delete `:5-6`; add one Commands row; rewrite `:27`, `:47`, `:50`)
- Modify `template/.claude/rules/00-core.md` (`:14`, `:27` — rewrite IN PLACE, file is at 45/45)
- Modify `template/.claude/skills/backlog/SKILL.md` (`:41`)
- Modify `template/.claude/skills/plan-work/SKILL.md` (`:50`)
- Modify `template/.claude/skills/validate/SKILL.md` (gate table `:25-28`; `:56`)
- Modify `template/.claude/skills/evolve/SKILL.md` (`:3`, `:31`, `:32`, `:62`, two new bullets after `:73`, `:74`)

**Interfaces:**
- Consumes: `npx perfect-harness-engineering kb-check` (Task 3).
- Produces: `.claude/references/knowledge-protocol.md` — the single cited contract. Tasks 6, 7, 8, 9, 10 all cite this exact path.

- [ ] **Step 1: Create `template/.claude/references/knowledge-protocol.md`:**
  ```markdown
  # Knowledge protocol — two stores, one boundary rule

  How every knowledge-touching skill/agent RETRIEVEs before acting and CAPTUREs after. Load on cite.

  ## The boundary rule (replaces "one sole source of truth")

  | Store | Where | Holds | Tracked |
  |---|---|---|---|
  | LOCAL | `knowledge-base/` in THIS repo | project-scoped: architecture, ADRs, runbook, credential pointers, capture, cited research | git — reviewed, travels with the code branch |
  | SHARED | an Obsidian vault: `.claude/harness.json` → `knowledge.shared` (only `mode: "existing"` counts) | evergreen: `wiki/`, `agent-kb/`, `wiki/stack/<tool>/`, `inbox/research/` | untracked |

  **Promotion MOVES.** When a local fact generalizes, `/evolve` moves it to the shared store,
  DELETES the local file, and leaves a one-line pointer in `knowledge-base/_index.md`. Exactly one
  copy of any fact exists — this is not a mirror. Never write project knowledge into
  `<shared>/projects/` — it belongs in that repo's own `knowledge-base/`.

  ## Retrieval ladders — one per store, never both rungs, never skip local

  - LOCAL: `knowledge-base/_index.md` → the file it names. Plain `Read`/`Glob`. No CLI; in-repo
    files are cheap. No `knowledge-base/` → say so (`no knowledge-base/ — answering from the code`).
  - SHARED: `obsidian` CLI on PATH → `obsidian search:context query="<q>" path=<folder> limit=5`
    scoped to `wiki/` or `agent-kb/`; `obsidian read path=<note>` for a hit. ANY error or CLI
    absent → `_index.md` walk (vault `_index.md` → folder `_index.md` → file).
  - No shared store configured → skip every shared step and SAY SO (`no shared store — skipping <step>`).

  ## Write policy

  - Mid-work auto-writes go to `knowledge-base/` — the right core file, or `inbox/` when raw. Every
    write updates that folder's `_index.md` in the same change (Index Law) and uses Obsidian
    conventions: frontmatter, `[[wikilinks]]` (the global `obsidian-markdown` skill when available).
  - `knowledge-base/` is git-TRACKED and may be published: `resources.md` holds credential POINTERS
    only. `npx perfect-harness-engineering kb-check` gates it at `/validate` and again at `/evolve`'s
    apply step, because the KB commit happens at `/evolve`.
  - Shared-store writes (`wiki/`, `agent-kb/`) and any rule change: ask-first, via `/evolve` only.
  - `knowledge-base/` is committed as ONE `docs(kb):` commit at `/evolve`, on the feature branch —
    a work artifact like `plans/` and `reports/`, not a tracking-root file.

  ## Per-stage table

  | Stage / agent | RETRIEVE before acting | CAPTURE after |
  |---|---|---|
  | `/backlog` refine | `knowledge-base/decisions.md` for prior art + conflicts; shared `wiki/` search | — (item Log stays canonical) |
  | `/plan-work` | `knowledge-base/architecture.md` + `decisions.md`; product is an AI agent → shared `agent-kb/`. Record BOTH in the plan's `Knowledge to load first:` | — |
  | `/implement` | the plan's `Knowledge to load first:` files, BEFORE Task 1 | the report's Knowledge row |
  | debugging | `knowledge-base/runbook.md` failure classes BEFORE diagnosing | confirmed root cause appends to `runbook.md` |
  | `/validate` | `knowledge-base/runbook.md` (how to drive the app) → `qa-evaluator` | `kb-check` runs as a gate command |
  | `/review-branch` | BASE-branch KB only (`git show <base>:knowledge-base/…`) — the KB commit lands at `/evolve`, after review | — |
  | `/evolve` | — | THE gate: distil `plans/`+`reports/` into the KB; generalizes → MOVE to shared, ask-first |
  | `architect-agent` | `knowledge-base/_index.md` → `architecture.md` (+ `decisions.md`) | RECORD writes both |
  ```

- [ ] **Step 2: Delete the old reference and see the dangling citations (RED).**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git rm template/.claude/references/vault-protocol.md && grep -rn "vault-protocol" template/
  ```
  Expected: `rm 'template/.claude/references/vault-protocol.md'` followed by 9 matching lines (`AGENTS.md:50`, `agents/architect-agent.md:23`, `hooks/session-start.mjs:78`, `rules/00-core.md:14`, `skills/plan-work/SKILL.md:50`, `skills/validate/SKILL.md:56`, `skills/backlog/SKILL.md:41`, `skills/debugging-this-repo/SKILL.md:17`, `skills/evolve/SKILL.md:32`).

- [ ] **Step 3: `template/AGENTS.md` — delete the pointer-block slot.** Delete line 5 AND the blank line 6:
  ```
  <!-- Vault users: paste your vault's pointer block here (its system/pointer-block.md; /harness-init can scaffold one), then delete this comment. -->

  ```
  The file goes from 59 to 57 lines, buying the budget for the row added in Step 4.

- [ ] **Step 4: `template/AGENTS.md` — add the knowledge gate to the Commands table.** After the `| Typecheck | \`<cmd>\` |` row, insert:
  ```
  | Knowledge gate | `npx perfect-harness-engineering kb-check` — knowledge-base/ index law, placeholders, secrets |
  ```

- [ ] **Step 5: `template/AGENTS.md` — rewrite three lines in place (net zero).** Replace the Evolve pipeline row (originally `:27`)
  ```
  | Evolve | `/evolve` | rule/vault updates (ask-first); scrum: this is the retro |
  ```
  with
  ```
  | Evolve | `/evolve` | `knowledge-base/` (one `docs(kb):` commit) + rule updates (ask-first); scrum: this is the retro |
  ```
  Replace the knowledge-skills bullet (originally `:47`)
  ```
  - Knowledge skills: consult **architecture-map** BEFORE placing new code; **debugging-this-repo** BEFORE diagnosing any bug or test failure.
  ```
  with
  ```
  - Knowledge lives in `knowledge-base/`: `architecture.md` BEFORE placing code, `runbook.md` BEFORE diagnosing a bug. **architecture-map** / **debugging-this-repo** are thin pointers to it.
  ```
  Replace the tail of the doc-grounded bullet (originally `:50`)
  ```
  Vault protocol (retrieve/capture, all stages): `.claude/references/vault-protocol.md`.
  ```
  with
  ```
  Knowledge protocol (two stores, retrieve/capture/promote): `.claude/references/knowledge-protocol.md`.
  ```

- [ ] **Step 6: `template/.claude/rules/00-core.md` — rewrite two rows IN PLACE.** The file is at 45/45; these are replacements, not additions. Replace `:14`
  ```
  | Bug, test failure, unexpected behavior | superpowers:systematic-debugging BEFORE any fix; facts from debugging-this-repo + vault runbook (vault-protocol.md) |
  ```
  with
  ```
  | Bug, test failure, unexpected behavior | superpowers:systematic-debugging BEFORE any fix; facts from `knowledge-base/runbook.md` (knowledge-protocol.md) |
  ```
  Replace `:27`
  ```
  | Architecture — where new code goes / what a change touches, before a new module/route/table/endpoint | `architect-agent` (`deep`); reads the vault wiki, /evolve RECORDs back |
  ```
  with
  ```
  | Architecture — where new code goes / what a change touches, before a new module/route/table/endpoint | `architect-agent` (`deep`); reads `knowledge-base/architecture.md`, /evolve RECORDs back |
  ```

- [ ] **Step 7: `template/.claude/skills/backlog/SKILL.md:41` — repoint prior-art retrieval.** Replace
  ```
  0. RETRIEVE prior art (vault-protocol: `.claude/references/vault-protocol.md`): search `projects/<name>/decisions.md` + `wiki/` for decisions touching this item's surface; surface conflicts/duplicates to the PO before drafting AC. No vault → say so and continue.
  ```
  with
  ```
  0. RETRIEVE prior art (`.claude/references/knowledge-protocol.md`): read `knowledge-base/decisions.md`, then search the shared `wiki/` for decisions touching this item's surface; surface conflicts/duplicates to the PO before drafting AC. Neither store present → say so and continue.
  ```

- [ ] **Step 8: `template/.claude/skills/plan-work/SKILL.md:50` — repoint the agent-kb bullet.** Replace
  ```
  - The product under work is itself an AI agent/LLM feature → RETRIEVE `agent-kb/` (patterns/, models/, tooling/) per `.claude/references/vault-protocol.md` before designing from scratch; cite consulted notes in the plan's Context.
  ```
  with
  ```
  - RETRIEVE `knowledge-base/architecture.md` + `decisions.md` first; the product under work is itself an AI agent/LLM feature → also the shared `agent-kb/` (patterns/, models/, tooling/) per `.claude/references/knowledge-protocol.md`. Record both in the plan's `Knowledge to load first:` — a store with nothing relevant gets `none — <reason>`.
  ```

- [ ] **Step 9: `template/.claude/skills/validate/SKILL.md` — add the gate rows, the ratcheted-greps mechanism, and repoint `:56`.** In the gate table at `:25-28`, after the `| Conditional (step 2) | build, integration/e2e — only when the diff warrants |` row, insert:
  ```
  | Always, when `knowledge-base/` exists | `npx perfect-harness-engineering kb-check` — index law, unfilled placeholders, secret shapes. Exit 1 is a FAIL row like any other |
  ```
  Then add the ratcheted-greps row as the LAST row of the same table:
  ```
  | Ratcheted greps (below) | doctrine / dangling-reference checks — always, when the repo defines one |
  ```
  And immediately after the `If the Commands table still has \`<cmd>\` placeholders…` line, insert
  the mechanism itself — adopter-general, because `template/` is installed verbatim into repos that
  have none of THIS repo's greps:
  ```
  **Ratcheted greps (repo-specific).** Every grep this repo has ratcheted into its gate runs here, required output `clean`. Each traces to a real incident — a doctrine that drifted, a reference that dangled — and is added by `/evolve`, never invented at validate time. None recorded yet → skip this row and say so.

  <!-- One fenced bash block per ratcheted grep, each ending `|| echo clean`. Shape:
       grep -rniE "phrase one|phrase two" path/to/scope/ || echo clean -->
  ```
  In `:56`, replace
  ```
  Vault configured (vault-protocol resolution) → also pass `projects/<name>/runbook.md` as the how-to-drive reference.
  ```
  with
  ```
  Also pass `knowledge-base/runbook.md` as the how-to-drive reference when it exists (`.claude/references/knowledge-protocol.md`).
  ```

- [ ] **Step 10: `template/.claude/skills/evolve/SKILL.md:31-32` — repoint both destination rows.** Replace
  ```
  | Structural change to record | Dispatch `architect-agent` **RECORD** → updates `projects/<name>/architecture.md` + `decisions.md` in the vault (no vault → skip, say so) |
  | Generalizes beyond this project | Vault: inbox/raw or project wiki (agents auto-append there mid-work); promotion to wiki//agent-kb/ happens HERE and only here, ask-first — `.claude/references/vault-protocol.md` |
  ```
  with
  ```
  | Structural change to record | Dispatch `architect-agent` **RECORD** → updates `knowledge-base/architecture.md` + `decisions.md` (creates them from `.claude/references/knowledge-base-scaffold/` if absent) |
  | Generalizes beyond this project | MOVE it to the shared store's `wiki/`/`agent-kb/`, ask-first — delete the local file and leave a pointer line in `knowledge-base/_index.md`. Promotion happens HERE and only here — `.claude/references/knowledge-protocol.md` |
  ```

- [ ] **Step 10b: `template/.claude/skills/evolve/SKILL.md` — wire the KB into the apply step, clear the three plain-word vault references.** Ordered BOTTOM-UP within the file so earlier line numbers stay valid. Replace `:74`
  ```
  - Vault writes follow the vault's Index Law: update that folder's `_index.md` in the same change.
  ```
  with
  ```
  - Knowledge writes follow the Index Law: update that folder's `_index.md` in the same change — `knowledge-base/` locally, and the shared store when a promotion MOVED something there.
  ```
  Then insert these two bullets immediately after `:73` (the `.evolve-ran` bullet), inside `## 6. Apply selections`:
  ```
  - `knowledge-base/` touched this session → run `npx perfect-harness-engineering kb-check` and show its real output. Exit 1 is a blocker exactly like a red smoke test: fix the findings, re-run. `/validate` ran the same gate at pipeline step 4, but the KB commit happens HERE at step 7 — the gate has to be where the commit is (`.claude/references/knowledge-protocol.md`).
  - Then stage `knowledge-base/` and commit it as exactly ONE `docs(kb): <what this session taught the KB>` commit, on the FEATURE branch — it is a work artifact like `plans/` and `reports/`, never a tracking-root file, so it merges with the PR.
  ```
  Then replace the ask-first example at `:62`
  ```
  4. [vault: architecture] Record the new `orders` table + tenant_id FK — traces to: this session's migration
  ```
  with
  ```
  4. [knowledge-base: architecture] Record the new `orders` table + tenant_id FK — traces to: this session's migration
  ```
  Finally replace the frontmatter description at `:3`
  ```
  description: "Capture what this work taught the harness: new rules, pruned rules, vault entries. Ask-first."
  ```
  with
  ```
  description: "Capture what this work taught the harness: new rules, pruned rules, knowledge-base entries. Ask-first."
  ```
  The body goes 79 → 81 lines (cap 100); the description is NOT ledger-counted (`evolve` carries `disable-model-invocation: true`), so the AGENTS.md budget is untouched.

- [ ] **Step 11: Confirm only the citations later tasks own remain.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -rn "vault-protocol\|projects/<name>/" template/
  ```
  Expected exactly ten distinct lines (`debugging-this-repo/SKILL.md:17` matches both patterns and prints once), and `template/.claude/skills/evolve/SKILL.md` must NOT be among them (Steps 10 + 10b cleared it):
  - `vault-protocol` — `agents/architect-agent.md:23` (Task 6), `hooks/session-start.mjs:78` (Task 8), `skills/debugging-this-repo/SKILL.md:17` (Task 7).
  - `projects/<name>/` — `agents/architect-agent.md:16` and `:20` (Task 6), `skills/debugging-this-repo/SKILL.md:17` and `:18` (Task 7), `skills/harness-init/SKILL.md:68` (Task 10).
  - Three narrative mentions of the OLD shape in the shared scaffold's prose that NO task in this plan rewrites: `references/vault-scaffold/_index.md:29`, `references/vault-scaffold/inbox/_index.md:14`, `references/vault-scaffold/agent-kb/_index.md:14`. Record them in the implementation report as a known leftover — do not silently widen Task 4's scope to fix them here.

- [ ] **Step 12: Prove the budgets held.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node tools/context-ledger.mjs template
  ```
  Expected: `AGENTS.md` row shows `58` lines with no `!soft`/`!!HARD` mark, `.claude/rules/00-core.md` shows `45` with no mark, no `!! WARN` lines, no `!! HARD` lines, and `Status: WARN — <n> / 2000 est. tokens` with `<n>` ≤ 1654.

- [ ] **Step 13: Prove the allowlisted placeholder tokens survived the AGENTS.md edits.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add -A template && node cli/cli-hardening.test.js | tail -2
  ```
  Expected: `19 passed, 0 failed`

- [ ] **Step 14: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add -A template && git commit -m "feat(template): knowledge-protocol replaces vault-protocol across the payload"
  ```
  Expected output contains: `8 files changed`

---

### Task 6: Repoint the KB's writer and its reviewer

**Files:**
- Modify `template/.claude/agents/architect-agent.md` (`:3` description, `:9-11` intro, `:13-23` resolution, `:28-29` RETRIEVE, `:39` IMPACT, `:50-58` RECORD, `:61` PATTERN, `:71` rule)
- Modify `template/.claude/agents/code-reviewer.md` (`:36`)

**Interfaces:**
- Consumes: `.claude/references/knowledge-protocol.md` (Task 5); `.claude/references/knowledge-base-scaffold/` (Task 3).
- Produces: the ONLY writer of `knowledge-base/architecture.md` and `decisions.md`. Without this task the two files this whole increment exists to hold have no writer, and the agent degrades silently to `NO VAULT KB`.

- [ ] **Step 1: Replace `architect-agent.md:3` (frontmatter description).** Replace
  ```
  description: "Project architecture knowledge base, backed by the vault. Consult BEFORE creating or changing modules, routes, DB tables, or endpoints (RETRIEVE/IMPACT). Records structural change back to the vault (RECORD). Returns concise file maps and integration points, not file contents."
  ```
  with
  ```
  description: "Project architecture knowledge base, backed by the repo's knowledge-base/. Consult BEFORE creating or changing modules, routes, DB tables, or endpoints (RETRIEVE/IMPACT). Records structural change back into knowledge-base/ (RECORD). Returns concise file maps and integration points, not file contents."
  ```

- [ ] **Step 2: Replace `architect-agent.md:9-23` (intro + resolution chain).** Replace
  ```
  You are this project's architecture knowledge base. Your knowledge base is the project's wiki IN
  THE OBSIDIAN VAULT — not a copy inside the repo. You respond only to the dispatching agent, never
  to a human. Answer in ≤30 lines: file paths, not file contents.

  ## Resolve your knowledge base first (every dispatch)

  1. Read the repo `AGENTS.md`; find its `## Knowledge Vault` block. Take the absolute vault path and
     the `projects/<name>/` project name from it. Fallback: `.claude/harness.json` → `vault.path`.
  2. No vault block AND no `vault.path` → you have NO vault KB. Open every answer with the line
     `NO VAULT KB — answering from the codebase.`, then answer from the code (Glob/Grep/Read) like a
     read-only scout. Skip RECORD entirely — there is nowhere to write.
  3. Vault found → your KB is `<vault>/projects/<name>/`: `_index.md` (contents), `architecture.md`
     (the map), `decisions.md` (ADRs). Read `_index.md` first, then only the file the query needs.
     Never load the whole KB. Lookup accelerator: the retrieval ladder in
     `.claude/references/vault-protocol.md` (obsidian CLI search when present, file reads otherwise).
  ```
  with
  ```
  You are this project's architecture knowledge base. Your knowledge base is `knowledge-base/` IN
  THIS REPO — git-tracked, reviewed in the PR, travelling with the code branch. You respond only to
  the dispatching agent, never to a human. Answer in ≤30 lines: file paths, not file contents.

  ## Resolve your knowledge base first (every dispatch)

  1. Your KB is `knowledge-base/` at the repo root: `_index.md` (contents map), `architecture.md`
     (module map, `## Boundaries`, data flow), `decisions.md` (ADRs). Read `_index.md` first, then
     ONLY the file the query needs. Never load the whole KB. No CLI — in-repo files are cheap Reads.
  2. No `knowledge-base/architecture.md` → you have NO local KB. Open every answer with the line
     `NO LOCAL KB — answering from the codebase.`, then answer from the code (Glob/Grep/Read) like a
     read-only scout, and say that a RECORD dispatch will create the file from the scaffold.
  3. The SHARED store (an Obsidian vault; `.claude/harness.json` → `knowledge.shared`, only
     `mode: "existing"` counts) holds EVERGREEN knowledge only — `wiki/`, `agent-kb/`. Consult it for
     cross-project patterns, never for this project's architecture, and never write to it. Ladder,
     boundary rule and promotion contract: `.claude/references/knowledge-protocol.md`.
  ```

- [ ] **Step 3: Replace `architect-agent.md:28-29` (RETRIEVE body).** Replace
  ```
  Current architecture relevant to the query. Read `architecture.md` (+ `decisions.md` for rationale).
  Query about an AI-agent/LLM design → also check `agent-kb/` (patterns/, models/, tooling/).
  ```
  with
  ```
  Current architecture relevant to the query. Read `knowledge-base/architecture.md` (+
  `knowledge-base/decisions.md` for rationale). Query about an AI-agent/LLM design → also check the
  shared store's `agent-kb/` (patterns/, models/, tooling/).
  ```

- [ ] **Step 3b: Prefix the two remaining section bodies — IMPACT and PATTERN.** Same edit as Step 3,
  applied to the last two query-type sections that name the KB. Both are one-line replacements and
  both anchors are unique in the file, so neither depends on the other or on step order. Replace
  ```
  What a planned change will touch. Read `architecture.md`; identify affected areas.
  ```
  with
  ```
  What a planned change will touch. Read `knowledge-base/architecture.md`; identify affected areas.
  ```
  and replace
  ```
  An established convention. Read `architecture.md` (or `decisions.md`).
  ```
  with
  ```
  An established convention. Read `knowledge-base/architecture.md` (or `knowledge-base/decisions.md`).
  ```
  Both replacements sit in ONE step because IMPACT and PATTERN are the two remaining resolution
  modes, and prefixing only some of them is the exact defect this repairs. The failure is silent: the
  degraded-mode check Step 2 installs — resolution step 2 — tests `knowledge-base/architecture.md`,
  which EXISTS, so an unprefixed read never reports a missing KB. It falls through to a codebase scan
  instead and the answer looks normal, which is why this survived a fix round. Without this step
  RETRIEVE, RECORD and the writes rule get prefixed while IMPACT and PATTERN keep pointing at a bare
  `architecture.md` that no longer resolves — the agent's two read paths would disagree with its two
  write paths. Grouped here rather than split around Step 4 because these are the same edit as
  Step 3, and file order buys nothing: every step in this task matches on TEXT, and Step 2's
  replacement is one line longer than what it replaces, so every line number below it has already
  shifted by the time Step 3 runs.

- [ ] **Step 4: Replace `architect-agent.md:50-58` (the RECORD block).** Replace
  ```
  ### RECORD
  The dispatching agent tells you what changed. No vault KB → refuse: `NO VAULT KB — cannot record.`

  1. VERIFY the change exists in the codebase (Glob/Grep) before writing — never record unverified.
  2. Update `architecture.md` (module table, data flow) to match.
  3. Decision with rationale given → append an ADR to `decisions.md`.
  4. Vault Index Law: a folder whose contents you changed gets its `_index.md` updated in the SAME
     change (bump `updated:`).
  5. Reply with a one-line confirmation per file written.
  ```
  with
  ```
  ### RECORD
  The dispatching agent tells you what changed. Writes land in `knowledge-base/` — there is always
  somewhere to write: create the file from `.claude/references/knowledge-base-scaffold/` if absent.

  1. VERIFY the change exists in the codebase (Glob/Grep) before writing — never record unverified.
  2. Update `knowledge-base/architecture.md` (module table, `## Boundaries`, data flow) to match.
  3. Decision with rationale given → append an ADR to `knowledge-base/decisions.md`.
  4. Index Law: a folder whose contents you changed gets its `_index.md` created (from the scaffold)
     or updated in the SAME change (bump `updated:`) — the first RECORD in a repo creates it.
  5. Never write a credential VALUE — `knowledge-base/resources.md` holds pointers only; `kb-check` fails the gate
     on one.
  6. Reply with a one-line confirmation per file written.
  ```

- [ ] **Step 5: Replace `architect-agent.md:71` (the writes rule).** Replace
  ```
  - Vault writes are the ONLY writes you make. Never edit product code.
  ```
  with
  ```
  - `knowledge-base/` writes are the ONLY writes you make. Never edit product code, and never write into the shared vault — promotion is `/evolve`'s ask-first call.
  ```

- [ ] **Step 6: Replace `code-reviewer.md:36` (checklist item 6).** Replace
  ```
  6. **Boundaries** — `.claude/skills/architecture-map/SKILL.md` exists → read its Boundaries section; a violation (forbidden import/dependency direction) is a blocker.
  ```
  with
  ```
  6. **Boundaries & recorded decisions** — read the BASE-branch KB (`git show <base>:knowledge-base/architecture.md` and `git show <base>:knowledge-base/decisions.md` — the KB commit lands at `/evolve`, AFTER this review). A forbidden import/dependency direction against `## Boundaries` is a blocker; so is a diff that contradicts a recorded ADR without superseding it. No `<base>` in the dispatch (inline-patch path) → resolve one yourself per `.claude/skills/review-branch/SKILL.md`'s "Base branch" rule; unresolvable, or neither file on base → say so and review from the code, never `missing context`.
  ```

- [ ] **Step 7: Prove the emitted Codex agent still names the shared vault (the pinned assert).**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -c -i "vault" template/.claude/agents/architect-agent.md && node cli/emit-codex.test.js | tail -2
  ```
  Expected: a count of at least `1`, then `149 passed, 0 failed`.

- [ ] **Step 8: Prove the agent frontmatter is still schema-clean.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | grep "architect-agent\|code-reviewer"
  ```
  Expected output:
  ```
    PASS  architect-agent.md: frontmatter keys all in documented schema (+ PHE `tier`)
    PASS  code-reviewer.md: frontmatter keys all in documented schema (+ PHE `tier`)
  ```

- [ ] **Step 9: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add template/.claude/agents && git commit -m "feat(agents): architect-agent writes knowledge-base/; reviewer reads it from base"
  ```
  Expected output contains: `2 files changed`

---

### Task 7: Shrink the two knowledge skills to thin pointers

**Files:**
- Modify `template/.claude/skills/architecture-map/SKILL.md` (body `:8-42`)
- Modify `template/.claude/skills/debugging-this-repo/SKILL.md` (body `:7-50`)

**Interfaces:**
- Consumes: `knowledge-base/architecture.md`, `knowledge-base/runbook.md` (Task 3's scaffold shape).
- Produces: two ≤25-line skill bodies that still carry the pinned placeholder tokens and the live `find` preview. Task 10's placeholder gate greps both.

**Hard constraints for this task (verified before writing):** `cli/skill-preview-guards.test.js:43` needs ≥7 previews and exactly 7 exist — `architecture-map/SKILL.md`'s `` !`find …` `` line MUST survive verbatim, `|| echo "(dir scan failed)"` tail included. `cli/cli-hardening.test.js:338` needs `<shared-dir>` and `<file:line>` to survive in `architecture-map/SKILL.md`, and `<root cause>`, `<env-var>`, `<exact error text>` to survive in `debugging-this-repo/SKILL.md`; `<incident>` must survive in at least one of them.

- [ ] **Step 1: Replace the body of `template/.claude/skills/architecture-map/SKILL.md`** (everything from line 8 to the end of file; leave the 6 frontmatter lines and the blank line 7 exactly as they are):
  ```markdown
  # Architecture map — a pointer, not the map

  Golden rule: placement is a decision, not a guess — new code lands where the map says, or the map gets updated first (via `/evolve`).

  ## Live tree (re-rendered at every invocation — never stale)

  !`find . -maxdepth 2 -type d -not -path '*/node_modules*' -not -path '*/.git*' 2>/dev/null | head -40 || echo "(dir scan failed)"`

  ## The map itself lives in the KB

  `knowledge-base/architecture.md` holds the module table, the where-new-code-goes rules, and the
  `## Boundaries` section. `architect-agent` writes it (RECORD); `code-reviewer` reads it. Read
  `knowledge-base/_index.md`, then that file. Never duplicate its content here — a second copy
  forks the first time either moves.

  Missing (`knowledge-base/architecture.md` does not exist)? Say `no knowledge-base/architecture.md
  — deriving placement from the tree above`, place code beside its closest existing analogue, and
  dispatch `architect-agent` **RECORD** at `/evolve` so the next agent does not re-derive it.

  ## Placement checklist (the mechanics — the facts are in the KB)

  - Read the closest existing analogue BEFORE creating a file, and name it in the plan: `<file:line>`.
  - Needed by ≥2 areas → `<shared-dir>` — types and utils only, never app logic.
  - Cross-module import added → run the boundary check named in `knowledge-base/architecture.md`; a violation is a review blocker (traces to: `<incident>`).
  ```

- [ ] **Step 2: Replace the body of `template/.claude/skills/debugging-this-repo/SKILL.md`** (everything from line 7 to the end of file; leave the 5 frontmatter lines and the blank line 6 exactly as they are):
  ```markdown
  # Debugging this repo — a pointer, not the facts

  `superpowers:systematic-debugging` owns the METHOD (reproduce → isolate → root-cause). The FACTS
  live in `knowledge-base/runbook.md`: logs, repro recipes, known failure classes. Never fix without
  reproducing.

  ## RETRIEVE then CAPTURE (`.claude/references/knowledge-protocol.md`)

  - BEFORE diagnosing: read `knowledge-base/_index.md` → `knowledge-base/runbook.md`, and grep it
    for the `<exact error text>`. A prior incident match short-circuits hours. File absent → say
    `no knowledge-base/runbook.md — diagnosing from the codebase`, then continue.
  - AFTER systematic-debugging confirms a `<root cause>`: append a row to that file's Known failure
    classes (symptom → cause → fix → `<incident>`) and update `knowledge-base/_index.md` in the SAME
    change (Index Law). Generalizing past this repo is `/evolve`'s ask-first promotion, never an
    auto-write, and the promotion MOVES the fact — it never leaves a copy behind.

  ## Before blaming the framework

  1. `<env-var>` set? Unset silently hits the wrong target — check FIRST when data looks wrong.
  2. Toolchain versions match the repo's pinned version file?
  3. Stale build or cache — the clean command is in `knowledge-base/runbook.md`.

  Not covered: no flaky-test quarantine list exists — a red test is real until proven otherwise.
  ```

- [ ] **Step 3: Prove the live preview survived the shrink.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/skill-preview-guards.test.js | tail -3
  ```
  Expected output ends with:
  ```
    PASS  found the payload's preview lines (7 >= 7)

  8 passed, 0 failed
  ```

- [ ] **Step 4: Prove every pinned regression token survived.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js | grep -E "placeholder gate|allowlist entry"
  ```
  Expected output:
  ```
    PASS  harness-init step 4 ships exactly the pinned placeholder gate
    PASS  the placeholder gate catches every placeholder the pristine templates ship
    PASS  every gate allowlist entry is earned by a real token in the templates
  ```

- [ ] **Step 5: Prove the ledger did not regress (both skills' frontmatter is always-loaded).**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node tools/context-ledger.mjs template
  ```
  Expected: both skills still listed as `(frontmatter)` rows with `1` line each, no `!! WARN`, no `!! HARD`, `Status: WARN` with a total ≤ 1654.

- [ ] **Step 6: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add template/.claude/skills/architecture-map template/.claude/skills/debugging-this-repo && git commit -m "refactor(skills): architecture-map and debugging-this-repo become thin KB pointers"
  ```
  Expected output contains: `2 files changed`

---

### Task 8: `session-start.mjs` emits the two-store orientation

**Files:**
- Modify `template/.claude/hooks/session-start.mjs` (`:74-79`)
- Test: modify `template/.claude/hooks/smoke-test.mjs` (`:385-397`, the block currently headed `// Vault = second brain: …`)

**Interfaces:**
- Consumes: `harness.json` → `knowledge` (Task 2 writes it); `.claude/references/knowledge-protocol.md` (Task 5).
- Produces: two orientation lines, `Knowledge (local): …` and `Knowledge (shared): …`. Nothing downstream parses them; the fixtures are the contract.

- [ ] **Step 1: Replace the smoke fixture block first (RED).** In `template/.claude/hooks/smoke-test.mjs`, replace the whole block at `:385-397` (from `{` on line 385 through `}` on line 397) with:
  ```js
  {
    // Two stores, one boundary rule. The local KB line lands whenever `knowledge` is
    // configured (knowledge-base/ is never optional); the shared line only when a shared
    // store actually exists. No key at all -> neither line, so a pre-knowledge install is
    // quiet rather than wrong.
    const tmp = mkdtempSync(join(tmpdir(), "phe-knowledge-"));
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
      knowledge: { local: "knowledge-base", shared: { mode: "existing", path: "/tmp/x-vault" }, migratedAt: null },
    }));
    const both = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
    let bothCtx = ""; try { bothCtx = JSON.parse(both.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: bothCtx stays "" and the checks fail */ }
    check("knowledge configured -> local KB line present", both.code === 0 && bothCtx.includes("Knowledge (local): knowledge-base/"));
    check("shared store configured -> shared line present", both.code === 0 && bothCtx.includes("Knowledge (shared): /tmp/x-vault"));

    writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
      knowledge: { local: "knowledge-base", shared: { mode: "none", path: null }, migratedAt: null },
    }));
    const localOnly = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
    let loCtx = ""; try { loCtx = JSON.parse(localOnly.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: loCtx stays "" */ }
    check("shared mode none -> local line only, no shared line", localOnly.code === 0 && loCtx.includes("Knowledge (local):") && !loCtx.includes("Knowledge (shared):"));

    // The ONLY fixture that exercises the `: "knowledge-base"` fallback at the hook's
    // `k.local` read. Without it the fallback constant could be changed to "" — emitting
    // `Knowledge (local): /` — with every other check here still green.
    writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ knowledge: {} }));
    const bare = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
    let bareCtx = ""; try { bareCtx = JSON.parse(bare.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: bareCtx stays "" */ }
    check("empty knowledge object -> local line with the default path, no shared line",
      bare.code === 0 && bareCtx.includes("Knowledge (local): knowledge-base/") && !bareCtx.includes("Knowledge (shared):"));

    // An array IS an object to typeof, and cli/knowledge-config.js's reader returns null
    // for one. The hook must agree with the reader that owns the key: no line, not a line
    // claiming a store that is not configured.
    writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ knowledge: [1, 2] }));
    const arr = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
    let arrCtx = ""; try { arrCtx = JSON.parse(arr.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: arrCtx stays "" */ }
    check("array-valued knowledge -> no knowledge line (agrees with readKnowledgeConfig)",
      arr.code === 0 && arrCtx.includes("Stop gate:") && !arrCtx.includes("Knowledge ("));

    // The "Stop gate:" clause anchors this positively: session-start exits 0 on EVERY path,
    // so a bare `!includes` would also pass for a hook that emitted nothing at all.
    writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({}));
    const off = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
    let offCtx = ""; try { offCtx = JSON.parse(off.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: offCtx stays "" */ }
    check("no knowledge key -> no knowledge line", off.code === 0 && offCtx.includes("Stop gate:") && !offCtx.includes("Knowledge ("));
  }
  ```
  (The last three fixtures and the `!Array.isArray` guard in Step 3 were added by fix round 1; the
  RED in Step 2 below is the count as originally run, with the four-fixture block.)

- [ ] **Step 2: Run the smoke test and see it fail.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | tail -1
  ```
  Expected output: `96 passed, 3 failed` (exit 1). The three failures are `knowledge configured -> local KB line present`, `shared store configured -> shared line present`, and `shared mode none -> local line only, no shared line`.

- [ ] **Step 3: Replace `template/.claude/hooks/session-start.mjs:74-79`.** Replace
  ```js
        // Vault = the agent's second brain. One line so every fresh session knows it exists;
        // the protocol reference carries the how (retrieval ladder, write policy).
        const v = cfg.vault;
        if (v && v.mode === "existing" && typeof v.path === "string" && v.path) {
          lines.push(`Vault: ${v.path} — RETRIEVE before structural work, CAPTURE after; protocol: .claude/references/vault-protocol.md`);
        }
  ```
  with
  ```js
        // Two stores, one boundary rule: project-scoped knowledge is IN THE REPO
        // (knowledge-base/, git-tracked), evergreen knowledge is in the shared vault, and
        // promotion MOVES. One line each so every fresh session knows both exist; the
        // protocol reference carries the how (ladders, write policy, promotion rule).
        // `!Array.isArray` is not pedantry: an array IS an object to typeof, and
        // cli/knowledge-config.js's reader returns null for one. Without it the hook
        // announces a configured store that the reader owning the key says is absent.
        const k = cfg.knowledge;
        if (k && typeof k === "object" && !Array.isArray(k)) {
          const local = typeof k.local === "string" && k.local ? k.local : "knowledge-base";
          lines.push(`Knowledge (local): ${local}/ — RETRIEVE before structural work, CAPTURE after; protocol: .claude/references/knowledge-protocol.md`);
          const s = k.shared;
          if (s && s.mode === "existing" && typeof s.path === "string" && s.path) {
            lines.push(`Knowledge (shared): ${s.path} — evergreen only (wiki/, agent-kb/); promotion MOVES, never copies.`);
          }
        }
  ```

- [ ] **Step 4: Run the smoke test and see it pass.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | tail -1
  ```
  Expected output: `99 passed, 0 failed` (exit 0) as originally run; **101 passed, 0 failed** after
  fix round 1 added the `knowledge: {}` fallback and `knowledge: [1,2]` array fixtures. 101 is the
  baseline every later task counts from.

- [ ] **Step 5: Prove the hook is still lint-clean and no dangling reference remains in it.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -n "vault-protocol" template/.claude/hooks/session-start.mjs || echo "clean"
  ```
  Expected output: `clean`

- [ ] **Step 6: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add template/.claude/hooks/session-start.mjs template/.claude/hooks/smoke-test.mjs && git commit -m "feat(hooks): session-start orients on both knowledge stores"
  ```
  Expected output contains: `2 files changed`

---

### Task 9: `guard.mjs` enforces the knowledge boundary

**Files:**
- Modify `template/.claude/hooks/guard.mjs` (constants after `:26`; helper after `:36`; a new branch in `main()` after the Read/Edit/Write secret branch at `:141-145`)
- Test: modify `template/.claude/hooks/smoke-test.mjs` (append a block at the end of the `guard.mjs` section, after the `configured baseBranch (develop) is protected` block that ends at `:245`)
- Modify `template/.claude/references/knowledge-protocol.md` (Step 7 restores two claims: the boundary rule and the write policy)
- Modify `template/.claude/agents/architect-agent.md` (Step 7 restores the claim in RECORD item 5)
- Modify `template/.claude/references/knowledge-base-scaffold/resources.md` (Step 7 restores the claim in the `[!danger]` callout)
- Modify `template/.claude/references/vault-scaffold/CLAUDE.md` (Step 7 restores the claim on the "How a repo reaches this vault" tail)
- Modify `tools/kb-check.mjs` (Step 10 corrects the `SECRET_SHAPE` comment, which says guard.mjs does not yet carry the twin)
- Test: modify `cli/kb-check.test.js` (Step 10 adds the byte-identity assert on the two regex literals)

**Interfaces:**
- Consumes: `harness.json` → `knowledge.shared` (Task 2 writes it).
- Produces: two PreToolUse denies. The shared-store deny exempts `projects/_index.md` — that folder is the REGISTRY (`vault-scaffold/CLAUDE.md:90` mandates a row per product there), and denying it would forbid the one write the folder still exists for. The KB deny scans LINE-WISE and honours the `<!-- kb-check:allow -->` hatch, the same waiver `tools/kb-check.mjs` honours, because a credential POINTER is shaped exactly like the thing being hunted. The secret-shape regex is the guard's own copy of `tools/kb-check.mjs`'s `SECRET_SHAPE` (Task 3) — duplicated on purpose, because hooks are copied standalone into adopter repos and must stay dependency-free; Step 10 adds the assert that detects the two drifting apart.

- [ ] **Step 1: Append the thirteen fixtures first (RED).** In `template/.claude/hooks/smoke-test.mjs`, immediately after the block that ends with `check("configured baseBranch (develop) is protected", denies(res));` and its closing `}` (line 245), and BEFORE the blank line 246 that precedes `console.log("stop-gate.mjs");` (line 247), insert:
  ```js
  {
    // The knowledge boundary. Project-scoped knowledge belongs in THIS repo's knowledge-base/;
    // a write into the shared store's projects/ re-forks the truth the boundary rule exists to
    // prevent. Traces to: docs/design/2026-08-03-project-local-knowledge-base.md, decision 10.
    const proj = mkdtempSync(join(tmpdir(), "phe-kb-proj-"));
    const shared = mkdtempSync(join(tmpdir(), "phe-kb-shared-"));
    mkdirSync(join(proj, ".claude"), { recursive: true });
    writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
      knowledge: { local: "knowledge-base", shared: { mode: "existing", path: shared }, migratedAt: "2026-08-03T00:00:00Z" },
    }));
    const intoProjects = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
    check("denies Write into <shared>/projects/", denies(intoProjects));
    const intoWiki = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(shared, "wiki", "patterns.md"), content: "# Patterns\n" } });
    check("allows Write into <shared>/wiki/ (evergreen still lives there)", !denies(intoWiki));
    // projects/ is the REGISTRY: vault-scaffold/CLAUDE.md:90 mandates a row per product there.
    // Denying its _index.md would forbid the one write the folder exists for.
    const registry = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(shared, "projects", "_index.md"), content: "| acme | ~/dev/acme | active |\n" } });
    check("allows the registry row at <shared>/projects/_index.md", !denies(registry));
    // Edit, not Write: architect-agent holds Edit and that is how it appends to an existing file.
    const editIntoProjects = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Edit",
      tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), old_string: "a", new_string: "b" } });
    check("denies an Edit into <shared>/projects/ (the deny is not Write-only)", denies(editIntoProjects));
    const noConf = mkdtempSync(join(tmpdir(), "phe-kb-noconf-"));
    const unconfigured = runHook("guard.mjs", { ...base, cwd: noConf, tool_name: "Write",
      tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
    check("no knowledge config -> no shared-store deny (fail open)", !denies(unconfigured));
    writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
      knowledge: { local: "knowledge-base", shared: { mode: "existing", path: shared }, migratedAt: null },
    }));
    const preMigration = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
    check("migratedAt null -> no shared-store deny (/knowledge-migrate must be able to clean up)", !denies(preMigration));
    // A path is present but the mode is not `existing` — only the mode tells this apart from a
    // configured store, so dropping the mode test leaves this the only failing check.
    writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
      knowledge: { local: "knowledge-base", shared: { mode: "none", path: shared }, migratedAt: "2026-08-03T00:00:00Z" },
    }));
    const modeNone = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
    check("shared mode none -> no shared-store deny even with migratedAt set", !denies(modeNone));
    writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
      knowledge: { local: "knowledge-base", shared: { mode: "existing", path: shared }, migratedAt: "2026-08-03T00:00:00Z" },
    }));

    // knowledge-base/ is git-TRACKED and the repo may be public: a secret written here is
    // PUBLISHED, not merely stored. Pointers pass; values do not.
    const secret = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "aws_key: AKIAIOSFODNN7EXAMPLE\n" } });
    check("denies a secret-shaped string written into knowledge-base/", denies(secret));
    const pointer = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "Deploy key lives in 1Password — pointer only.\n" } });
    check("allows a credentials INDEX (pointers only) in knowledge-base/", !denies(pointer));
    const elsewhere = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(proj, "src", "config.ts"), content: "aws_key: AKIAIOSFODNN7EXAMPLE\n" } });
    check("the secret-shape scan is scoped to knowledge-base/ only", !denies(elsewhere));
    // Edit carries its payload in new_string, not content — the field the Write fixtures never reach.
    const editSecret = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Edit",
      tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), old_string: "x", new_string: "aws_key: AKIAIOSFODNN7EXAMPLE\n" } });
    check("denies an Edit whose new_string carries a secret shape", denies(editSecret));
    // The blessed escape hatch, byte-for-byte the one tools/kb-check.mjs honours. A real
    // credential POINTER is shaped exactly like the thing being hunted, so without the hatch the
    // scaffold's own documented workflow is unperformable.
    const barePointer = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "password: 1Password/Shared-Engineering\n" } });
    check("a credential pointer that trips the regex still denies without the hatch", denies(barePointer));
    const hatched = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
      tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "password: 1Password/Shared-Engineering <!-- kb-check:allow -->\n" } });
    check("the <!-- kb-check:allow --> hatch waives that line (kb-check parity)", !denies(hatched));
  }
  ```

- [ ] **Step 2: Run the smoke test and see it fail.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | tail -1
  ```
  Expected output: `109 passed, 5 failed` (exit 1). The five failures are `denies Write into <shared>/projects/`, `denies an Edit into <shared>/projects/ (the deny is not Write-only)`, `denies a secret-shaped string written into knowledge-base/`, `denies an Edit whose new_string carries a secret shape`, and `a credential pointer that trips the regex still denies without the hatch`. The other eight assert that the guard does NOT deny, so they pass before the matchers exist — Step 9's mutation kills are what prove them non-vacuous.

- [ ] **Step 3: Add the constant to `template/.claude/hooks/guard.mjs`.** Immediately after `const PROTECTED = new Set(["main", "master"]);` (`:26`), insert:
  ```js
  // knowledge-base/ is git-TRACKED, and a harnessed repo may be public: a credential written
  // there is PUBLISHED, not merely stored. Modelled on BASH_SECRET above — shape detection,
  // not entropy. Duplicated (not imported) in tools/kb-check.mjs on purpose: hooks are copied
  // standalone into adopter repos and must stay dependency-free. Keep the two in sync — this
  // blocks the WRITE, kb-check blocks the COMMIT.
  const KB_SECRET = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-(?:proj|ant|[a-z]{2,8})-[A-Za-z0-9_\-]{20,}|\bsk-[A-Za-z0-9]{20,}|\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abprs]-[A-Za-z0-9-]{20,}|\bAIza[A-Za-z0-9_\-]{35}\b|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}|(?:password|passwd|api[_-]?key|secret|token)[A-Za-z0-9_.\-]*\s*[:=]\s*["']?[A-Za-z0-9_\-+/]{12,})/i;
  ```

- [ ] **Step 4: Add the resolver helper to `template/.claude/hooks/guard.mjs`.** Immediately after the `protectedBranches(cwd)` function's closing `}` (`:36`), insert:
  ```js
  // The shared knowledge store (an Obsidian vault) if one is configured AND the
  // one-way migration out of it has already happened. Only `existing` + a non-null
  // `migratedAt` counts: before the migration, /knowledge-migrate itself has to
  // write into <shared>/projects/ to clean it up (spec: deny "after migration").
  function sharedStorePath(cwd) {
    try {
      const cfg = JSON.parse(readFileSync(join(cwd, ".claude", "harness.json"), "utf8"));
      const k = cfg.knowledge;
      if (!k || !k.migratedAt) return null;
      const s = k.shared;
      if (s && s.mode === "existing" && typeof s.path === "string" && s.path) return resolve(s.path);
    } catch { /* no config / unreadable: no shared store to protect — fail open */ }
    return null;
  }
  ```

- [ ] **Step 5: Add the deny branch in `main()`.** Immediately after the existing Read/Edit/Write/NotebookEdit secret-path block (which ends at `:145` with `}`), insert:
  ```js
    // The knowledge boundary (two stores, one rule). Project-scoped knowledge lives in THIS
    // repo's knowledge-base/; the shared vault keeps evergreen wiki/ + agent-kb/ only.
    // Reads are untouched — this blocks the two WRITES that would re-fork the truth.
    if (["Edit", "Write", "NotebookEdit"].includes(tool) && input.file_path) {
      const kbCwd = event.cwd || process.cwd();
      const target = resolve(kbCwd, input.file_path);
      const shared = sharedStorePath(kbCwd);
      // projects/_index.md is the REGISTRY — one row per product, repo path and status, not
      // knowledge — and the vault's own doctrine mandates that row. Denying it would forbid the
      // one write the folder still exists for. Everything ELSE under projects/ is the fork.
      if (shared && (target + "/").startsWith(shared + "/projects/")
          && target !== resolve(shared, "projects", "_index.md")) {
        deny(`'${input.file_path}' is inside the shared store's projects/ — project-scoped knowledge lives in this repo's knowledge-base/ instead. Promotion MOVES a fact to the shared store; nothing is ever kept in both. Only projects/_index.md (the registry row) stays writable. See .claude/references/knowledge-protocol.md.`);
      }
      if ((target + "/").startsWith(resolve(kbCwd, "knowledge-base") + "/")) {
        // Line-wise, and a line carrying the <!-- kb-check:allow --> hatch is waived — the same
        // escape hatch tools/kb-check.mjs honours, for the same reason: a credential POINTER
        // ("password: 1Password/Shared-Engineering") is shaped exactly like the thing being
        // hunted, and resources.md exists to hold pointers. A whole-body test made the
        // scaffold's own documented waiver unreachable.
        const body = `${input.content || ""}\n${input.new_string || ""}`;
        for (const line of body.split("\n")) {
          if (line.indexOf("<!-- kb-check:allow -->") !== -1) continue;
          if (KB_SECRET.test(line)) {
            deny("This write puts a secret-shaped string into knowledge-base/, which is git-tracked and may be published. Record a POINTER to where the credential lives (1Password, the platform's secret manager) — never the value. A pointer that itself looks secret-shaped is waived one line at a time with a trailing <!-- kb-check:allow -->. See .claude/references/knowledge-protocol.md.");
          }
        }
      }
    }
  ```

- [ ] **Step 6: Run the smoke test and see it pass.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | tail -1
  ```
  Expected output: `114 passed, 0 failed` (exit 0).

- [ ] **Step 7: Restore the five `guard.mjs` claims this commit has now earned.** Every one of these
  was removed, or written without its guard clause, under the branch rule that a claim ships only
  when its mechanism exists. The matchers landed in Steps 3–5, so the clauses come back HERE, in the
  same commit — not earlier, not later.

  1. `template/.claude/references/knowledge-protocol.md`, boundary rule — replace the paragraph
     ending `` Never write project knowledge into `<shared>/projects/` — it belongs in that repo's
     own `knowledge-base/`. `` with `` Never write project knowledge into `<shared>/projects/`:
     `.claude/hooks/guard.mjs` denies it once the migration has run. `` The trailing qualifier is
     load-bearing: `sharedStorePath()` returns null until `migratedAt` is stamped, so an
     unqualified sentence claims more than Step 5 delivers.
  2. `template/.claude/references/knowledge-protocol.md`, write policy — in the bullet beginning
     `` `knowledge-base/` is git-TRACKED and may be published ``, restore the guard sentence so it
     reads `` `guard.mjs` denies a secret-shaped write; `npx perfect-harness-engineering kb-check`
     gates it again at `/validate` and at `/evolve`'s apply step. ``
  3. `template/.claude/agents/architect-agent.md`, RECORD item 5 — the anchor WRAPS across two
     lines. Match both lines, the newline between them, AND the three-space continuation indent;
     the prefix `` `kb-check` fails the gate `` matches the wrapped and the contiguous form alike,
     so it cannot tell you whether you have the real text. Replace
     ```
     5. Never write a credential VALUE — `knowledge-base/resources.md` holds pointers only; `kb-check` fails the gate
        on one.
     ```
     with
     ```
     5. Never write a credential VALUE — `knowledge-base/resources.md` holds pointers only;
        `guard.mjs` denies the write and `kb-check` fails the gate.
     ```
     The new wrap point also retires the 114-character `:61`: the `knowledge-base/` prefix was added
     without re-wrapping because the only safe wrap point sat inside this anchor. This is the first
     step that may move it.
  4. `template/.claude/references/knowledge-base-scaffold/resources.md` — in the `[!danger]`
     callout, restore the two-line form:
     `` > Record **where** a credential lives, never the value itself. `.claude/hooks/guard.mjs` ``
     `` > denies a secret-shaped write here, and `kb-check` fails the gate on one. ``
     The two `<!-- kb-check:allow -->` hatch lines below it stay exactly as they are.
  5. `template/.claude/references/vault-scaffold/CLAUDE.md` — restore the tail of the sentence
     ending `the repo's agents read `wiki/` and `agent-kb/` from that path.` so it reads
     `` …from that path, and once that repo has migrated out, its `guard.mjs` denies writes into
     `projects/` beyond the registry. `` Both qualifiers are load-bearing: `:90` of this same file
     mandates a registry row in `projects/_index.md`, which Step 5 exempts.

  Then prove every restored claim is now true of the shipped hook:
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -n "KB_SECRET\|sharedStorePath\|projects/" template/.claude/hooks/guard.mjs | head -20
  ```
  Expected: the `KB_SECRET` constant, the `sharedStorePath` helper, and the `projects/` prefix test
  from Step 5 all present. A restored claim with no matching line in `guard.mjs` is the exact defect
  this step exists to prevent — remove the claim rather than ship it.

- [ ] **Step 8: Prove the hook still fails open on garbage (the non-negotiable property).**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | grep "survives malformed input (fail-open)" | head -1
  ```
  Expected output: `  PASS  survives malformed input (fail-open)`

- [ ] **Step 9: Prove the three fixtures that pass before the hook exists are not vacuous.** Eight of
  Step 1's thirteen checks assert the guard does NOT deny, so they were green in Step 2 as well. Three
  of them pin behaviour nothing else pins; apply each mutation to `guard.mjs`, run the smoke test, see
  the NAMED check red, then restore and see it green.
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && cp template/.claude/hooks/guard.mjs /tmp/guard.bak
  perl -0pi -e 's/if \(s && s\.mode === "existing" && typeof/if (s \&\& typeof/' template/.claude/hooks/guard.mjs
  node template/.claude/hooks/smoke-test.mjs | grep -E "shared mode none -> no shared-store|passed,"
  cp /tmp/guard.bak template/.claude/hooks/guard.mjs
  perl -0pi -e 's/const body = `\$\{input\.content \|\| ""\}\\n\$\{input\.new_string \|\| ""\}`;/const body = `\${input.content || ""}`;/' template/.claude/hooks/guard.mjs
  node template/.claude/hooks/smoke-test.mjs | grep -E "Edit whose new_string|passed,"
  cp /tmp/guard.bak template/.claude/hooks/guard.mjs
  perl -0pi -e 's/  if \(\["Edit", "Write", "NotebookEdit"\]\.includes\(tool\) && input\.file_path\) \{/  if (["Write"].includes(tool) \&\& input.file_path) {/' template/.claude/hooks/guard.mjs
  node template/.claude/hooks/smoke-test.mjs | grep -E "denies an Edit|passed,"
  cp /tmp/guard.bak template/.claude/hooks/guard.mjs && rm /tmp/guard.bak
  node template/.claude/hooks/smoke-test.mjs | tail -1
  ```
  Expected: `shared mode none -> no shared-store deny even with migratedAt set` FAILs at `113 passed,
  1 failed`; `denies an Edit whose new_string carries a secret shape` FAILs at `113 passed, 1 failed`;
  both `denies an Edit …` checks FAIL at `112 passed, 2 failed`; then `114 passed, 0 failed` after the
  final restore. A mutation that leaves 114 green means the fixture does not pin what it names.

- [ ] **Step 10: Make the duplicated regex detectable when it drifts.** `KB_SECRET` (Step 3) is a
  hand-copy of `tools/kb-check.mjs`'s `SECRET_SHAPE`, and until now nothing noticed them diverging —
  a drift means one gate accepts exactly what the other rejects. The assert canNOT live in
  `smoke-test.mjs`: that file ships into adopter repos where `tools/kb-check.mjs` does not exist.

  In `tools/kb-check.mjs`, replace the five comment lines above `const SECRET_SHAPE` (which still say
  guard.mjs "does NOT yet carry it — a later increment lands the same regex there") with:
  ```js
  // This literal also lives in `template/.claude/hooks/guard.mjs` as `KB_SECRET`, DUPLICATED
  // rather than imported (hooks are copied standalone into adopter repos and must stay
  // dependency-free and copy-safe). guard.mjs blocks the WRITE, this blocks the COMMIT, and
  // both honour the same `<!-- kb-check:allow -->` line hatch. `cli/kb-check.test.js` pins the
  // two source strings byte-identical; that assert cannot live in the hooks' own smoke test,
  // which ships into adopter repos where this file does not exist.
  ```
  Then in `cli/kb-check.test.js`, immediately before the closing `fs.rmSync(TEST_DIR, …)`, insert:
  ```js
  console.log('the guard.mjs twin stays byte-identical:');
  // This tool blocks the COMMIT; template/.claude/hooks/guard.mjs blocks the WRITE using a
  // DUPLICATE of the same literal — duplicated because hooks are copied standalone into adopter
  // repos and must stay dependency-free. Nothing else detects the two drifting apart, and a drift
  // means one gate accepts exactly what the other rejects. This assert cannot live in the hooks'
  // smoke test: that file ships into adopter repos, where tools/kb-check.mjs does not exist.
  const GUARD = path.join(__dirname, '..', 'template', '.claude', 'hooks', 'guard.mjs');
  function regexLiteral(file, name) {
    var m = fs.readFileSync(file, 'utf-8').match(new RegExp('^const ' + name + ' = (/.*/[a-z]*);$', 'm'));
    return m === null ? null : m[1];
  }
  var toolLiteral = regexLiteral(KB_CHECK, 'SECRET_SHAPE');
  var hookLiteral = regexLiteral(GUARD, 'KB_SECRET');
  assert('SECRET_SHAPE (tools/kb-check.mjs) and KB_SECRET (template/.claude/hooks/guard.mjs) are byte-identical',
    toolLiteral !== null && hookLiteral !== null && toolLiteral === hookLiteral);
  ```
  Then prove the assert is not vacuous — drift one character and watch it fire:
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/kb-check.test.js | tail -1
  cp template/.claude/hooks/guard.mjs /tmp/guard.bak
  perl -0pi -e 's/\\bAKIA\[0-9A-Z\]\{16\}\\b/\\bAKIA[0-9A-Z]{17}\\b/' template/.claude/hooks/guard.mjs
  node cli/kb-check.test.js | tail -1
  cp /tmp/guard.bak template/.claude/hooks/guard.mjs && rm /tmp/guard.bak
  node cli/kb-check.test.js | tail -1
  ```
  Expected: `50 passed, 0 failed`, then `49 passed, 1 failed`, then `50 passed, 0 failed`.

- [ ] **Step 11: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add template/.claude/hooks/guard.mjs template/.claude/hooks/smoke-test.mjs template/.claude/references/knowledge-protocol.md template/.claude/agents/architect-agent.md template/.claude/references/knowledge-base-scaffold/resources.md template/.claude/references/vault-scaffold/CLAUDE.md tools/kb-check.mjs cli/kb-check.test.js && git commit -m "feat(hooks): guard denies shared-store project writes and KB secret writes"
  ```
  Expected output contains: `8 files changed`

---

### Task 10: The evidence rung — plan field, report row, placeholder gate

**Files:**
- Modify `template/.claude/references/plan-template.md` (`:22`)
- Modify `template/.claude/skills/implement/SKILL.md` (report table, after `:78`)
- Modify `template/.claude/skills/harness-init/SKILL.md` (`:50`, `:57` sentence delete, `:63` line delete, `:67`, `:68`, `:81`)
- Modify `cli/cli-hardening.test.js` (`:313-316`, the pinned `GATE_CMD` literal)

**Interfaces:**
- Consumes: the scaffold path `.claude/references/knowledge-base-scaffold/` (Task 3) and `.claude/references/knowledge-protocol.md` (Task 5).
- Produces: nothing consumed downstream — this is the last wiring task before docs.

**Budget note:** `harness-init/SKILL.md` body is at 98/100 and `implement/SKILL.md` at 94/100 — both measured the way `tools/context-ledger.mjs` measures a body (everything after the frontmatter's closing `---`, including the blank line that follows it, trailing newline stripped). Counting from the first non-blank line instead gives 97 and is the wrong number; the ledger is what enforces the cap. `:50`, `:67`, `:68` and `:81` are one-line replacements (net 0) and Step 6c's `:57` is a sentence deletion inside a surviving line (net 0), so the only line-count change is Step 6c deleting `:63`: **98 → 97**. The implement change is +1 (→95). Both stay under cap.

- [ ] **Step 1: Extend the pinned `GATE_CMD` literal in `cli/cli-hardening.test.js:313-316` first (RED).** Replace
  ```js
  const GATE_CMD =
    "grep -rnoE '<[A-Za-z][^<>]*>' AGENTS.md .claude/rules/ .claude/skills/architecture-map/ " +
    '.claude/skills/debugging-this-repo/ \\| grep -vE ' +
    "'<(" + GATE_ALLOW.join('\\|') + ")>$'";
  ```
  with
  ```js
  const GATE_CMD =
    "grep -rnoE '<[A-Za-z][^<>]*>' AGENTS.md .claude/rules/ knowledge-base/ \\| grep -vE " +
    "'<(" + GATE_ALLOW.join('\\|') + ")>$'";
  ```
  The two skill directories leave the literal because Step 3 drops them from the shipped gate, and
  this literal must equal that gate byte-for-byte. The `pristine` array at `:327-343` is a separate
  hardcoded list — it keeps `AGENTS.md` plus both skills and is NOT edited here.

- [ ] **Step 2: Run the test and see it fail.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js 2>&1 | grep -A2 "harness-init step 4"
  ```
  Expected output contains:
  ```
    FAIL  harness-init step 4 ships exactly the pinned placeholder gate
  ```

- [ ] **Step 3: Update `template/.claude/skills/harness-init/SKILL.md:81` in lockstep.** In the VERIFY table row, replace `AGENTS.md .claude/rules/ .claude/skills/architecture-map/ .claude/skills/debugging-this-repo/` with `AGENTS.md .claude/rules/ knowledge-base/` — the KB comes IN because it now holds the content the two knowledge skills used to, and both skill dirs go OUT because Task 7 turned them into thin pointers whose `<…>` tokens are notation inside generic prose, not fill slots, so grepping them can only ever produce a gate that cannot pass. Then replace the row's description tail `path notation (\`backlog/<id>-<slug>.md\`, \`sprints/<n>.md\`, \`wiki/stack/<tool>/\`) and the real HTML tags in \`rules/frontend.md\`.` with `path notation (\`backlog/<id>-<slug>.md\`, \`sprints/<n>.md\`, \`wiki/stack/<tool>/\`) and the real HTML tags in \`rules/frontend.md\`. \`knowledge-base/\` is in scope because the KB now holds the content the two knowledge skills used to; the skills themselves are out because their remaining \`<…>\` tokens are notation, not fill slots.`

- [ ] **Step 4: Run the test and see it pass.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js | tail -2
  ```
  Expected output: `19 passed, 0 failed`

- [ ] **Step 5: Replace `harness-init/SKILL.md:50` (interview question 5).** Replace
  ```
  5. Vault: read `.claude/harness.json` `vault` (recorded at `init`). `existing` → confirm the path; `scaffold` → confirm where to create it; `none` → confirm skipping, or offer to add one now. (No `vault` key — a pre-vault install — → ask as before: path / scaffold / skip.)
  ```
  with
  ```
  5. Knowledge: `knowledge-base/` is created either way — no question. Read `.claude/harness.json` `knowledge.shared` (recorded at `init`): `existing` → confirm the path; `none` → confirm no shared store, or offer to add one now. (No `knowledge` key — a pre-knowledge install — → ask: shared vault path / skip.)
  ```

- [ ] **Step 6: Replace `harness-init/SKILL.md:68` (the generate step).** Replace
  ```
  - Vault (from `harness.json` `vault`): `scaffold` → copy `.claude/references/vault-scaffold/` to the chosen path; `existing` → use that vault. Either → ensure `projects/<name>/` exists there (copy `system/templates/project-template/` and register it in `projects/_index.md` if absent); replace `<ABSOLUTE_VAULT_PATH>` in the pointer block with the vault's absolute path and paste its fenced content into the repo `AGENTS.md` slot, filling `<project-name>`. Then WIRE THE ARCHITECT AGENT: confirm it resolves its KB — the pointer block is present in `AGENTS.md` and `projects/<name>/architecture.md` exists (the agent reads them). `none` → leave the `AGENTS.md` vault comment as-is; the architect agent falls back to a codebase scan. Index Law already holds in the scaffold.
  ```
  with
  ```
  - Knowledge: copy `.claude/references/knowledge-base-scaffold/` to `./knowledge-base/` (ALWAYS — it is git-tracked project content, not a payload file), then FILL it from detection + interview: EVERY `<placeholder>` in EVERY file — `_index.md` and each file's frontmatter `project:` + `# heading` pair included — deleting rows/sections that don't apply. Step 4's gate greps the WHOLE directory, so one survivor ends the init red, and `kb-check` will not catch it: its placeholder test is byte-identity against the scaffold, so a comment-stripped KB passes with every `<…>` intact. Richest sections: `architecture.md` (stack, module table, where-new-code-goes, `## Boundaries`, integration points), `runbook.md` (logs, repro recipes, failure classes from question 4), `resources.md` (links, infra, credential POINTERS only), `decisions.md` (any incident that was really a decision). Delete the `<!-- … -->` guidance comments. Verify with `npx perfect-harness-engineering kb-check` AND step 4's placeholder gate — neither covers the other. Shared store `existing` (from `harness.json` `knowledge.shared`) → it keeps `wiki/` + `agent-kb/` only; ensure both exist there, copying `.claude/references/vault-scaffold/` if the path is empty. `none` → local only; say so. Index Law already holds in both scaffolds.
  ```

- [ ] **Step 6b: Replace `harness-init/SKILL.md:67` (the `.gitignore` line).** Replace
  ```
  - `.gitignore`: add `.claude/state/` + `.worktrees/` — runtime state and /implement's in-repo worktrees never commit.
  ```
  with
  ```
  - `.gitignore`: add `.claude/state/` + `.worktrees/` + `knowledge-base/.obsidian/` — runtime state, /implement's in-repo worktrees, and the operator's Obsidian workspace never commit (spec decision 24: no `.obsidian/` ships; the operator opens the folder).
  ```

- [ ] **Step 6c: Retire the two stranded knowledge-skill fill instructions (`:57` and `:63`).** Task 7
  replaced both skill bodies with thin KB pointers, so the TEMPLATE sections — and the
  `filled by /harness-init` comment markers at `architecture-map/SKILL.md:16` and
  `debugging-this-repo/SKILL.md:11` — stop existing. Two lines still tell `/harness-init` to fill
  them. **The two have different shapes; do not treat them alike.**

  **`:57` — delete the SECOND SENTENCE ONLY.** The bullet's first sentence is still correct and must
  survive. Replace
  ```
  - `AGENTS.md`: fill EVERY `<placeholder>`; delete rows/sections that don't apply — a placeholder in a live AGENTS.md is a bug. Knowledge skills: fill their template sections from detection and DELETE the `filled by /harness-init` comment markers.
  ```
  with
  ```
  - `AGENTS.md`: fill EVERY `<placeholder>`; delete rows/sections that don't apply — a placeholder in a live AGENTS.md is a bug.
  ```
  The line survives, shorter: this is a sentence deletion, net **0** lines.

  **`:63` — delete the WHOLE LINE**, leaving no blank behind:
  ```
  - Knowledge skills: fill the TEMPLATE sections of `.claude/skills/architecture-map/SKILL.md` (module table, where new code goes, boundaries) and `.claude/skills/debugging-this-repo/SKILL.md` (logs, repro recipes, failure classes from question 4) from detection.
  ```
  Deleting rather than repointing is what the redundancy earns: every clause is already covered by
  Step 6's rewritten `:68`, which fills the same facts into the KB instead — module table,
  where-new-code-goes and `## Boundaries` into `knowledge-base/architecture.md`; logs, repro recipes
  and failure classes from question 4 into `knowledge-base/runbook.md`; both "from detection".
  Net **-1** line.

  This step runs AFTER Steps 3, 5, 6 and 6b on purpose: they cite `:81`, `:50`, `:68` and `:67`, and
  removing `:63` first would shift every one of those. Task 10's commit step is unaffected:
  `harness-init/SKILL.md` is already in Step 11's `git add template`, so the expected
  `4 files changed` still holds.

- [ ] **Step 7: Extend the plan template's existing knowledge field at `plan-template.md:22`.** Replace
  ```
  - Knowledge to load first: <.claude/skills/architecture-map, docs/x.md, ...> # /implement reads these BEFORE Task 1 — they were in the planner's context and died at /clear
  ```
  with
  ```
  - Knowledge to load first: <LOCAL: knowledge-base/architecture.md#Boundaries, knowledge-base/decisions.md · SHARED: wiki/stack/<tool>/…> # BOTH stores, every time. A store with nothing relevant gets the literal `none — <reason>`; an empty field is a bug. /implement reads these BEFORE Task 1 — they were in the planner's context and died at /clear
  ```

- [ ] **Step 8: Add the Knowledge row to `implement/SKILL.md`'s report table.** After the `| Task status | … |` row (`:78`), insert:
  ```
  | Knowledge | `knowledge-base/` files read before Task 1 (the plan's `Knowledge to load first:`) and every KB file this run changed. `none` is a valid value; an empty cell is not |
  ```

- [ ] **Step 9: Prove both skill bodies stayed under cap.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node tools/context-ledger.mjs template
  ```
  Expected: no `!! WARN` lines (which is how a body over 100 reports), no `!! HARD` lines, `Status: WARN` with a total ≤ 1654.

- [ ] **Step 10: Run every CLI suite and the hooks.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && npm test 2>&1 | tail -4
  ```
  Expected: the last suite's summary `114 passed, 0 failed` and exit 0.

- [ ] **Step 11: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add template cli/cli-hardening.test.js && git commit -m "feat(pipeline): knowledge evidence rung — plan field, report row, gate covers knowledge-base/"
  ```
  Expected output contains: `4 files changed`

---

### Task 11: Docs, ADRs, and the full acceptance gate

**Files:**
- Modify `docs/05-knowledge-layer.md` (rewrite; keep ≤130 lines)
- Modify `docs/99-sources.md` (`:58`)
- Modify `README.md` (`:29`)
- Modify `template/.claude/references/research-and-docs.md` (Step 2b — terminology only, 5 lines)
- Modify `template/.claude/skills/research/SKILL.md` (Step 2b — terminology only, 4 lines)
- Create `~/.phe-backups/vault-<ts>.tgz` (Step 3b — the mandatory, verified undo for the two vault edits below; the shared store has no git)
- Modify `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (add ADR-014, ADR-015, ADR-016; ADR-010 cross-reference; bump frontmatter `updated:`)
- Modify `~/Dev/The Vault/projects/perfectHarnessEngineering/_index.md` (bump `updated:` — Index Law)

**These two vault edits are the ONLY writes in increment 1 that land outside the repo.** They are
gated on Step 3b's verified backup: no backup, no edit, report BLOCKED.

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: the recorded doctrine. Nothing consumes it in code.

- [ ] **Step 1: Rewrite `docs/05-knowledge-layer.md`.** Replace the whole file with:
  ````markdown
  # 05 · Knowledge Layer — local `knowledge-base/` + a shared store

  ## Two stores, one boundary rule

  | Store | Holds | Question it answers | Lifetime |
  |---|---|---|---|
  | Repo harness (`AGENTS.md`, rules, references, `plans/`, `reports/`) | How to work HERE: commands, conventions, enforcement, pipeline artifacts | "How do I change this code safely?" | Lives and dies with the repo |
  | LOCAL `knowledge-base/` (in the repo, git-tracked) | What we KNOW about THIS product: architecture, ADRs, runbook, credential pointers, capture, cited research | "What do we know about this product?" | Travels with the code branch; survives a clone |
  | SHARED store (an Obsidian vault) | Evergreen, cross-project: `wiki/`, `agent-kb/`, `wiki/stack/<tool>/` | "What do we know about this pattern / tool?" | Outlives any repo |

  **The boundary rule replaces the old "sole source of truth" doctrine.** Project-scoped facts live
  local; generalized facts live shared; **promotion MOVES**. `/evolve` deletes the local file on
  promotion and leaves a one-line pointer in `knowledge-base/_index.md`. Exactly one copy of any
  fact exists — this is not the mirror ADR-001 forbade, because no fact is ever in both stores.

  This reverses ADR-001 (ADR-014). What it buys: portability (the KB survives a clone, which
  ADR-001 recorded as its own downside), reviewability (the KB lands in the PR diff), and
  verifiable relative `sources:` paths. What it does NOT buy: automatic harvest — `/evolve` stays
  ask-first. Spec: `docs/design/2026-08-03-project-local-knowledge-base.md`.

  ## Shape

  ```
  knowledge-base/
    _index.md          contents map (Index Law) + the "promoted out" pointer list
    architecture.md    module map, ## Boundaries, data flow    <- architect-agent writes
    decisions.md       ADRs                                     <- architect-agent writes
    resources.md       credentials INDEX (pointers only), links
    runbook.md         how to drive the app, known failure classes
    inbox/             raw project capture
    research/          project research + the cited briefs
    .obsidian/         gitignored, created by the operator on first open
  ```

  Shipped as `template/.claude/references/knowledge-base-scaffold/`; `/harness-init` copies it to
  `./knowledge-base/` and fills it. No `.obsidian/` ships — the folder is Obsidian-openable, and the
  operator opens it.

  ## Linkage — one config key, no pointer block

  `.claude/harness.json` → `knowledge`, written once by `npx perfect-harness-engineering init`:

  ```json
  "knowledge": {
    "local": "knowledge-base",
    "shared": { "mode": "existing", "path": "/abs/path/to/vault" },
    "migratedAt": null
  }
  ```

  The pointer block is gone. It existed to name a vault path inside prose that had to be pasted and
  kept in sync per repo; one config key does the same job and is machine-readable.
  `session-start.mjs` emits one orientation line per store from it.

  ## The Index Law — the correctness invariant, unchanged

  **Every folder that holds notes has an `_index.md`. At any depth. No exceptions** (`.obsidian/`,
  `.claude/` and `**/archive/` are exempt). Whenever you add, rename, move or delete a note, you
  update that folder's `_index.md` **in the same change**: fix the contents map, bump `updated:`.
  This is the one KB property that is mechanically checkable, and `kb-check` checks it.

  Navigation stays at 2–3 reads locally (`knowledge-base/_index.md` → the file) and 3–4 reads in the
  shared store (`CLAUDE.md` → `_index.md` → folder `_index.md` → the note).

  ## Enforcement — three rungs

  | Rung | Mechanism |
  |---|---|
  | Guidance | `AGENTS.md` knowledge bullet + `00-core.md`'s two routing rows; `.claude/references/knowledge-protocol.md` on cite |
  | Evidence | `plan-template.md`'s `Knowledge to load first:` requires BOTH stores or a literal `none — <reason>`; `/implement`'s report table carries a Knowledge row; `kb-check` gates the KB itself, never the plan field |
  | Hook | `guard.mjs` denies `Write(<shared>/projects/**)` once `migratedAt` is stamped — except the `projects/_index.md` registry row — and any secret-shaped `Write(knowledge-base/**)`, line-wise, honouring the `<!-- kb-check:allow -->` hatch |

  `npx perfect-harness-engineering kb-check` (`tools/kb-check.mjs`) makes exactly three claims,
  because exactly three are decidable: **(a)** every KB folder has an `_index.md`, **(b)** no file is
  byte-identical to the shipped scaffold placeholder, **(c)** no secret-shaped strings. "The
  `_index.md` is ACCURATE" is semantic and is deliberately not claimed. It runs in `/validate` AND
  in `/evolve`'s apply step, because `/validate` is pipeline step 4 and the KB commit happens at
  step 7 — the gate has to be where the commit is.

  The evidence rung is a nudge, not a guarantee: `none — <reason>` passes by design. It is also
  **not mechanically gated** — `kb-check` checks the KB, not the plan. The spec's "gates on
  presence" line was scoped out: a plan's `Knowledge to load first:` field lives in `plans/`, which
  `/validate` does not own, and gating on a field the planner can satisfy with `none — <reason>`
  buys nothing a review does not. Recorded as a deliberate deviation in ADR-014.

  ## Branch semantics

  `knowledge-base/` travels with the code branch — a work artifact like `plans/` and `reports/`, NOT
  a tracking-root file (ADR-010 does not cover it). Mid-work writes dirty the tree during
  `/implement`; `/evolve` stages and commits them as one `docs(kb):` commit on the feature branch,
  merging with the PR. A finding on an abandoned branch dies with it — the same property `plans/`
  already has, and the accepted cost.

  The reviewer reads the **base-branch** KB (`git show <base>:knowledge-base/…`), because
  `/review-branch` diffs `<base>...HEAD` at step 5 while the KB commit lands at step 7. ADR-015
  reverses ADR-003/ADR-012's reviewer-isolation scope for exactly this file set; "reviewed" in the
  decision log means human PR review.

  ## Knowledge flow — `/evolve` is the bridge

  Two harvest triggers, cleanly divided. `/evolve` owns **session lessons**. `/research` owns
  **external-tool knowledge**, which — being inherently cross-project — writes straight to the
  shared `wiki/stack/<tool>/` and never lands locally. Detail:
  `.claude/references/research-and-docs.md`.

  ## Claude Code auto-memory — complement, not replacement

  Auto-memory holds MACHINE-LOCAL facts: env quirks, ports, local workarounds. `knowledge-base/`
  holds team knowledge. Rule of thumb: would a teammate need it? → `knowledge-base/`. Would only
  this agent, on this machine, need it? → auto-memory.

  ## Secrets

  NEVER a value, anywhere. `resources.md` carries a credentials **index**: record *where* each
  secret lives (1Password, the platform's secret manager), never the value. `knowledge-base/` is
  git-tracked and a harnessed repo may be public, so this is enforced twice — `guard.mjs` denies the
  write, `kb-check` fails the gate.

  ## Sources

  - `docs/design/2026-08-03-project-local-knowledge-base.md` — the spec, its 28 locked decisions,
    and the adversarial review that shaped them.
  - The Vault — Index Law, frontmatter schema, and the `agent-kb/` harvest failure that this design
    explicitly does NOT fix (known limit 1). Research brief:
    `~/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md`.
  - Cole Medin `second-brain-starter` — memory routing table; the "durable domain memory vs harness
    ephemera" split the auto-memory section keeps. Research brief: `second-brain-starter.md`.
  - Claude Code docs — auto-memory limits. Research brief:
    `~/Dev/The Vault/inbox/research/phe-harness/claude-code-docs.md`.
  ````

- [ ] **Step 2: Fix the two dangling doc references.** In `docs/99-sources.md:58` replace
  ```
  - Pointer block (`system/pointer-block.md`): repo CLAUDE.md → vault, with a mandatory write-back clause → the template's paste-here comment.
  ```
  with
  ```
  - Repo → shared-store linkage: `.claude/harness.json` → `knowledge.shared` (the pointer block it replaced is gone; see docs/05).
  ```
  In `README.md:29` replace `pointer-block wiring to an Obsidian vault;` with `a git-tracked project-local \`knowledge-base/\` plus an optional shared Obsidian vault for evergreen knowledge;`.

- [ ] **Step 2b: Retire the vault-era terminology in the two research files.** Step 3's grep matches
  `vault-protocol|pointer-block|project-template`; the bare word "vault" is invisible to it, so
  neither file below is caught by any gate, and no other task owns them. Move both to the two-store
  vocabulary already used by `template/.claude/references/knowledge-protocol.md`: "the shared store"
  for "the vault", "no shared store" for "no vault" (that file's own wording is
  `no shared store — skipping <step>`), and rename the `## No vault (degraded)` heading to
  `## No shared store (degraded)`. Neither file names the technology today and neither needs to, so
  every occurrence goes: "an Obsidian vault" is the doctrine's phrasing and stays where the doctrine
  lives, in `knowledge-protocol.md:10`. That is why the proof below expects zero, not one.

  | File | Vault-era lines to sweep |
  |---|---|
  | `template/.claude/references/research-and-docs.md` | 5 — `:8`, `:51` (the `## No vault (degraded)` heading), `:53`, `:55`, `:60` |
  | `template/.claude/skills/research/SKILL.md` | 4 — `:3` (frontmatter `description:`), `:11` (three occurrences on one line), `:25`, `:55` |

  **Scope: TERMINOLOGY ONLY — do not re-route anything.** The routing is already correct under the
  new doctrine and every destination must survive verbatim. `knowledge-base-scaffold/research/_index.md`
  restricts the local `research/` to briefs this repo CITES and sends uncited exploration to the
  shared `inbox/research/`, and Step 1's own docs text says `/research` output "writes straight to
  the shared `wiki/stack/<tool>/` and never lands locally". So `wiki/stack/<tool>/` stays the cache,
  `inbox/research/<tool>.md` stays the pointer stub, and `reports/research-<tool>.md` stays the
  no-shared-store fallback — it is NOT redirected to `knowledge-base/research/`. Renaming the store
  is in scope; changing where anything is written is not.

  Both counts are stated so a partial sweep is visible. Prove it:
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -nic "vault" template/.claude/references/research-and-docs.md template/.claude/skills/research/SKILL.md
  ```
  Expected: `…research-and-docs.md:0` and `…research/SKILL.md:0`. A non-zero count is an unswept
  line; a count that rose is a re-route dressed as a rename.

- [ ] **Step 3: Verify no dangling reference survives anywhere.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -rn "vault-protocol\|pointer-block\|project-template" template/ cli/ tools/ README.md docs/*.md || echo "clean"
  ```
  Expected output: `clean`. `docs/design/` is deliberately outside the path list: four historical design docs — the spec being implemented included — hold 13 matching lines, and rewriting history is not a goal. `plans/` is out for the same reason.

- [ ] **Step 3b: Back the shared store up BEFORE any vault edit.** Steps 4–6 are the only writes in
  this entire increment that land outside the repo, and the shared store has no git, no remote and no
  history — this tarball is the only undo that exists. Run it, verify it, and do not proceed on a
  mismatch.
  ```bash
  mkdir -p "$HOME/.phe-backups" && \
  TS=$(date +%Y-%m-%dT%H%M%S) && \
  tar -czf "$HOME/.phe-backups/vault-$TS.tgz" -C "$HOME/Dev" "The Vault" && \
  SRC=$(find "$HOME/Dev/The Vault" -type f | wc -l | tr -d ' ') && \
  ARC=$(tar -tzf "$HOME/.phe-backups/vault-$TS.tgz" | grep -vc '/$') && \
  echo "source=$SRC archived=$ARC bytes=$(wc -c < "$HOME/.phe-backups/vault-$TS.tgz")" && \
  [ "$SRC" = "$ARC" ] && echo "BACKUP VERIFIED $HOME/.phe-backups/vault-$TS.tgz" || echo "BACKUP MISMATCH — STOP"
  ```
  Expected: a `source=N archived=N` line where both counts are equal, then
  `BACKUP VERIFIED /Users/<you>/.phe-backups/vault-<ts>.tgz`. If it prints `BACKUP MISMATCH — STOP`,
  or the counts differ, or the archive is 0 bytes: **stop and report BLOCKED**. Do not edit the vault.
  Record the archive path in the task report — Step 7 cites it.

- [ ] **Step 4: Record ADR-014 in the vault.** In `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md`, insert directly after the `# Decisions — Perfect Harness Engineering` intro paragraph (before `## ADR-013`):
  ```markdown
  ## ADR-014 — Project knowledge moves INTO the repo: local `knowledge-base/` + a shared evergreen store, promotion MOVES

  - **Date:** 2026-08-03
  - **Status:** accepted (**reverses ADR-001**; spec: `docs/design/2026-08-03-project-local-knowledge-base.md`, increment 1)
  - **Context:** ADR-001 made the vault the sole store for project knowledge and explicitly rejected mirrors. Lived cost: the knowledge does not survive a clone, never appears in a PR diff, and its `sources:` paths are absolute and unverifiable. PO directive 2026-08-01: "I need that this harness enforce a folder in the project `knowledge-base` where we should keep it from now on." Verified before adopting: `git grep knowledge-base` → zero hits (name unclaimed); the GitHub repo is PUBLIC, so a tracked KB is a published KB.
  - **Decision:** Two stores. LOCAL `knowledge-base/` in the repo (`_index.md`, `architecture.md`, `decisions.md`, `resources.md`, `runbook.md`, `inbox/`, `research/`) holds project-scoped knowledge, git-tracked and reviewed. The SHARED Obsidian vault keeps evergreen `wiki/` + `agent-kb/` only. **Promotion MOVES**: `/evolve` deletes the local file and leaves a pointer line in `knowledge-base/_index.md`, so exactly one copy of any fact exists — which is why this is not the mirror ADR-001 forbade. Linkage is one config key, `.claude/harness.json` → `knowledge {local, shared{mode,path}, migratedAt}` (`cli/knowledge-config.js`); the pointer block and the vault project template are deleted. `architect-agent` is repointed at `knowledge-base/architecture.md` + `decisions.md` — without that repoint the two files this design exists to hold have no writer. Enforcement is layered: guidance (`00-core.md`, `AGENTS.md`), evidence (`plan-template.md`'s `Knowledge to load first:` requires both stores or a literal `none — <reason>`; `/implement`'s report Knowledge row; `tools/kb-check.mjs` in `/validate` and `/evolve`), and hooks (`guard.mjs` denies `Write(<shared>/projects/**)` once `migratedAt` is stamped, exempting only the `projects/_index.md` registry row the vault doctrine mandates, and denies secret-shaped `Write(knowledge-base/**)` line-wise, honouring the same `<!-- kb-check:allow -->` hatch `kb-check` honours). `knowledge-base/` travels with the CODE branch, committed as one `docs(kb):` commit at `/evolve`.
  - **Consequences:** Knowledge survives a clone, lands in the PR diff, and its relative `sources:` paths are verifiable. `kb-check` makes exactly three decidable claims (index law, unfilled placeholders, secret shapes) and deliberately does not claim `_index.md` accuracy. Costs: a finding on an abandoned branch dies with it (same property `plans/` has); a tracked KB in a public repo means the secret guard is load-bearing, not decorative; the evidence rung is a nudge — `none — <reason>` passes by design. This does NOT fix harvest — `/evolve` stays ask-first. Increment 1 ships the local KB only; migration of existing vault knowledge is increment 2 and no migration machinery exists yet. Deliberate deviation from the spec's Enforcement table: `kb-check` does NOT gate on the plan's `Knowledge to load first:` field — it makes three decidable claims about the KB itself and nothing about `plans/`.

  ## ADR-015 — The reviewer reads `knowledge-base/`, from the base branch

  - **Date:** 2026-08-03
  - **Status:** accepted (**reverses the reviewer-isolation scope of ADR-003/ADR-012 for `knowledge-base/` only**)
  - **Context:** ADR-003's generator/evaluator separation kept the reviewer away from the vault so fresh eyes stayed fresh, and ADR-012 recorded that isolation as an invariant. With architecture and ADRs now IN the repo, that isolation would make the reviewer unable to check a diff against a recorded decision — the single highest-value review a KB enables.
  - **Decision:** `code-reviewer`'s checklist item 6 becomes "Boundaries & recorded decisions": read `git show <base>:knowledge-base/architecture.md` and `git show <base>:knowledge-base/decisions.md`. A forbidden import direction against `## Boundaries` is a blocker; so is a diff contradicting a recorded ADR without superseding it. The BASE-branch qualifier is not optional: `/review-branch` diffs `<base>...HEAD` at pipeline step 5 while the KB commit lands at step 7, so the HEAD copy does not exist yet at review time.
  - **Consequences:** The reviewer gains the one context it was always missing without gaining the author's reasoning — it reads recorded decisions, never the working notes of this session. Isolation from `plans/`-adjacent session context is unchanged. "Reviewed" in ADR-014's decision 2 means human PR review; this is the machine half.
  ```

- [ ] **Step 5: Record ADR-016 and cross-reference ADR-010.** Append, immediately after ADR-015:
  ```markdown
  ## ADR-016 — ADR-010's tracking root does not cover `knowledge-base/`

  - **Date:** 2026-08-03
  - **Status:** accepted (amends ADR-010; spec: `docs/design/2026-08-03-project-local-knowledge-base.md`)
  - **Context:** ADR-010 put `backlog/` + `sprints/` in the primary checkout only, and `guard.mjs:220` permits base-branch commits staging ONLY those two paths. A new top-level knowledge folder needs an explicit side of that line, or the guard's narrow exception gets stretched by whoever hits the deny first.
  - **Decision:** `knowledge-base/` is a WORK ARTIFACT, like `plans/` and `reports/` (`work-tracking.md:23`): it travels with the code branch and merges with the PR. It is NOT a tracking-root file. Consequently `guard.mjs` needs no change — staging `knowledge-base/*` on the base branch is denied at `guard.mjs:224`, which is the correct behaviour.
  - **Consequences:** Mid-work knowledge writes dirty the tree during `/implement`; `/evolve` stages them as one `docs(kb):` commit on the feature branch. A finding on an abandoned branch dies with it — the same property `plans/` and `reports/` already have, accepted as the cost.
  ```
  Then append one bullet to ADR-010's `- **Consequences:**` paragraph: `- **Amended 2026-08-03 → see ADR-016:** the tracking root explicitly does not cover \`knowledge-base/\`.` Then bump the file's frontmatter `updated:` to `2026-08-03`, and bump `updated:` in `~/Dev/The Vault/projects/perfectHarnessEngineering/_index.md` (Index Law).

- [ ] **Step 6: Verify the ADRs landed.**
  ```bash
  grep -n "^## ADR-01[456]" "$HOME/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md"
  ```
  Expected: three matching heading lines — `## ADR-014 — Project knowledge moves INTO the repo…`, `## ADR-015 — The reviewer reads knowledge-base/…`, `## ADR-016 — ADR-010's tracking root does not cover knowledge-base/`.

- [ ] **Step 7: Run the FULL acceptance gate.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && npm test 2>&1 | tail -3 && node tools/context-ledger.mjs template && node tools/kb-check.mjs template/.claude/references/knowledge-base-scaffold --scaffold template/.claude/references/knowledge-base-scaffold; echo "kb-check exit=$?"
  ```
  Expected, in order:
  1. `114 passed, 0 failed` (the hook smoke test, last in the `npm test` chain) and exit 0.
  2. The ledger table with `AGENTS.md 58`, `.claude/rules/00-core.md 45`, no `!! WARN`, no `!! HARD`, `Status: WARN — <n> / 2000 est. tokens` with `<n>` ≤ 1654.
  3. `kb-check: (b) skipped — the checked dir IS the shipped scaffold.` / `kb-check: GREEN — 7 file(s) in …` / `kb-check exit=0`.

- [ ] **Step 8: Prove the docs file is inside its review guideline.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && wc -l docs/05-knowledge-layer.md template/.claude/references/knowledge-protocol.md
  ```
  Expected: `docs/05-knowledge-layer.md` ≤ 130 lines, `knowledge-protocol.md` ≤ 50 lines.

- [ ] **Step 9: Commit.**
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add docs README.md template/.claude/references/research-and-docs.md template/.claude/skills/research/SKILL.md && git commit -m "docs: knowledge layer is two stores with a MOVE-on-promotion boundary rule"
  ```
  Expected output contains: `5 files changed` — the three docs plus Step 2b's two template files,
  which `git add docs README.md` alone would have left uncommitted.

---

## End-to-end verification

1. `npm test` → exits 0; final suite line `114 passed, 0 failed`.
2. `node template/.claude/hooks/smoke-test.mjs` → `114 passed, 0 failed`, including the 6 session-start knowledge fixtures and the 13 guard boundary fixtures.
3. `node cli/knowledge-config.test.js` → `40 passed, 0 failed`.
4. `node cli/kb-check.test.js` → `50 passed, 0 failed` (49 at Task 3; Task 9 Step 10 adds the regex byte-identity assert).
5. `node tools/context-ledger.mjs template` → total ≤ 1654 est. tokens, `Status: WARN`, no `!! WARN`, no `!! HARD`, `AGENTS.md` 58 lines, `00-core.md` 45 lines.
6. `node tools/kb-check.mjs template/.claude/references/knowledge-base-scaffold --scaffold template/.claude/references/knowledge-base-scaffold` → GREEN, exit 0.
7. Negative proof the gate has teeth:
   ```bash
   cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && TMPKB=$(mktemp -d) && cp -R template/.claude/references/knowledge-base-scaffold/. "$TMPKB" && node tools/kb-check.mjs "$TMPKB" --scaffold template/.claude/references/knowledge-base-scaffold; echo "exit=$?"; rm -rf "$TMPKB"
   ```
   Expected: seven `(b) still the shipped placeholder: …` findings, `kb-check: RED — 7 finding(s) in …`, `exit=1`.
8. `grep -rn "vault-protocol\|pointer-block\|project-template" template/ cli/ tools/ README.md docs/*.md || echo "clean"` → `clean`.
9. `git log --oneline main..HEAD` → 11 commits, all conventional, none on `main`.

## Risks & assumptions

- **The architect-agent repoint is the single point of failure.** If Task 6 is skipped or partially applied, `knowledge-base/architecture.md` and `decisions.md` have no writer and the agent degrades silently to a codebase scan. Task 6's Step 7 grep + `emit-codex.test.js` are the only mechanical proof; re-read the file if the grep count is 0.
- **`emit-codex.test.js:721` requires the word "vault" to survive in `architect-agent.md`.** The rewrite keeps it in resolution step 3 (the shared store). Removing that sentence turns the emit suite red for a reason that reads like an unrelated Codex failure.
- **`cli/cli-hardening.test.js:313-316` and `harness-init/SKILL.md:81` are a pinned pair.** Editing either alone fails the suite. Task 10 changes them in the same commit, deliberately.
- **`template/AGENTS.md` and `00-core.md` are at cap.** Every AGENTS.md addition in this plan is paid for by the two-line pointer-block deletion; every 00-core change is a replacement. Any extra line during implementation must displace one.
- **`installHarnessConfig` preserves unknown keys**, so an adopter's legacy `vault` key survives untouched after this increment — inert, read by nothing. Removing it is increment 2's `migrations.js` job, not this plan's.
- Assumption: `writeJsonAtomic` is exported from `cli/harness-config.js` (verified — `cli/vault-config.js:14` and `cli/model-tiers.js:18` both import it today).
