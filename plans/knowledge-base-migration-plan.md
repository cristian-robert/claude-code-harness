---
ticket: ad-hoc
created: 2026-08-03
complexity: L
confidence: 8/10
tier: deep
---

# Knowledge-base Migration (Increment 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the migration machinery that moves a project's existing knowledge — the shared vault's project folder plus any legacy repo folders — into the local `knowledge-base/` that increment 1 created, deterministically and resumably, refusing rather than guessing at every point a human decision or a personal-data leak is involved.

**Architecture:** Two halves with a hard seam. `cli/knowledge-migrate.js` (CommonJS, no deps) is **deterministic only**: it detects candidates, leak-scans read-only, backs up to `~/.phe-backups/`, resolves and re-verifies wikilinks, and owns `.claude/state/knowledge-migration.json` — the ledger that makes a crash resumable. `template/.claude/skills/knowledge-migrate/SKILL.md` is **judgment only**: classify, confirm with the human, merge prose, ask on genuine contradictions, rewrite links, write `reports/knowledge-reconciliation.md`; it is a phase-table router over three load-on-cite references. `cli/migrations.js` renames the legacy `harness.json` `vault` key to `knowledge` and arms the pending marker; `cli/update.js` calls it and prints the nudge; `/harness-init` routes to `/knowledge-migrate` while the marker is pending.

**Tech Stack:** Node >= 18, no new npm deps, CommonJS in `cli/` (`var`, no arrow functions in exported code), hand-rolled test harness, Markdown payload under `template/.claude/`. `tar` and `git` are shelled out via `execFileSync`.

---

## Global Constraints

- **Spec:** `docs/design/2026-08-03-project-local-knowledge-base.md`. This plan implements **increment 2 only** (spec table, `docs/design/2026-08-03-project-local-knowledge-base.md:232`): `knowledge-migrate.js` + `cli/index.js` case, the `/knowledge-migrate` skill, `migrations.js`, the `update` nudge, leak gate, backup, ledger, link resolver + verifier.
- **Increment 1 is a precondition.** `cli/knowledge-config.js` must exist and export `readKnowledgeConfig(projectRoot)`. Task 1 Step 2 is a preflight that proves it. It is **not** present on `main` as of 2026-08-03 (`ls cli/knowledge-config.js` → `No such file or directory`) — do not start this plan until increment 1 has merged.
- **`harness.json` `knowledge` shape — exact, do not vary:**
  ```json
  "knowledge": { "local": "knowledge-base", "shared": { "mode": "existing" | "none", "path": "/abs/path" | null }, "migratedAt": null }
  ```
- **Ledger file — exact path and shape:** `.claude/state/knowledge-migration.json`, `{ "status": "pending"|"in-progress"|"done", "steps": { "<n>": "done"|"failed" }, "backups": [...], "manifest": [ {from, to} ] }`. Two additive keys beyond the spec, both written only when they exist: `linksBefore` (the step-1 resolver snapshot), because step 6b cannot compare against a snapshot that was never stored; and `leakDecisions` (`{ "<marker>": "genericize"|"redact"|"accept" }`), because the step-0 gate judges the PLANNED COPY and cannot reconstruct it without the resolutions the human already gave. `steps` merges key-wise on write; every other key is replaced wholesale.
- **CommonJS idiom in `cli/`** — copy `cli/vault-config.js` exactly: `'use strict';` header, `const` requires, `var` locals, `function` declarations (no arrow functions), explicit `module.exports = { name: name, ... }`. Reads never throw; writes REFUSE (throw) rather than overwrite a `harness.json` they cannot parse (`cli/vault-config.js:61-77`).
- **Hand-rolled tests only** — no jest/mocha/`node:test`. Copy the harness at `cli/vault-config.test.js:14-19` verbatim:
  ```js
  var passed = 0;
  var failed = 0;
  function assert(name, condition) {
    if (condition) { console.log('  PASS: ' + name); passed++; }
    else { console.log('  FAIL: ' + name); failed++; }
  }
  ```
  and the tail at `cli/vault-config.test.js:84-85`: `console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed > 0 ? 1 : 0);`. `cli/cli-hardening.test.js` uses a DIFFERENT local harness (`test(name, fn)` + `node:assert`, `cli/cli-hardening.test.js:21-32`) — edits to that file follow ITS idiom, not this one.
- **No hook edits in this increment.** The `guard.mjs` denies from the spec's Enforcement table are not in scope. Therefore no new smoke fixture is required — but `node template/.claude/hooks/smoke-test.mjs` still runs green as a regression check (it is part of `npm test`).
- **Budgets** (`node tools/context-ledger.mjs template`): template `CLAUDE.md` <= 60 lines, rules <= 45, skill **bodies** <= 100 (frontmatter excluded; hard cap 120 → `tools/context-ledger.mjs:86`). References <= 160 lines (`template/.claude/references/harness-maintenance.md:63` — NOT measured by the ledger; check with `wc -l`). Baseline (measured at Task 1 Step 2b, after increment 1): TOTAL <LEDGER>, `AGENTS.md` 58/60, `00-core.md` 45/45. **This increment must not add a line to `AGENTS.md` or `00-core.md`** — increment 1 owns those rewrites. `harness-init/SKILL.md` body is 98 lines; the one routing line takes it to 99.
- **New skill carries `disable-model-invocation: true`** — it costs zero always-loaded tokens (`tools/context-ledger.mjs:90`) and `cli/emit-codex.js` then generates its `agents/openai.yaml` automatically (asserted by `cli/emit-codex.test.js:604-636`).
- **No `` !`…` `` dynamic-preview lines** in the new skill or references. `cli/skill-preview-guards.test.js:30` requires every one of them to end in `|| true` / `|| echo …`, and its floor of 7 (`:43`) must survive.
- **Everything under `template/` must be committed** — `cli/cli-hardening.test.js:363-369` fails on any untracked file there (the GitHub-tarball install path ships only tracked files).
- **Never touch the real vault at `~/Dev/The Vault`.** Every test builds its own fixture vault under `fs.realpathSync(os.tmpdir())` and removes it.
- **Never commit on `main`/`master`** (enforced by `template/.claude/hooks/guard.mjs:26`). Work on `feat/knowledge-migration`. Conventional commits: `feat:` / `fix:` / `refactor:` / `docs:` / `chore:` / `test:`.
- **Never use `rm -rf` in a skill or reference** — `guard.mjs:25` (`RECURSIVE_RM`) denies it. Delete files explicitly, then `rmdir`.
- **Leak-gate regex source of truth:** `plans/vault-bootstrap-plan.md:16` — `/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness`.
- **Autonomous mode → REFUSE.** Steps 2 and 2b are human-only (`docs/design/2026-08-03-project-local-knowledge-base.md:191`). Activation is defined by `template/.claude/references/autonomous-mode.md:6-11` and nothing else.

---

## The eleven steps this increment must satisfy

Verbatim from `docs/design/2026-08-03-project-local-knowledge-base.md:170-183`, with the owner of each half:

| # | Step | CLI (`knowledge-migrate.js`) | Skill (`SKILL.md` + references) |
|---|---|---|---|
| 0 | LEAK GATE (read-only, classifies the PLANNED COPY) | `plannedLeaks()` via `detect`; `decide <marker> <resolution>` records a human ruling | presents `unresolved`, refuses until each is decided |
| 1 | DETECT | `detectCandidates()` via `detect` | — |
| 2 | CONFIRM | — | human picks; `record 2 done` |
| 2b | DISPOSITION (move/copy/archive+move) | — | human picks; `record 2b done` |
| 3 | BACKUP | `backup()` via `backup` | invokes it, refuses on failure |
| 4 | DRY-RUN PLAN | `detect --dry-run` output | writes the plan into the report |
| 5 | RECONCILE | — | merges; genericizes the COPY; re-derives command-backed claims |
| 6 | REWRITE LINKS | `resolveLinks()` snapshot | applies exact → basename → report |
| 6b | VERIFY LINKS | `verifyLinks()` via `verify-links` | surfaces regressions, fails the run |
| 7 | VAULT CLEANUP | — | five doctrine locations, registry row `migrated` |
| 8 | LEDGER finalize | `record 8 done --status done` | stamps `knowledge.migratedAt` |
| 9 | REPORT | — | `reports/knowledge-reconciliation.md` |

---

## File Structure

| File | Created/Modified | The ONE responsibility |
|---|---|---|
| `cli/knowledge-migrate.js` | Create | The deterministic half: detect, leak-scan, backup, link resolve/verify, ledger, subcommand dispatcher |
| `cli/knowledge-migrate.test.js` | Create | Hand-rolled proof of all of the above, incl. crash-resume at each CLI-owned step and a fixture-vault dry run |
| `cli/index.js` | Modify (`:36-45` neighbourhood, `:53-67` help) | Make `knowledge-migrate` a reachable subcommand |
| `cli/cli-hardening.test.js` | Modify (after `:265`, inside `:275-305`, after `:429`) | Pin the new subcommand's reachability, the help-text vocabulary, the `harness-init` npx literal, and the `update.js` call order |
| `cli/migrations.js` | Modify (`:1-2`, `:58-61`) | Rename the legacy `vault` key to `knowledge` and arm the pending marker, idempotently |
| `cli/migrations.test.js` | Modify (insert before `:108`) | Prove the rename, its idempotency, and its refusals |
| `cli/update.js` | Modify (`:13`, after `:263`) | Call the rename, print its messages including the nudge |
| `package.json` | Modify (`:18`, `:20`) | Run the new suite in `test:cli` and `test` |
| `template/.claude/skills/knowledge-migrate/SKILL.md` | Create | The judgment half, as a phase-table router (<= 100 body lines) |
| `template/.claude/references/knowledge-migrate/01-detect-and-decide.md` | Create | Steps 0, 1, 2, 2b — classification and the two human questions |
| `template/.claude/references/knowledge-migrate/02-reconcile.md` | Create | Steps 3, 4, 5 — backup, dry-run plan, merge + genericize-the-copy |
| `template/.claude/references/knowledge-migrate/03-links-cleanup-report.md` | Create | Steps 6, 6b, 7, 8, 9 — links, vault cleanup, ledger close, report |
| `template/.claude/skills/harness-init/SKILL.md` | Modify (after `:68`) | One line routing to `/knowledge-migrate` while the marker is pending |

---

## Task 1: Module skeleton, preflight, and the ledger primitives

The ledger is the spine: every later step reads it before acting and appends to it after. Build it first so every subsequent task has a resume contract to write against.

**Files:**
- Create: `cli/knowledge-migrate.js`
- Create: `cli/knowledge-migrate.test.js`

**Interfaces:**
- Produces: `readLedger(projectRoot) -> ledger | null` (never throws), `writeLedger(projectRoot, patch) -> void` (shallow-merges the patch; `steps` merges key-wise), and the internal helpers `mdFilesUnder(dir) -> string[]`, `realish(p) -> string`, `isInside(child, parent) -> boolean`, `commonRoot(absPaths) -> string`, plus the constants `CURATED`, `NEVER`, `LEDGER_REL`.

- [ ] **Step 1: Create the working branch**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
git checkout -b feat/knowledge-migration
```

Expected: `Switched to a new branch 'feat/knowledge-migration'`.

- [ ] **Step 2: Preflight — prove increment 1 has shipped**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
node -e "var k=require('./cli/knowledge-config.js'); console.log(typeof k.readKnowledgeConfig, typeof k.writeKnowledgeConfig);"
```

Expected: `function function`.

If it prints `Error: Cannot find module './cli/knowledge-config.js'`, STOP. Increment 1 has not merged; this plan has no target to migrate into.

- [ ] **Step 2b: Measure the post-increment-1 baseline before any other work**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | tail -1 && node tools/context-ledger.mjs template | tail -1 && node cli/cli-hardening.test.js | tail -1
```

Record all three verbatim as `<SMOKE>`, `<LEDGER>`, `<HARDENING>` and substitute them wherever this plan writes a pinned number. Expected after increment 1: `106 passed, 0 failed`, `Status: WARN — 1654 / 2000 est. tokens (83%)`, `19 passed, 0 failed`. A different value is not automatically wrong — but a value you did not measure is.

- [ ] **Step 3: Write the failing test for the ledger primitives**

Create `cli/knowledge-migrate.test.js` with exactly this content:

```js
// cli/knowledge-migrate.test.js
//
// The DETERMINISTIC half of /knowledge-migrate: detection, the read-only leak
// gate, backup refusals, link resolution/verification, the ledger, and the
// crash-resume property (a step already recorded `done` is never redone).
//
// Every fixture lives under a realpath'd tmp dir. The real vault at
// ~/Dev/The Vault is NEVER touched by this suite.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const {
  detectCandidates,
  leakScan,
  backup,
  readLedger,
  writeLedger,
  resolveLinks,
  verifyLinks,
  run,
} = require('./knowledge-migrate');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

// realpathSync: on macOS os.tmpdir() is /var/folders/... but git and
// fs.realpathSync report /private/var/folders/... — comparing the two forms
// would silently defeat every containment check in this file.
const TEST_DIR = path.join(fs.realpathSync(os.tmpdir()), 'knowledge-migrate-test-' + crypto.randomUUID());

function freshProj(name) {
  var dir = path.join(TEST_DIR, name);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  return dir;
}
function writeFile(p, body) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

console.log('ledger:');
(function () {
  var proj = freshProj('ledger');
  assert('absent ledger -> null', readLedger(proj) === null);

  writeLedger(proj, { status: 'pending' });
  var l1 = readLedger(proj);
  assert('writeLedger creates .claude/state/knowledge-migration.json',
    fs.existsSync(path.join(proj, '.claude', 'state', 'knowledge-migration.json')));
  assert('default shape is filled in',
    l1.status === 'pending' && JSON.stringify(l1.steps) === '{}' &&
    JSON.stringify(l1.backups) === '[]' && JSON.stringify(l1.manifest) === '[]');

  writeLedger(proj, { status: 'in-progress', steps: { '0': 'done' } });
  writeLedger(proj, { steps: { '1': 'done' } });
  var l2 = readLedger(proj);
  assert('steps ACCUMULATE across writes (crash-resume depends on it)',
    l2.steps['0'] === 'done' && l2.steps['1'] === 'done');
  assert('non-steps keys are replaced wholesale', l2.status === 'in-progress');

  writeLedger(proj, { backups: [{ src: '/a', dest: '/b', bytes: 1, files: 1 }] });
  assert('backups survive a later steps-only patch', readLedger(proj).backups.length === 1);
  writeLedger(proj, { steps: { '3': 'done' } });
  assert('a steps-only patch does not clear backups', readLedger(proj).backups.length === 1);

  fs.writeFileSync(path.join(proj, '.claude', 'state', 'knowledge-migration.json'), '{ not json');
  assert('malformed ledger -> null (no throw)', readLedger(proj) === null);
})();

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 4: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: `Error: Cannot find module './knowledge-migrate'` and a non-zero exit.

- [ ] **Step 5: Create the module with the ledger primitives and shared helpers**

Create `cli/knowledge-migrate.js`:

```js
'use strict';

// The DETERMINISTIC half of /knowledge-migrate. It detects candidates, scans for
// personal-data leaks (read-only), backs up, resolves and re-verifies wikilinks,
// and owns the ledger. It NEVER judges content: classification, merging, conflict
// resolution and the report belong to .claude/skills/knowledge-migrate.
//
// The ledger is the resume contract. Every step appends to it, so a crash at any
// point leaves a resumable state instead of an ambiguous one — read-only steps
// (0, 1) re-run on a resume; destructive ones (3) are skipped once recorded done
// (design step 8).
//
// Merge discipline mirrors cli/vault-config.js: reads degrade to null, writes go
// through writeJsonAtomic so a crash can never publish a half-written ledger.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { writeJsonAtomic } = require('./harness-config');

// Step 1's curated candidates — the folder names project knowledge historically
// hides in (design step 1). `.ai` is deliberately in the list: it is the one
// dot-dir that is a knowledge store rather than tooling.
var CURATED = ['docs', 'wiki', 'knowledge', 'notes', 'ai_docs', 'context', 'PRPs',
  'specs', '.ai', 'memory-bank', 'adr', 'decisions'];

// Never a candidate: VCS/tooling dirs, the migration TARGET itself, and the
// pipeline's own artifact dirs. plans/reports/backlog/sprints are WORK artifacts
// (references/work-tracking.md) — /evolve distils them into the KB; the migration
// must never move them.
var NEVER = ['.git', '.claude', '.worktrees', 'node_modules', 'knowledge-base',
  'plans', 'reports', 'backlog', 'sprints'];

var LEDGER_REL = '.claude/state/knowledge-migration.json';

function ledgerPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'state', 'knowledge-migration.json');
}

// Every .md under dir, absolute, skipping symlinks (parity with
// update.js:79 — a link could otherwise redirect the scan into $HOME).
function mdFilesUnder(dir) {
  var out = [];
  var entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry.isSymbolicLink()) continue;
    var p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      out = out.concat(mdFilesUnder(p));
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

// realpath the nearest EXISTING ancestor, then re-append the rest. A destination
// directory that does not exist yet still has to be compared in the same
// namespace as the sources — on macOS /var vs /private/var would otherwise defeat
// every containment check in backup().
function realish(p) {
  var abs = path.resolve(p);
  var tail = [];
  var cur = abs;
  for (;;) {
    try {
      return tail.length ? path.join(fs.realpathSync(cur), tail.join(path.sep)) : fs.realpathSync(cur);
    } catch (e) {
      var parent = path.dirname(cur);
      if (parent === cur) return abs;
      tail.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

function isInside(child, parent) {
  var c = realish(child);
  var p = realish(parent);
  return c === p || c.indexOf(p + path.sep) === 0;
}

// Longest common DIRECTORY prefix — the root that relative link targets resolve
// against when the import set spans several trees.
function commonRoot(absPaths) {
  if (absPaths.length === 0) return '';
  var parts = path.dirname(absPaths[0]).split(path.sep);
  for (var i = 1; i < absPaths.length; i++) {
    var other = path.dirname(absPaths[i]).split(path.sep);
    var j = 0;
    while (j < parts.length && j < other.length && parts[j] === other[j]) j++;
    parts = parts.slice(0, j);
  }
  return parts.join(path.sep) || path.sep;
}

function readLedger(projectRoot) {
  var p = ledgerPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null; // a corrupt ledger must never crash a migration step
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed;
}

// Shallow-merge the patch over the current ledger. `steps` is the ONE key that
// accumulates: every step appends its own result and must not erase the steps
// before it, or a crash-resume cannot tell what already ran.
function writeLedger(projectRoot, patch) {
  var current = readLedger(projectRoot);
  if (current === null) current = { status: 'pending', steps: {}, backups: [], manifest: [] };
  var next = {};
  var k;
  for (k in current) {
    if (Object.prototype.hasOwnProperty.call(current, k)) next[k] = current[k];
  }
  for (k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
  }
  if (patch && patch.steps) {
    var steps = {};
    var prior = current.steps && typeof current.steps === 'object' ? current.steps : {};
    for (k in prior) {
      if (Object.prototype.hasOwnProperty.call(prior, k)) steps[k] = prior[k];
    }
    for (k in patch.steps) {
      if (Object.prototype.hasOwnProperty.call(patch.steps, k)) steps[k] = patch.steps[k];
    }
    next.steps = steps;
  }
  writeJsonAtomic(ledgerPath(projectRoot), next);
}

module.exports = {
  CURATED: CURATED,
  NEVER: NEVER,
  LEDGER_REL: LEDGER_REL,
  readLedger: readLedger,
  writeLedger: writeLedger,
};
```

- [ ] **Step 6: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: it PASSES. `detectCandidates`, `leakScan`, `backup`, `resolveLinks`, `verifyLinks` and `run` destructure to `undefined` and are never called in this block, so nothing throws. Confirm the exact output:

```
ledger:
  PASS: absent ledger -> null
  PASS: writeLedger creates .claude/state/knowledge-migration.json
  PASS: default shape is filled in
  PASS: steps ACCUMULATE across writes (crash-resume depends on it)
  PASS: non-steps keys are replaced wholesale
  PASS: backups survive a later steps-only patch
  PASS: a steps-only patch does not clear backups
  PASS: malformed ledger -> null (no throw)

8 passed, 0 failed
```

- [ ] **Step 7: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/knowledge-migrate.js cli/knowledge-migrate.test.js && git commit -m "feat(cli): knowledge-migrate ledger primitives with accumulating steps"
```

Expected: `2 files changed`.

---

## Task 2: `detectCandidates` — step 1

**Files:**
- Modify: `cli/knowledge-migrate.js` (add after `commonRoot`, before `readLedger`; extend `module.exports`)
- Test: `cli/knowledge-migrate.test.js` (insert immediately before the `fs.rmSync(TEST_DIR, …)` cleanup line)

**Interfaces:**
- Consumes: `mdFilesUnder(dir) -> string[]`, `CURATED`, `NEVER` (Task 1).
- Produces: `sharedProjectFolder(projectRoot, sharedRoot) -> string | null` (the `<root>/projects/<repo basename>` derivation), and `detectCandidates(projectRoot, sharedPath) -> { shared: {path, mdCount} | null, local: [ {path, mdCount, tracked, verdict} ] }` where `verdict` is `"likely" | "maybe" | "unlikely"` and `path` is repo-relative. `sharedPath` may be the store ROOT (the production path, from `knowledge.shared.path`) or a project folder directly (`--shared`); `shared.path` is always the project folder.

- [ ] **Step 1: Write the failing test**

Insert this block into `cli/knowledge-migrate.test.js` immediately before the `fs.rmSync(TEST_DIR, { recursive: true, force: true });` cleanup line that precedes the final tally:

```js
console.log('detectCandidates:');
(function () {
  var proj = freshProj('detect');
  writeFile(path.join(proj, 'docs', 'adr-001.md'), '# ADR 001\n');
  writeFile(path.join(proj, 'docs', 'guide.md'), '# Guide\n');
  writeFile(path.join(proj, 'notes', 'scratch.md'), '# Scratch\n');
  writeFile(path.join(proj, 'design', 'a.md'), 'a\n');
  writeFile(path.join(proj, 'design', 'b.md'), 'b\n');
  writeFile(path.join(proj, 'design', 'c.md'), 'c\n');
  writeFile(path.join(proj, 'stray', 'one.md'), 'one\n');
  writeFile(path.join(proj, 'src', 'index.js'), 'x\n');
  writeFile(path.join(proj, 'node_modules', 'pkg', 'README.md'), 'noise\n');
  writeFile(path.join(proj, 'plans', 'old-plan.md'), 'work artifact\n');
  writeFile(path.join(proj, 'knowledge-base', '_index.md'), 'the target\n');
  writeFile(path.join(proj, '.ai', 'memory.md'), 'dot-dir knowledge\n');
  writeFile(path.join(proj, '.vscode', 'notes.md'), 'tooling dot-dir\n');

  var shared = path.join(TEST_DIR, 'detect-vault', 'projects', 'demo');
  writeFile(path.join(shared, '_index.md'), '# demo\n');
  writeFile(path.join(shared, 'architecture.md'), '# arch\n');

  var found = detectCandidates(proj, shared);
  var names = found.local.map(function (c) { return c.path; });

  assert('shared store reported with its md count',
    found.shared !== null && found.shared.mdCount === 2 && found.shared.path === shared);
  assert('absent shared path -> shared null',
    detectCandidates(proj, path.join(TEST_DIR, 'no-such-vault')).shared === null);
  assert('null shared path -> shared null', detectCandidates(proj, null).shared === null);

  assert('curated dir docs/ found', names.indexOf('docs') !== -1);
  assert('curated dir notes/ found', names.indexOf('notes') !== -1);
  assert('curated dot-dir .ai/ found', names.indexOf('.ai') !== -1);
  assert('non-curated dir with markdown found', names.indexOf('design') !== -1);
  assert('dir with no markdown excluded', names.indexOf('src') === -1);
  assert('node_modules excluded', names.indexOf('node_modules') === -1);
  assert('plans/ (work artifact) excluded', names.indexOf('plans') === -1);
  assert('knowledge-base/ (the target) excluded', names.indexOf('knowledge-base') === -1);
  assert('non-curated dot-dir excluded', names.indexOf('.vscode') === -1);
  assert('results are sorted by path', JSON.stringify(names) === JSON.stringify(names.slice().sort()));

  function verdictOf(n) {
    var hit = found.local.filter(function (c) { return c.path === n; })[0];
    return hit ? hit.verdict : null;
  }
  assert('curated -> likely', verdictOf('docs') === 'likely' && verdictOf('notes') === 'likely');
  assert('non-curated with 3+ md -> maybe', verdictOf('design') === 'maybe');
  assert('non-curated with <3 md -> unlikely', verdictOf('stray') === 'unlikely');
  assert('mdCount is recursive and .md-only',
    found.local.filter(function (c) { return c.path === 'docs'; })[0].mdCount === 2);

  assert('no git repo -> tracked false',
    found.local.every(function (c) { return c.tracked === false; }));

  execFileSync('git', ['init', '-q'], { cwd: proj });
  execFileSync('git', ['add', 'docs'], { cwd: proj });
  var tracked = detectCandidates(proj, shared).local;
  function trackedOf(n) {
    var hit = tracked.filter(function (c) { return c.path === n; })[0];
    return hit ? hit.tracked : null;
  }
  assert('git-staged dir -> tracked true', trackedOf('docs') === true);
  assert('unstaged dir -> tracked false', trackedOf('design') === false);

  var vaultRoot = path.join(TEST_DIR, 'detect-vault');
  assert('a shared ROOT resolves to projects/<repo basename>, not the whole vault',
    detectCandidates(path.join(TEST_DIR, 'demo'), vaultRoot) &&
    detectCandidates(path.join(TEST_DIR, 'demo'), vaultRoot).shared.path === shared);
})();
```

- [ ] **Step 2: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: the ledger block prints 8 PASS, then `TypeError: detectCandidates is not a function` and a non-zero exit.

- [ ] **Step 3: Implement `detectCandidates`**

In `cli/knowledge-migrate.js`, insert immediately after the `commonRoot` function and before `function readLedger`:

```js
// Does git track anything under this directory? Legacy knowledge folders are
// often gitignored, which is exactly why step 3 backs them up instead of
// trusting git as the fallback. A RELATIVE pathspec is required: an absolute one
// under a symlinked tmp dir makes git report "outside repository".
function gitTracked(projectRoot, relDir) {
  try {
    var out = execFileSync('git', ['-C', projectRoot, 'ls-files', '--', relDir], {
      encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch (e) {
    return false; // not a git repo, or git absent — "untracked" is the safe answer
  }
}

// harness.json records the shared store's ROOT. This project's knowledge inside it
// is <root>/projects/<repo basename> — the only folder the migration may import.
// wiki/ and agent-kb/ are evergreen and stay; importing them would re-fork the truth.
function sharedProjectFolder(projectRoot, sharedRoot) {
  if (typeof sharedRoot !== 'string' || !sharedRoot) return null;
  var candidate = path.join(sharedRoot, 'projects', path.basename(path.resolve(projectRoot)));
  return fs.existsSync(candidate) ? candidate : null;
}

// Step 1 — DETECT. Read-only. The shared project folder plus a full repo-root
// inventory: curated names plus every OTHER root dir containing markdown, each
// with a content verdict. Nothing is auto-selected; step 2 is a human decision.
function detectCandidates(projectRoot, sharedPath) {
  var shared = null;
  var folder = fs.existsSync(path.join(sharedPath || '', 'projects'))
    ? sharedProjectFolder(projectRoot, sharedPath)
    : (typeof sharedPath === 'string' && sharedPath && fs.existsSync(sharedPath) ? sharedPath : null);
  if (folder) shared = { path: folder, mdCount: mdFilesUnder(folder).length };

  var local = [];
  var entries;
  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch (e) {
    entries = [];
  }
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    // withFileTypes uses lstat, so a symlinked directory is not isDirectory().
    if (!entry.isDirectory()) continue;
    if (NEVER.indexOf(entry.name) !== -1) continue;
    var curated = CURATED.indexOf(entry.name) !== -1;
    // Dot-dirs are tooling, not knowledge — except the curated ones (.ai).
    if (entry.name.charAt(0) === '.' && !curated) continue;
    var mdCount = mdFilesUnder(path.join(projectRoot, entry.name)).length;
    if (mdCount === 0) continue;
    local.push({
      path: entry.name,
      mdCount: mdCount,
      tracked: gitTracked(projectRoot, entry.name),
      verdict: curated ? 'likely' : (mdCount >= 3 ? 'maybe' : 'unlikely'),
    });
  }
  local.sort(function (a, b) {
    return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0);
  });

  return { shared: shared, local: local };
}
```

Add `detectCandidates: detectCandidates,` and `sharedProjectFolder: sharedProjectFolder,` as the first entries of `module.exports`.

- [ ] **Step 4: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: the 8 ledger PASS lines, then 21 `PASS: …` lines under `detectCandidates:`, ending with `29 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/knowledge-migrate.js cli/knowledge-migrate.test.js && git commit -m "feat(cli): detectCandidates — curated + full root inventory with content verdicts"
```

Expected: `2 files changed`.

---

## Task 3: `leakScan` — the read-only step-0 gate

The gate CLASSIFIES; it rewrites nothing on disk. Genericization happens at step 5, on the copy, after the backup (`docs/design/2026-08-03-project-local-knowledge-base.md:172`).

What it classifies is the **planned copy**, not the source (spec step-0 row, `docs/design/2026-08-03-project-local-knowledge-base.md:172`): the import set as step 5 will write it, with the auto-genericization and every decision already recorded in the ledger applied, computed in memory. The leak that matters is the one that would land in the tracked, possibly public repo — so a recorded decision clears the gate, and **the shared store is never rewritten to satisfy it**.

**Files:**
- Modify: `cli/knowledge-migrate.js` (add after `detectCandidates`; extend `module.exports`)
- Test: `cli/knowledge-migrate.test.js` (insert immediately before the `fs.rmSync(TEST_DIR, …)` cleanup line)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond `fs`.
- Produces: `leakScan(filePaths) -> { autoGenericizable: [ {file, line, match} ], needsDecision: [ {file, line, match} ] }` (the raw reading of the SOURCE), and `plannedLeaks(filePaths, leakDecisions) -> { autoGenericizable, needsDecision, unresolved }` — the same classification recomputed over the PLANNED COPY, where `unresolved` is the subset that still blocks. Internal: `scanText(text, file)`, `plannedText(text, decisions)`, the constant `DECISIONS`.

- [ ] **Step 1: Write the failing test**

Insert into `cli/knowledge-migrate.test.js` immediately before the `fs.rmSync(TEST_DIR, { recursive: true, force: true });` cleanup line that precedes the final tally:

```js
console.log('leakScan (step 0, read-only):');
(function () {
  var dir = path.join(TEST_DIR, 'leaks');
  var clean = path.join(dir, 'clean.md');
  var home = path.join(dir, 'home.md');
  var other = path.join(dir, 'other.md');
  var both = path.join(dir, 'both.md');
  writeFile(clean, '# Clean\n\nNo markers here at all.\n');
  writeFile(home, 'Vault lives at /Users/someone/Dev/The Vault today.\n');
  writeFile(other, 'We copied the pattern from bzroo and SentrOS.\n');
  writeFile(both, 'See /Users/cristian-robertiosef/Dev/bzroo/notes.md for the trick.\n');

  var before = fs.readFileSync(both, 'utf-8');
  var res = leakScan([clean, home, other, both]);

  assert('clean file produces no hits',
    res.autoGenericizable.concat(res.needsDecision).every(function (h) { return h.file !== clean; }));
  assert('absolute home path -> autoGenericizable',
    res.autoGenericizable.some(function (h) { return h.file === home && h.match === '/Users/someone/Dev/The'; }));
  assert('home hit carries its 1-based line number',
    res.autoGenericizable.filter(function (h) { return h.file === home; })[0].line === 1);
  assert('other-project name -> needsDecision',
    res.needsDecision.some(function (h) { return h.file === other && h.match === 'bzroo'; }));
  assert('second other-project name also flagged',
    res.needsDecision.some(function (h) { return h.file === other && h.match === 'SentrOS'; }));
  assert('username INSIDE the /Users/<user> segment is covered by genericization, not a decision',
    !res.needsDecision.some(function (h) { return h.file === both && h.match === 'cristian'; }));
  assert('project name DEEPER in the same path still needs a decision',
    res.needsDecision.some(function (h) { return h.file === both && h.match === 'bzroo'; }));
  assert('the gate rewrote nothing (read-only)', fs.readFileSync(both, 'utf-8') === before);
  assert('unreadable path is skipped, not thrown on',
    leakScan([path.join(dir, 'missing.md')]).needsDecision.length === 0);
})();
```

- [ ] **Step 2: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: the earlier 29 PASS lines, then `TypeError: leakScan is not a function` and a non-zero exit.

- [ ] **Step 3: Implement `leakScan`**

In `cli/knowledge-migrate.js`, insert immediately after `detectCandidates`:

```js
// Step 0 — LEAK GATE. Source of truth for the pattern: plans/vault-bootstrap-plan.md:16
//   /Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness
// split into its two classes. An absolute home path is mechanically fixable
// (auto-genericizable at step 5, on the COPY); another project's name is not —
// only a human knows whether it may be published, so it needs a DECISION.
var HOME_PATH = /\/Users\/[A-Za-z0-9._-]+(?:\/[^\s'"`)\]]*)?/g;
var HOME_USER = /^\/Users\/[A-Za-z0-9._-]+/;
var HOME_USER_G = /\/Users\/[A-Za-z0-9._-]+/g;
var PERSONAL = /cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness/gi;
var DECISIONS = ['genericize', 'redact', 'accept'];

// One text, classified. Split out of leakScan so the gate can classify the
// PLANNED COPY — a string that exists only in memory — under exactly the rules it
// applies to a file on disk. Two scanners would drift, and the one that drifted
// would be the one deciding what gets published.
function scanText(text, file) {
  var result = { autoGenericizable: [], needsDecision: [] };
  var lines = text.split('\n');
  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    // Spans covering the /Users/<user> SEGMENT only. A personal marker inside
    // it is the home directory's owner and disappears when the path is
    // genericized; one deeper in the path is a real project name and must not
    // be waved through.
    var spans = [];
    var m;
    HOME_PATH.lastIndex = 0;
    while ((m = HOME_PATH.exec(line)) !== null) {
      var userPart = HOME_USER.exec(m[0])[0];
      spans.push({ start: m.index, end: m.index + userPart.length });
      result.autoGenericizable.push({ file: file, line: l + 1, match: m[0] });
    }
    var p;
    PERSONAL.lastIndex = 0;
    while ((p = PERSONAL.exec(line)) !== null) {
      var covered = false;
      for (var s = 0; s < spans.length; s++) {
        if (p.index >= spans[s].start && p.index < spans[s].end) { covered = true; break; }
      }
      if (!covered) result.needsDecision.push({ file: file, line: l + 1, match: p[0] });
    }
  }
  return result;
}

function leakScan(filePaths) {
  var result = { autoGenericizable: [], needsDecision: [] };
  for (var i = 0; i < filePaths.length; i++) {
    var text;
    try {
      text = fs.readFileSync(filePaths[i], 'utf-8');
    } catch (e) {
      continue; // unreadable/binary: nothing to classify, nothing to crash on
    }
    var hits = scanText(text, filePaths[i]);
    result.autoGenericizable = result.autoGenericizable.concat(hits.autoGenericizable);
    result.needsDecision = result.needsDecision.concat(hits.needsDecision);
  }
  return result;
}

// The PLANNED COPY of one file: home paths genericized (`/Users/<user>/x` -> `~/x`)
// and every marker the human has ruled on rewritten accordingly. This is the text
// step 5 will write into knowledge-base/, which is why it is the text the gate
// judges. The placeholders are the gate's FLOOR, not its prose: step 5 may write
// something better, it may not write the marker back.
function plannedText(text, decisions) {
  var out = text.replace(HOME_USER_G, '~');
  var marker;
  for (marker in decisions) {
    if (!Object.prototype.hasOwnProperty.call(decisions, marker)) continue;
    if (decisions[marker] === 'accept') continue; // consciously published: kept verbatim
    var re = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, decisions[marker] === 'redact' ? '[redacted]' : '<other-project>');
  }
  return out;
}

// Step 0's GATE (design table, step 0). `autoGenericizable` and `needsDecision`
// are the RAW reading of the SOURCE, kept because the step-9 report has to list
// what was found. `unresolved` is the only thing that BLOCKS: a needs-decision hit
// that survives the planned rewrite and has no decision recorded against it.
// Nothing here writes: the shared store is byte-identical through step 0.
function plannedLeaks(filePaths, decisions) {
  var raw = leakScan(filePaths);
  var decided = (decisions && typeof decisions === 'object' && !Array.isArray(decisions)) ? decisions : {};
  var unresolved = [];
  for (var i = 0; i < filePaths.length; i++) {
    var text;
    try {
      text = fs.readFileSync(filePaths[i], 'utf-8');
    } catch (e) {
      continue;
    }
    var hits = scanText(plannedText(text, decided), filePaths[i]).needsDecision;
    for (var h = 0; h < hits.length; h++) {
      // `accept` survives the rewrite by design, so it is filtered out here.
      if (!Object.prototype.hasOwnProperty.call(decided, hits[h].match.toLowerCase())) {
        unresolved.push(hits[h]);
      }
    }
  }
  return { autoGenericizable: raw.autoGenericizable, needsDecision: raw.needsDecision, unresolved: unresolved };
}
```

Add `leakScan: leakScan,` and `plannedLeaks: plannedLeaks,` to `module.exports` after `detectCandidates`.

`leakScan` is what this task's block tests directly. `plannedLeaks`, `plannedText` and `DECISIONS` are the gate's half and have no assert here on purpose — they are only reachable through `detect` and `decide`, so Task 6 proves them end to end (the `e2e-leak` project: refuse → `decide` → clear, with the source byte-identical). Task 3's tally therefore stays at 38.

- [ ] **Step 4: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: 9 new `PASS:` lines under `leakScan (step 0, read-only):`, ending with `38 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/knowledge-migrate.js cli/knowledge-migrate.test.js && git commit -m "feat(cli): read-only leak gate classifying home paths vs other-project names"
```

Expected: `2 files changed`.

---

## Task 4: `backup` — step 3, with its two refusals

**Files:**
- Modify: `cli/knowledge-migrate.js` (add after `leakScan`; extend `module.exports`)
- Test: `cli/knowledge-migrate.test.js` (insert immediately before the `fs.rmSync(TEST_DIR, …)` cleanup line)

**Interfaces:**
- Consumes: `realish(p)`, `isInside(child, parent)` (Task 1).
- Produces: `backup(srcPaths, destDir, projectRoot) -> { archives: [ {src, dest, bytes, files} ] }`; THROWS when `destDir` resolves inside any source, inside the git repository containing any source, inside `projectRoot`, or inside the shared store containing a source, and when a source is missing or the written archive verifies empty.

- [ ] **Step 1: Write the failing test**

Insert into `cli/knowledge-migrate.test.js` immediately before the `fs.rmSync(TEST_DIR, { recursive: true, force: true });` cleanup line that precedes the final tally:

```js
console.log('backup (step 3):');
(function () {
  var root = path.join(TEST_DIR, 'backup');
  var repo = path.join(root, 'repo');
  var vault = path.join(root, 'vault', 'projects', 'demo');
  fs.mkdirSync(repo, { recursive: true });
  writeFile(path.join(repo, 'docs', 'a.md'), '# A\n');
  writeFile(path.join(repo, 'docs', 'nested', 'b.md'), '# B\n');
  writeFile(path.join(vault, 'architecture.md'), '# arch\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });

  var dest = path.join(root, 'phe-backups');
  var res = backup([vault, path.join(repo, 'docs')], dest);

  assert('one archive per source', res.archives.length === 2);
  assert('archives land in destDir',
    res.archives.every(function (a) { return path.dirname(a.dest) === dest; }));
  assert('archive names end in .tar.gz',
    res.archives.every(function (a) { return /\.tar\.gz$/.test(a.dest); }));
  assert('archives exist on disk with non-zero bytes',
    res.archives.every(function (a) { return fs.existsSync(a.dest) && a.bytes > 0; }));
  assert('the docs archive verified 2 files',
    res.archives.filter(function (a) { return a.src === path.join(repo, 'docs'); })[0].files === 2);
  assert('the shared-store archive verified 1 file',
    res.archives.filter(function (a) { return a.src === vault; })[0].files === 1);

  var threwRepo = null;
  try { backup([path.join(repo, 'docs')], path.join(repo, 'backups')); }
  catch (e) { threwRepo = e; }
  assert('REFUSES a dest inside the repository', threwRepo !== null);
  assert('the repo refusal names the repository', /repositor/i.test(threwRepo.message));
  assert('the repo refusal wrote nothing', !fs.existsSync(path.join(repo, 'backups')));

  var threwSrc = null;
  try { backup([vault], path.join(vault, 'archive')); }
  catch (e) { threwSrc = e; }
  assert('REFUSES a dest inside a source (the shared store)', threwSrc !== null);
  assert('the source refusal wrote nothing', !fs.existsSync(path.join(vault, 'archive')));

  var threwMissing = null;
  try { backup([path.join(root, 'nope')], dest); } catch (e) { threwMissing = e; }
  assert('REFUSES a missing source rather than writing a partial set', threwMissing !== null);

  var threwOutside = null;
  try { backup([vault], path.join(repo, 'backups'), repo); } catch (e) { threwOutside = e; }
  assert('REFUSES a dest inside the project repo even when no source is in it', threwOutside !== null);

  var threwVault = null;
  try { backup([vault], path.join(root, 'vault', 'backups'), null); } catch (e) { threwVault = e; }
  assert('REFUSES a dest inside the shared store but outside the source folder', threwVault !== null);

  var sibling = backup([vault], path.join(root, 'sibling-backups'));
  assert('a dest OUTSIDE repo and sources is allowed', sibling.archives.length === 1);
})();
```

- [ ] **Step 2: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: the earlier 38 PASS lines, then `TypeError: backup is not a function` and a non-zero exit.

- [ ] **Step 3: Implement `backup`**

In `cli/knowledge-migrate.js`, insert immediately after `leakScan`:

```js
// The git repository a path belongs to, or null. Used to answer "is this
// destination inside the repo?" without the caller having to pass the repo root.
function gitToplevel(p) {
  var dir = p;
  try {
    if (!fs.statSync(p).isDirectory()) dir = path.dirname(p);
  } catch (e) {
    dir = path.dirname(p);
  }
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch (e) {
    return null; // not a git repo — the source-containment check still applies
  }
}

// Step 3 — BACKUP. Mandatory before the first byte is written (decision 25),
// covering the shared store AND every confirmed local candidate: those are often
// gitignored, so git is NOT a fallback. Verified tarballs only — an archive that
// cannot be listed is not a backup.
function backup(srcPaths, destDir, projectRoot) {
  var dest = path.resolve(destDir);
  var i;
  // The repo being migrated INTO is a refusal target even when no source lives in
  // it: the vault has no git, so gitToplevel(src) returns null and the loop below
  // would wave a dest inside the repo straight through.
  if (projectRoot) {
    var here = gitToplevel(projectRoot) || path.resolve(projectRoot);
    if (isInside(dest, here)) {
      throw new Error('Backup destination ' + dest + ' resolves inside the repository ' + here +
        ' — use ~/.phe-backups/.');
    }
  }
  // The shared store as a whole is a refusal target, not just the source folder
  // inside it: <vault>/backups is outside <vault>/projects/<name> but still in
  // the tree the archive is supposed to survive.
  for (i = 0; i < srcPaths.length; i++) {
    var maybeVault = path.resolve(srcPaths[i], '..', '..');
    if (fs.existsSync(path.join(maybeVault, 'projects')) && isInside(dest, maybeVault)) {
      throw new Error('Backup destination ' + dest + ' resolves inside the shared store ' +
        maybeVault + ' — use ~/.phe-backups/.');
    }
  }
  for (i = 0; i < srcPaths.length; i++) {
    var src = path.resolve(srcPaths[i]);
    if (!fs.existsSync(src)) {
      throw new Error('Nothing to back up at ' + src + ' — refusing to write a partial backup set.');
    }
    if (isInside(dest, src)) {
      throw new Error('Backup destination ' + dest + ' resolves inside ' + src +
        '. A backup stored inside what it protects is not a backup — use ~/.phe-backups/.');
    }
    var repo = gitToplevel(src);
    if (repo && isInside(dest, repo)) {
      throw new Error('Backup destination ' + dest + ' resolves inside the repository ' + repo +
        ' — use ~/.phe-backups/.');
    }
  }

  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  var archives = [];
  for (i = 0; i < srcPaths.length; i++) {
    var s = path.resolve(srcPaths[i]);
    var archive = path.join(dest, path.basename(s) + '-' + stamp + '.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', path.dirname(s), path.basename(s)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    // VERIFY by listing: this is the difference between a backup and a file.
    var listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf-8' }).trim();
    var files = listing === '' ? 0 : listing.split('\n').filter(function (n) {
      return n.charAt(n.length - 1) !== '/';
    }).length;
    if (files === 0) {
      throw new Error('Backup of ' + s + ' verified EMPTY (' + archive + ') — refusing to continue.');
    }
    archives.push({ src: s, dest: archive, bytes: fs.statSync(archive).size, files: files });
  }
  return { archives: archives };
}
```

Add `backup: backup,` to `module.exports` after `leakScan`.

- [ ] **Step 4: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: 15 new `PASS:` lines under `backup (step 3):`, ending with `53 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/knowledge-migrate.js cli/knowledge-migrate.test.js && git commit -m "feat(cli): verified tarball backup refusing a dest inside the repo or a source"
```

Expected: `2 files changed`.

---

## Task 5: `resolveLinks` + `verifyLinks` — steps 6 and 6b

Resolution order is exact path → basename → **report, never guess**. Fenced regions and HTML comments are skipped; the escaped pipe `\|` (what Obsidian needs inside a table cell) is honoured as an alias separator.

**Files:**
- Modify: `cli/knowledge-migrate.js` (add after `backup`; extend `module.exports`)
- Test: `cli/knowledge-migrate.test.js` (insert immediately before the `fs.rmSync(TEST_DIR, …)` cleanup line)

**Interfaces:**
- Consumes: `commonRoot(absPaths)`, `mdFilesUnder(dir)` (Task 1).
- Produces: `resolveLinks(files) -> { resolved: [ {key, file, line, link, target, to, via} ], unresolved: [ {key, file, line, link, target, reason} ] }` where `key = <basename>#<occurrence-index>` (stable across a move AND a rewrite), `via` is `"exact" | "basename"`, `reason` is `"not-found" | "ambiguous"`; and `verifyLinks(before, after) -> { regressed: [ {file, link} ] }`.

- [ ] **Step 1: Write the failing test**

Insert into `cli/knowledge-migrate.test.js` immediately before the `fs.rmSync(TEST_DIR, { recursive: true, force: true });` cleanup line that precedes the final tally:

```js
console.log('resolveLinks / verifyLinks (steps 6, 6b):');
(function () {
  var dir = path.join(TEST_DIR, 'links');
  var idx = path.join(dir, '_index.md');
  var arch = path.join(dir, 'sub', 'architecture.md');
  var dup1 = path.join(dir, 'a', 'runbook.md');
  var dup2 = path.join(dir, 'b', 'runbook.md');
  writeFile(idx, [
    '# Index',
    'Exact: [[sub/architecture]] and [[sub/architecture.md]].',
    'Basename: [[architecture]].',
    'Aliased: [[sub/architecture|the map]].',
    'Escaped pipe in a table: | [[sub/architecture\\|map]] |',
    'Anchor: [[sub/architecture#Boundaries]].',
    'Ambiguous: [[runbook]].',
    'Missing: [[nowhere]].',
    '',
    '```',
    'Fenced: [[should-not-count]]',
    '```',
    '',
    '<!-- Commented: [[also-not-counted]] -->',
    '',
  ].join('\n'));
  writeFile(arch, '# Architecture\n');
  writeFile(dup1, '# Runbook A\n');
  writeFile(dup2, '# Runbook B\n');

  var res = resolveLinks([idx, arch, dup1, dup2]);
  var targets = res.resolved.map(function (r) { return r.target; });

  assert('exact path resolves', targets.indexOf('sub/architecture') !== -1);
  assert('exact path with .md resolves', targets.indexOf('sub/architecture.md') !== -1);
  assert('unique basename resolves', res.resolved.some(function (r) { return r.target === 'architecture' && r.via === 'basename'; }));
  assert('alias is stripped from the target',
    res.resolved.filter(function (r) { return /the map/.test(r.link); })[0].target === 'sub/architecture');
  assert('escaped pipe is honoured as an alias separator',
    res.resolved.some(function (r) { return /\\\|map/.test(r.link) && r.target === 'sub/architecture'; }));
  assert('heading anchor is not part of the path',
    res.resolved.some(function (r) { return /#Boundaries/.test(r.link) && r.target === 'sub/architecture'; }));
  assert('ambiguous basename is REPORTED, never guessed',
    res.unresolved.some(function (u) { return u.target === 'runbook' && u.reason === 'ambiguous'; }));
  assert('missing target is reported as not-found',
    res.unresolved.some(function (u) { return u.target === 'nowhere' && u.reason === 'not-found'; }));
  assert('fenced link is skipped',
    res.resolved.concat(res.unresolved).every(function (r) { return r.target !== 'should-not-count'; }));
  assert('HTML-commented link is skipped',
    res.resolved.concat(res.unresolved).every(function (r) { return r.target !== 'also-not-counted'; }));
  assert('every entry carries a 1-based line number',
    res.resolved.concat(res.unresolved).every(function (r) { return r.line >= 1; }));

  // 6b: the SAME tree moved (and its links rewritten) must not lose a resolution.
  var moved = path.join(TEST_DIR, 'links-after');
  var mIdx = path.join(moved, 'knowledge-base', '_index.md');
  var mArch = path.join(moved, 'knowledge-base', 'architecture.md');
  var mDup1 = path.join(moved, 'knowledge-base', 'a', 'runbook.md');
  var mDup2 = path.join(moved, 'knowledge-base', 'b', 'runbook.md');
  writeFile(mIdx, fs.readFileSync(idx, 'utf-8').split('sub/architecture').join('architecture'));
  writeFile(mArch, '# Architecture\n');
  writeFile(mDup1, '# Runbook A\n');
  writeFile(mDup2, '# Runbook B\n');
  var after = resolveLinks([mIdx, mArch, mDup1, mDup2]);
  assert('a faithful move keeps every resolution', verifyLinks(res, after).regressed.length === 0);

  var broken = path.join(TEST_DIR, 'links-broken');
  var bIdx = path.join(broken, '_index.md');
  writeFile(bIdx, fs.readFileSync(idx, 'utf-8').split('sub/architecture').join('gone/architecture'));
  var brokenAfter = resolveLinks([bIdx]);
  var verdict = verifyLinks(res, brokenAfter);
  assert('a link that stopped resolving is REGRESSED', verdict.regressed.length > 0);
  assert('the regression names the original file and link',
    verdict.regressed[0].file === idx && /\[\[/.test(verdict.regressed[0].link));
})();
```

- [ ] **Step 2: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: the earlier 53 PASS lines, then `TypeError: resolveLinks is not a function` and a non-zero exit.

- [ ] **Step 3: Implement the resolver and the verifier**

In `cli/knowledge-migrate.js`, insert immediately after `backup`:

```js
var WIKILINK = /\[\[([^\[\]]+)\]\]/g;

// Every wikilink SITE in a file, in document order. Fenced regions and HTML
// comments are skipped: a link inside them is documentation ABOUT links, and
// rewriting it changes an example into a lie.
function linkSites(text) {
  var out = [];
  var lines = text.split('\n');
  var inFence = false;
  var inComment = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;

    var scan = line;
    if (inComment) {
      var close = scan.indexOf('-->');
      if (close === -1) continue;
      scan = scan.slice(close + 3);
      inComment = false;
    }
    scan = scan.replace(/<!--[\s\S]*?-->/g, '');
    var open = scan.indexOf('<!--');
    if (open !== -1) { scan = scan.slice(0, open); inComment = true; }

    var m;
    WIKILINK.lastIndex = 0;
    while ((m = WIKILINK.exec(scan)) !== null) {
      // The escaped pipe first: inside a table cell Obsidian requires [[a\|b]],
      // and splitting on a bare | there would keep a stray backslash.
      var target = m[1].split(/\\\||\|/)[0].split('#')[0].trim();
      if (!target) continue;
      out.push({ line: i + 1, link: '[[' + m[1] + ']]', target: target });
    }
  }
  return out;
}

// Steps 6/6b — resolution order: exact path -> unique basename -> REPORT.
// Never guess: an ambiguous basename is an unresolved link, not a coin flip.
// `key` is <basename>#<occurrence-index>, which survives both the move (the file
// keeps its name) and the rewrite (the link text changes) — so 6b can compare
// the same site before and after.
function resolveLinks(files) {
  var abs = [];
  var i;
  for (i = 0; i < files.length; i++) abs.push(path.resolve(files[i]));
  var root = commonRoot(abs);

  var byRel = {};
  var byBase = {};
  for (i = 0; i < abs.length; i++) {
    var rel = path.relative(root, abs[i]).split(path.sep).join('/');
    byRel[rel] = abs[i];
    byRel[rel.replace(/\.md$/i, '')] = abs[i];
    var base = path.basename(abs[i]).replace(/\.md$/i, '');
    if (!byBase[base]) byBase[base] = [];
    byBase[base].push(abs[i]);
  }

  var resolved = [];
  var unresolved = [];
  for (i = 0; i < abs.length; i++) {
    var text;
    try {
      text = fs.readFileSync(abs[i], 'utf-8');
    } catch (e) {
      continue;
    }
    var sites = linkSites(text);
    for (var s = 0; s < sites.length; s++) {
      var site = sites[s];
      var key = path.basename(abs[i]) + '#' + s;
      var t = site.target.replace(/^\.\//, '');
      var hit = byRel[t] || byRel[t.replace(/\.md$/i, '')];
      if (hit) {
        resolved.push({ key: key, file: abs[i], line: site.line, link: site.link, target: t, to: hit, via: 'exact' });
        continue;
      }
      var baseHits = byBase[path.basename(t).replace(/\.md$/i, '')] || [];
      if (baseHits.length === 1) {
        resolved.push({ key: key, file: abs[i], line: site.line, link: site.link, target: t, to: baseHits[0], via: 'basename' });
        continue;
      }
      unresolved.push({
        key: key, file: abs[i], line: site.line, link: site.link, target: t,
        reason: baseHits.length > 1 ? 'ambiguous' : 'not-found',
      });
    }
  }
  return { resolved: resolved, unresolved: unresolved };
}

// Step 6b — the migration FAILS if any previously-resolving link stopped
// resolving. A link that was already broken before the migration is not this
// run's problem and is not reported here (it is in the step-9 report instead).
function verifyLinks(before, after) {
  var live = {};
  var i;
  for (i = 0; i < after.resolved.length; i++) live[after.resolved[i].key] = true;
  var regressed = [];
  for (i = 0; i < before.resolved.length; i++) {
    var b = before.resolved[i];
    if (!live[b.key]) regressed.push({ file: b.file, link: b.link });
  }
  return { regressed: regressed };
}
```

Add `resolveLinks: resolveLinks,` and `verifyLinks: verifyLinks,` to `module.exports` after `backup`.

- [ ] **Step 4: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: 14 new `PASS:` lines under `resolveLinks / verifyLinks (steps 6, 6b):`, ending with `67 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/knowledge-migrate.js cli/knowledge-migrate.test.js && git commit -m "feat(cli): fence-aware wikilink resolver + regression verifier for step 6b"
```

Expected: `2 files changed`.

---

## Task 6: The `run()` dispatcher — crash-resume and the fixture-vault dry run

**Files:**
- Modify: `cli/knowledge-migrate.js` (add after `verifyLinks`; extend `module.exports`)
- Test: `cli/knowledge-migrate.test.js` (insert immediately before the `fs.rmSync(TEST_DIR, …)` cleanup line)

**Interfaces:**
- Consumes: every export from Tasks 1–5.
- Produces: `run(argv, projectRoot) -> { ok, sub, skipped, data }` for the subcommands `status | detect | decide | backup | verify-links | record`, and `main()` (reads `process.argv.slice(3)` and `process.cwd()`, prints `data` as JSON, exits 1 when `ok` is false). `decide <marker> <genericize|redact|accept>` writes the ledger's `leakDecisions` map; `detect` re-runs the step-0 gate over the planned copy with those decisions applied.

- [ ] **Step 1: Write the failing test**

Insert into `cli/knowledge-migrate.test.js` immediately before the `fs.rmSync(TEST_DIR, { recursive: true, force: true });` cleanup line that precedes the final tally:

```js
console.log('run() dispatcher, crash-resume, fixture-vault dry run:');
(function () {
  // A complete fixture: a git repo with legacy knowledge + a shared vault folder.
  // NOTHING here touches ~/Dev/The Vault.
  var root = path.join(TEST_DIR, 'e2e');
  var proj = path.join(root, 'repo');
  var vault = path.join(root, 'vault');
  var shared = path.join(vault, 'projects', 'demo');
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  writeFile(path.join(proj, 'docs', 'architecture.md'), '# Arch\n\nSee [[runbook]].\n');
  writeFile(path.join(proj, 'docs', 'runbook.md'), '# Runbook\n\nRun it at /Users/someone/Dev/app.\n');
  writeFile(path.join(shared, '_index.md'), '# demo\n\n- [[architecture]]\n');
  writeFile(path.join(shared, 'decisions.md'), '# Decisions\n');
  execFileSync('git', ['init', '-q'], { cwd: proj });

  var statusEmpty = run(['status'], proj);
  assert('status on a virgin project reports no ledger',
    statusEmpty.ok === true && /no migration ledger/i.test(statusEmpty.data.message));

  var detected = run(['detect', '--shared', shared], proj);
  assert('detect succeeds when no needs-decision leak exists', detected.ok === true);
  assert('detect reports the shared store', detected.data.detected.shared.mdCount === 2);
  assert('detect reports the local candidate', detected.data.detected.local.some(function (c) { return c.path === 'docs'; }));
  assert('detect classifies the home path as auto-genericizable', detected.data.leaks.autoGenericizable.length === 1);
  assert('detect records steps 0 and 1',
    readLedger(proj).steps['0'] === 'done' && readLedger(proj).steps['1'] === 'done');
  assert('detect flips the ledger to in-progress', readLedger(proj).status === 'in-progress');
  assert('detect stores the pre-migration link snapshot', readLedger(proj).linksBefore.resolved.length === 2);
  assert('detect moved nothing', fs.existsSync(path.join(proj, 'docs', 'architecture.md')));

  // Crash after step 0, before step 1 -> a re-run completes both, read-only.
  writeLedger(proj, { steps: { '1': 'failed' } });
  var redetect = run(['detect', '--shared', shared], proj);
  assert('crash-resume: re-running detect completes step 1',
    redetect.ok === true && readLedger(proj).steps['1'] === 'done');

  run(['record', '2', 'done'], proj);
  run(['record', '2b', 'done'], proj);
  assert('record appends a step without erasing the others',
    readLedger(proj).steps['0'] === 'done' && readLedger(proj).steps['2b'] === 'done');

  var backed = run(['backup', '--shared', shared, '--candidate', 'docs', '--dest', path.join(root, 'phe-backups')], proj);
  assert('backup archives the shared store AND the confirmed candidate', backed.data.backups.length === 2);
  assert('backup records step 3', readLedger(proj).steps['3'] === 'done');
  assert('backup persists the archive list in the ledger', readLedger(proj).backups.length === 2);

  // Crash after step 3 -> a re-run must NOT write a second archive set.
  var again = run(['backup', '--shared', shared, '--candidate', 'docs', '--dest', path.join(root, 'phe-backups')], proj);
  assert('crash-resume: a done backup step is SKIPPED', again.skipped === true);
  assert('crash-resume: no second archive set was written',
    fs.readdirSync(path.join(root, 'phe-backups')).length === 2);

  // Simulate the skill's step 5/6: the import set lands in knowledge-base/.
  writeFile(path.join(proj, 'knowledge-base', 'architecture.md'), '# Arch\n\nSee [[runbook]].\n');
  writeFile(path.join(proj, 'knowledge-base', 'runbook.md'), '# Runbook\n\nRun it at ~/Dev/app.\n');
  writeFile(path.join(proj, 'knowledge-base', '_index.md'), '# demo\n\n- [[architecture]]\n');
  writeFile(path.join(proj, 'knowledge-base', 'decisions.md'), '# Decisions\n');
  var verified = run(['verify-links'], proj);
  assert('verify-links passes when every link still resolves', verified.ok === true);
  assert('verify-links records step 6b', readLedger(proj).steps['6b'] === 'done');

  run(['record', '8', 'done', '--status', 'done'], proj);
  assert('record --status closes the ledger', readLedger(proj).status === 'done');

  // A regression must FAIL the run.
  var proj2 = freshProj('e2e-regress');
  writeFile(path.join(proj2, 'docs', 'a.md'), '# A\n\n[[b]]\n');
  writeFile(path.join(proj2, 'docs', 'b.md'), '# B\n');
  run(['detect', '--shared', ''], proj2);
  writeFile(path.join(proj2, 'knowledge-base', 'a.md'), '# A\n\n[[b]]\n');
  var regressed = run(['verify-links'], proj2);
  assert('verify-links FAILS when a link stopped resolving', regressed.ok === false);
  assert('the failed verification is recorded as failed', readLedger(proj2).steps['6b'] === 'failed');

  // The leak gate refuses, and refusing records step 0 as failed.
  var proj3 = freshProj('e2e-leak');
  writeFile(path.join(proj3, 'docs', 'leak.md'), 'Ported from bzroo.\n');
  var refused = run(['detect', '--shared', ''], proj3);
  assert('detect REFUSES while a needs-decision leak is unresolved', refused.ok === false);
  assert('the refusal names the leak gate', refused.data.reason === 'leak gate');
  assert('the refusal records step 0 failed and never records step 1',
    readLedger(proj3).steps['0'] === 'failed' && readLedger(proj3).steps['1'] === undefined);

  // …and a RECORDED decision clears it, because the gate judges the PLANNED COPY,
  // not the source. This is the whole reason increment 3 can genericize the
  // imported copy only and still get past step 0.
  var leakSrc = path.join(proj3, 'docs', 'leak.md');
  var leakSrcBefore = fs.readFileSync(leakSrc, 'utf-8');
  run(['decide', 'bzroo', 'genericize'], proj3);
  assert('decide persists the resolution in the ledger',
    readLedger(proj3).leakDecisions.bzroo === 'genericize');
  var cleared = run(['detect', '--shared', ''], proj3);
  assert('a recorded decision CLEARS the leak gate', cleared.ok === true);
  assert('the cleared gate records steps 0 and 1',
    readLedger(proj3).steps['0'] === 'done' && readLedger(proj3).steps['1'] === 'done');
  assert('clearing the gate writes the linksBefore snapshot verify-links needs',
    readLedger(proj3).linksBefore !== undefined);
  assert('the SOURCE is byte-identical — the gate never rewrites the shared store',
    fs.readFileSync(leakSrc, 'utf-8') === leakSrcBefore);
  assert('the raw classification survives for the report while unresolved is empty',
    cleared.data.leaks.needsDecision.length === 1 && cleared.data.leaks.unresolved.length === 0);
  var threwResolution = null;
  try { run(['decide', 'bzroo', 'maybe'], proj3); } catch (e) { threwResolution = e; }
  assert('an unknown resolution is REFUSED', threwResolution !== null);

  // Clean project: nothing detected, nothing at risk, no backup taken.
  var proj4 = freshProj('e2e-clean');
  var clean = run(['backup', '--shared', ''], proj4);
  assert('clean project: backup is a recorded no-op', clean.ok === true && clean.data.backups.length === 0);
  assert('clean project: step 3 is still recorded', readLedger(proj4).steps['3'] === 'done');

  // --dry-run is a real dry run: the documented step-4 entry point promises
  // "nothing is backed up, moved or rewritten", and the ledger is a write.
  var proj5 = freshProj('e2e-dry-run');
  writeFile(path.join(proj5, 'docs', 'a.md'), '# A\n');
  var dry = run(['detect', '--shared', '', '--dry-run'], proj5);
  assert('detect --dry-run reports but WRITES NO LEDGER',
    dry.ok === true && dry.data.dryRun === true && readLedger(proj5) === null);

  // The leak path is where "writes nothing" is easiest to break: proj5 is
  // leak-free, so the assert above passes even if the gate writes on the way out.
  var proj5b = freshProj('e2e-dry-run-leaky');
  writeFile(path.join(proj5b, 'docs', 'a.md'), 'Ported from bzroo.\n');
  var dryLeaky = run(['detect', '--shared', '', '--dry-run'], proj5b);
  assert('detect --dry-run over a LEAKY set still returns the payload and writes no ledger',
    dryLeaky.ok === true && dryLeaky.data.dryRun === true &&
    dryLeaky.data.leaks.unresolved.length === 1 && readLedger(proj5b) === null);

  // An unparseable harness.json REFUSES rather than detecting as if no shared
  // store were configured (readKnowledgeConfig degrades to null by design).
  var proj6 = freshProj('e2e-bad-config');
  fs.writeFileSync(path.join(proj6, '.claude', 'harness.json'), '{ not json');
  var threwMalformed = null;
  try { run(['detect'], proj6); } catch (e) { threwMalformed = e; }
  assert('malformed harness.json REFUSES the detect step', threwMalformed !== null);

  // linksBefore is FROZEN from step 6 onwards. A resume that re-snapshotted after
  // the move would compare the post-migration tree against itself and make 6b
  // vacuously green — the one failure mode the freeze exists to prevent.
  var proj7 = freshProj('e2e-freeze');
  writeFile(path.join(proj7, 'docs', 'a.md'), '# A\n\n[[b]]\n');
  writeFile(path.join(proj7, 'docs', 'b.md'), '# B\n');
  run(['detect', '--shared', ''], proj7);
  var snapshotBefore = JSON.stringify(readLedger(proj7).linksBefore);
  run(['record', '6', 'done'], proj7);
  // Step 6 moved the sources out: a re-snapshot here would record an EMPTY tree.
  fs.rmSync(path.join(proj7, 'docs'), { recursive: true, force: true });
  var refrozen = run(['detect', '--shared', ''], proj7);
  assert('linksBefore is FROZEN once step 6 is done (a resume cannot blank the snapshot)',
    refrozen.data.linksBeforeFrozen === true &&
    JSON.stringify(readLedger(proj7).linksBefore) === snapshotBefore);

  var threwUnknown = null;
  try { run(['frobnicate'], proj4); } catch (e) { threwUnknown = e; }
  assert('an unknown subcommand throws', threwUnknown !== null);
})();
```

- [ ] **Step 2: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: the earlier 67 PASS lines, then `TypeError: run is not a function` and a non-zero exit.

- [ ] **Step 3: Implement the dispatcher**

In `cli/knowledge-migrate.js`, insert immediately after `verifyLinks`:

```js
function parseArgs(argv) {
  var out = { _: [], candidates: [], dest: null, shared: null, status: null, dryRun: false, from: null, to: null };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--candidate') out.candidates.push(argv[++i]);
    else if (a === '--dest') out.dest = argv[++i];
    else if (a === '--shared') out.shared = argv[++i];
    else if (a === '--status') out.status = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else out._.push(a);
  }
  return out;
}

// The shared store's path comes from harness.json `knowledge.shared` (increment
// 1). `--shared` overrides it so this module is testable without a config, and
// so an operator can point at a store the config does not know about.
function sharedPathFromConfig(projectRoot) {
  var readKnowledgeConfig;
  try {
    readKnowledgeConfig = require('./knowledge-config').readKnowledgeConfig;
  } catch (e) {
    throw new Error('cli/knowledge-config.js is missing — the local knowledge base must ship before the migration can read `knowledge` from harness.json.');
  }
  var cfg = readKnowledgeConfig(projectRoot);
  if (!cfg || !cfg.shared || cfg.shared.mode !== 'existing' || !cfg.shared.path) return null;
  return cfg.shared.path;
}

// Subcommand dispatcher. Steps the CLI owns: 0+1 (detect), 3 (backup), 6b
// (verify-links); `record` is how the SKILL appends its own steps (2, 2b, 4, 5,
// 6, 7, 8, 9) after every one of them, and `decide` is how it persists a human
// resolution of a step-0 leak marker. Read-only steps re-run on a resume;
// destructive ones are skipped once recorded done.
function run(argv, projectRoot) {
  var opts = parseArgs(argv);
  var sub = opts._[0] || 'status';
  var ledger = readLedger(projectRoot);
  var steps = ledger && ledger.steps ? ledger.steps : {};

  if (sub === 'status') {
    return {
      ok: true, sub: sub, skipped: false,
      data: ledger || { message: 'no migration ledger at ' + LEDGER_REL + ' — nothing armed, nothing in flight.' },
    };
  }

  if (sub === 'record') {
    var step = opts._[1];
    var state = opts._[2];
    if (!step || (state !== 'done' && state !== 'failed')) {
      throw new Error('usage: knowledge-migrate record <step> <done|failed> [--status pending|in-progress|done] [--from <src> --to <dest>]');
    }
    var recPatch = { steps: {} };
    recPatch.steps[step] = state;
    if (opts.status) recPatch.status = opts.status;
    // The manifest is what a rollback reads (design step 8: "a manifest of what
    // moved from where"). It is APPENDED here, one entry per --from/--to pair,
    // because the skill records each move as it makes it.
    if (opts.from || opts.to) {
      if (!opts.from || !opts.to) {
        throw new Error('--from and --to must be given together — a manifest entry with one half is not a rollback.');
      }
      var manifest = (ledger && Array.isArray(ledger.manifest)) ? ledger.manifest.slice() : [];
      manifest.push({ from: opts.from, to: opts.to });
      recPatch.manifest = manifest;
    }
    writeLedger(projectRoot, recPatch);
    return {
      ok: true, sub: sub, skipped: false,
      data: { step: step, state: state, status: opts.status, from: opts.from, to: opts.to },
    };
  }

  // `decide` is how a human RESOLUTION of a step-0 leak marker is persisted, so
  // the gate can recompute the planned copy on the next `detect` (and after a
  // crash). Resolutions accumulate: one call per marker, keyed lower-case because
  // the leak pattern itself is case-insensitive.
  if (sub === 'decide') {
    var marker = opts._[1];
    var resolution = opts._[2];
    if (!marker || DECISIONS.indexOf(resolution) === -1) {
      throw new Error('usage: knowledge-migrate decide <marker> <' + DECISIONS.join('|') + '>');
    }
    var priorDecisions = (ledger && ledger.leakDecisions && typeof ledger.leakDecisions === 'object' &&
      !Array.isArray(ledger.leakDecisions)) ? ledger.leakDecisions : {};
    var nextDecisions = {};
    var dk;
    for (dk in priorDecisions) {
      if (Object.prototype.hasOwnProperty.call(priorDecisions, dk)) nextDecisions[dk] = priorDecisions[dk];
    }
    nextDecisions[String(marker).toLowerCase()] = resolution;
    writeLedger(projectRoot, { leakDecisions: nextDecisions });
    return {
      ok: true, sub: sub, skipped: false,
      data: { marker: String(marker).toLowerCase(), resolution: resolution, leakDecisions: nextDecisions },
    };
  }

  if (sub === 'detect') {
    // A harness.json we cannot parse is a REFUSAL, not a `shared: null` shrug:
    // readKnowledgeConfig degrades to null by design, and proceeding would scan
    // the repo as if no shared store were configured (design steps 5 and 8).
    var cfgPath = path.join(projectRoot, '.claude', 'harness.json');
    if (fs.existsSync(cfgPath)) {
      try {
        JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      } catch (e) {
        throw new Error(cfgPath + ' is not valid JSON. Fix it by hand and re-run — refusing to ' +
          'detect against a config that cannot be read.');
      }
    }
    var sharedPath = opts.shared !== null ? opts.shared : sharedPathFromConfig(projectRoot);
    var found = detectCandidates(projectRoot, sharedPath);
    var importSet = [];
    var i;
    if (found.shared) importSet = importSet.concat(mdFilesUnder(found.shared.path));
    for (i = 0; i < found.local.length; i++) {
      importSet = importSet.concat(mdFilesUnder(path.join(projectRoot, found.local[i].path)));
    }
    // THE GATE EVALUATES THE PLANNED COPY, NOT THE SOURCE (design table, step 0):
    // the import set as step 5 will write it, with genericization and every
    // decision already recorded in the ledger applied. That copy is the only text
    // that can leak into a tracked, possibly public repo — so a recorded decision
    // CLEARS the gate and the shared store is never rewritten to satisfy it.
    // `leaks.unresolved` is what blocks; `needsDecision` stays as the raw
    // classification the step-9 report is written from.
    var leaks = plannedLeaks(importSet, (ledger && ledger.leakDecisions) || {});
    // --dry-run is exempt from the blocking write: it promises to write NOTHING,
    // not even a failed step, and its return below already carries `leaks` — so
    // the operator can see exactly what blocks without the ledger moving.
    if (leaks.unresolved.length > 0 && !opts.dryRun) {
      writeLedger(projectRoot, { status: 'in-progress', steps: { '0': 'failed' } });
      return {
        ok: false, sub: sub, skipped: false,
        data: { reason: 'leak gate', detected: found, leaks: leaks, files: importSet.length },
      };
    }
    var links = resolveLinks(importSet);
    // --dry-run means EXACTLY that: nothing is written, not even the ledger.
    // The step-4 plan is produced from this return value by the skill.
    if (opts.dryRun) {
      return {
        ok: true, sub: sub, skipped: false,
        data: {
          dryRun: true, detected: found, leaks: leaks, files: importSet.length,
          links: { resolved: links.resolved.length, unresolved: links.unresolved },
        },
      };
    }
    // Steps 0 and 1 are read-only, so they RE-RUN on a resume — but `linksBefore`
    // is the pre-migration snapshot step 6b compares against. Once step 6 has
    // moved anything, re-snapshotting would overwrite it with a POST-migration
    // reading and make 6b vacuously green. Freeze it from step 6 onwards.
    var freeze = steps['6'] === 'done' || steps['6b'] === 'done' ||
      (ledger && ledger.linksBefore && steps['5'] === 'done');
    var patch = { status: 'in-progress', steps: { '0': 'done', '1': 'done' } };
    if (!freeze) patch.linksBefore = links;
    writeLedger(projectRoot, patch);
    return {
      ok: true, sub: sub, skipped: false,
      data: {
        detected: found, leaks: leaks, files: importSet.length,
        linksBeforeFrozen: !!freeze,
        links: { resolved: links.resolved.length, unresolved: links.unresolved },
      },
    };
  }

  if (sub === 'backup') {
    if (steps['3'] === 'done') {
      return { ok: true, sub: sub, skipped: true, data: { backups: (ledger && ledger.backups) || [] } };
    }
    var sp = opts.shared !== null ? opts.shared : sharedPathFromConfig(projectRoot);
    var srcs = [];
    if (sp && fs.existsSync(sp)) srcs.push(sp);
    for (var c = 0; c < opts.candidates.length; c++) {
      srcs.push(path.resolve(projectRoot, opts.candidates[c]));
    }
    if (srcs.length === 0) {
      // Clean project: nothing is at risk, so nothing is backed up — but the
      // step is still recorded, or a resume would ask for a backup forever.
      writeLedger(projectRoot, { status: 'in-progress', steps: { '3': 'done' }, backups: [] });
      return { ok: true, sub: sub, skipped: false, data: { backups: [], note: 'nothing at risk — no backup taken' } };
    }
    var dest = opts.dest || path.join(os.homedir(), '.phe-backups');
    var res;
    try {
      res = backup(srcs, dest, projectRoot);
    } catch (e) {
      writeLedger(projectRoot, { status: 'in-progress', steps: { '3': 'failed' } });
      throw e;
    }
    writeLedger(projectRoot, { status: 'in-progress', steps: { '3': 'done' }, backups: res.archives });
    return { ok: true, sub: sub, skipped: false, data: { backups: res.archives } };
  }

  if (sub === 'verify-links') {
    if (steps['6b'] === 'done') return { ok: true, sub: sub, skipped: true, data: { regressed: [] } };
    if (!ledger || !ledger.linksBefore) {
      throw new Error('No pre-migration link snapshot in ' + LEDGER_REL +
        ' — run `knowledge-migrate detect` before moving anything.');
    }
    var after = resolveLinks(mdFilesUnder(path.join(projectRoot, 'knowledge-base')));
    var verdict = verifyLinks(ledger.linksBefore, after);
    if (verdict.regressed.length > 0) {
      writeLedger(projectRoot, { steps: { '6b': 'failed' } });
      return { ok: false, sub: sub, skipped: false, data: verdict };
    }
    writeLedger(projectRoot, { steps: { '6b': 'done' } });
    return { ok: true, sub: sub, skipped: false, data: { regressed: [], checked: after.resolved.length } };
  }

  throw new Error('Unknown knowledge-migrate step: ' + sub +
    '. Expected one of: status, detect, decide, backup, verify-links, record.');
}

// cli/index.js is the ONLY entry point (argv[2] is the subcommand name itself).
function main() {
  var result = run(process.argv.slice(3), process.cwd());
  console.log(JSON.stringify(result.data, null, 2));
  if (result.skipped) {
    console.log('(already recorded done in ' + LEDGER_REL + ' — skipped, nothing changed)');
  }
  if (!result.ok) process.exit(1);
}
```

Add `run: run,` and `main: main,` to the end of `module.exports`.

- [ ] **Step 4: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/knowledge-migrate.test.js
```

Expected: 38 new `PASS:` lines under `run() dispatcher, crash-resume, fixture-vault dry run:`, ending with `105 passed, 0 failed` — the reconciled canonical total (8 + 21 + 9 + 15 + 14 + 38, counted from the six blocks this plan writes).

- [ ] **Step 5: Prove the fixture vault was the only vault touched**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -n "os.homedir()\|process.env.HOME" cli/knowledge-migrate.test.js | wc -l; ls ~/.phe-backups 2>&1 | head -1
```

Expected: `0` (no fixture is ever rooted at the real home), then the `ls` line — either `ls: /Users/…/.phe-backups: No such file or directory` or a pre-existing listing; either way the suite wrote its archives under its own tmp `--dest`.

- [ ] **Step 6: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/knowledge-migrate.js cli/knowledge-migrate.test.js && git commit -m "feat(cli): knowledge-migrate subcommand dispatcher with crash-resumable steps"
```

Expected: `2 files changed`.

---

## Task 7: Make the subcommand reachable — `cli/index.js`, hardening tests, `package.json`

The existing assertion at `cli/cli-hardening.test.js:255` matches `/kb-search|lean-index|Knowledge base tools/i`. `knowledge-migrate` does **not** trip it (no hyphen-free "Knowledge base tools", no `kb-search`, no `lean-index`), so that test needs **no** change — Step 1 proves it rather than assuming it. What actually needs changing is the *absence* of coverage: nothing asserts the new subcommand is reachable, and nothing stops a future `npx` line in `harness-init` from silently retargeting the `:275-305` test.

**Files:**
- Modify: `cli/index.js` (add a case beside `:36-45`; add a help line after `:61`)
- Modify: `cli/cli-hardening.test.js` (new test after `:265`; one assertion inside `:275-305`)
- Modify: `package.json` (`:18` `test:cli`, `:20` `test`)

**Interfaces:**
- Consumes: `main()` from `cli/knowledge-migrate.js` (Task 6).
- Produces: the `knowledge-migrate` subcommand, dispatched exactly like `emit` (`cli/index.js:18-25`).

- [ ] **Step 1: Prove the existing KB-surface assertion is unaffected**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node -e "console.log(/kb-search|lean-index|Knowledge base tools/i.test('npx perfect-harness-engineering knowledge-migrate  Detect, back up and verify a knowledge migration into knowledge-base/'))"
```

Expected: `false`. The help line below is therefore safe; `cli/cli-hardening.test.js:250-265` stays as written.

- [ ] **Step 2: Write the failing tests**

In `cli/cli-hardening.test.js`, insert this block immediately after the closing `});` of the `'cli/index.js has no KB engine surface (help text + lean-index gone)'` test (line 265) and before `const TEMPLATE = …` (line 267):

```js
test('cli/index.js dispatches knowledge-migrate and advertises it in --help', () => {
  const out = execFileSync('node', [path.join(__dirname, 'index.js'), '--help'], {
    encoding: 'utf-8',
  });
  assert.ok(
    /knowledge-migrate/.test(out),
    '--help must advertise the knowledge-migrate subcommand, got: ' + out
  );
  assert.ok(
    !/kb-search|lean-index|Knowledge base tools/i.test(out),
    'the knowledge-migrate help line must not resurrect the deleted KB-engine vocabulary, got: ' + out
  );
  // `status` is the read-only, always-safe invocation: it must reach the module
  // rather than falling through to the `Unknown command` default (exit 1).
  const dir = path.join(TMP, 'knowledge-migrate-dispatch');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  const status = execFileSync(
    'node',
    [path.join(__dirname, 'index.js'), 'knowledge-migrate', 'status'],
    { cwd: dir, encoding: 'utf-8' }
  );
  assert.ok(
    /no migration ledger/i.test(status),
    'knowledge-migrate status must report an absent ledger, got: ' + status
  );
});
```

Then, inside the existing test `'harness-init names an npx package + subcommand the CLI actually provides'`, immediately after the destructuring line `const [, pkg, subcommand] = m;` (`cli/cli-hardening.test.js:281`), add:

```js
  // The regex takes the FIRST `npx <pkg> <sub>` literal in the skill. A new npx
  // line inserted ABOVE step 4's gate would silently retarget this whole test at
  // a different subcommand and stop testing the gate that must never 404.
  assert.strictEqual(
    subcommand,
    'file-size-check',
    'the first `npx <pkg> <sub>` literal in harness-init must stay the step-4 file-size-check gate, found: ' + subcommand
  );
```

- [ ] **Step 3: Run them and see them fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js 2>&1 | grep -A2 "knowledge-migrate"
```

Expected:

```
  FAIL  cli/index.js dispatches knowledge-migrate and advertises it in --help
        --help must advertise the knowledge-migrate subcommand, got:
```

(The `file-size-check` assertion passes already — it pins today's behaviour so tomorrow's edit cannot break it silently.)

- [ ] **Step 4: Add the subcommand and the help line**

In `cli/index.js`, insert this case immediately after the `file-size-check` case's closing `}` (line 45) and before `case '--version':` (line 46):

```js
  case 'knowledge-migrate':
    // The deterministic half of /knowledge-migrate: detect, back up, keep the
    // ledger, verify links. The judgment half is the skill of the same name.
    try {
      require('./knowledge-migrate.js').main();
    } catch (err) {
      console.error('Error: ' + err.message);
      process.exit(1);
    }
    break;
```

In the help block, insert this line immediately after the `file-size-check` line (`cli/index.js:61`):

```
  npx perfect-harness-engineering knowledge-migrate Detect, back up and verify a knowledge migration into knowledge-base/ (run /knowledge-migrate to drive it)
```

- [ ] **Step 5: Wire the new suite into the npm scripts**

In `package.json`, append ` && node cli/knowledge-migrate.test.js` to the END of the `test:cli` value (`package.json:18`, currently ending `… && node cli/update-harness-config.test.js`) and insert `node cli/knowledge-migrate.test.js && ` into the `test` value (`package.json:20`) immediately before `node cli/skill-preview-guards.test.js`.

- [ ] **Step 6: Run them and see them pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js 2>&1 | tail -3
```

Expected:

```
  PASS  the real update sequence records targets AND preserves the user's existing harness.json config

20 passed, 0 failed
```

(The measured baseline on 2026-08-03 is 19; this adds one test. If your baseline differs, what matters is `0 failed`.)

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && npm test 2>&1 | tail -4
```

Expected: the hook smoke test's final `<SMOKE>` and exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/index.js cli/cli-hardening.test.js package.json && git commit -m "feat(cli): reachable knowledge-migrate subcommand + help line"
```

Expected: `3 files changed`.

---

## Task 8: `migrateVaultConfigToKnowledge` — the legacy key rename

`cli/migrations.js` already runs on every `init` and `update` (`cli/update.js:260`, `cli/init.js:467`), which makes it the right home for a one-time config rename. It renames `vault` → `knowledge`, is idempotent, and arms the pending marker exactly once.

**Files:**
- Modify: `cli/migrations.js` (`:1-2` requires, new function after `migrateRenamedSkills` at `:56`, `:58-61` exports)
- Modify: `cli/migrations.test.js` (insert before the closing tally at `:108`)

**Interfaces:**
- Consumes: `readLedger`, `writeLedger` (Task 1); `writeJsonAtomic` from `cli/harness-config.js:176`.
- Produces: `migrateVaultConfigToKnowledge(projectRoot) -> { migrated: boolean, armed: boolean, messages: string[] }`; THROWS on a `harness.json` it cannot parse.

- [ ] **Step 1: Write the failing test**

In `cli/migrations.test.js`, insert this block immediately before the final `console.log('');` (line 108):

```js
console.log('migrateVaultConfigToKnowledge:');

function harnessJson(proj) {
  return JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
}
function writeHarness(proj, obj) {
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.claude', 'harness.json'), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

// An existing vault becomes the SHARED store; the local KB name is fixed.
(function () {
  var proj = freshProj();
  writeHarness(proj, { stopGate: ['npm test'], vault: { mode: 'existing', path: '/v' } });
  var res = migrateVaultConfigToKnowledge(proj);
  var after = harnessJson(proj);
  assert('reports the migration', res.migrated === true);
  assert('legacy vault key is gone', after.vault === undefined);
  assert('local KB name is knowledge-base', after.knowledge.local === 'knowledge-base');
  assert('existing vault becomes the shared store',
    after.knowledge.shared.mode === 'existing' && after.knowledge.shared.path === '/v');
  assert('migratedAt starts null', after.knowledge.migratedAt === null);
  assert('other keys survive', JSON.stringify(after.stopGate) === '["npm test"]');
  assert('the pending marker is armed', readLedger(proj).status === 'pending');
  assert('arming reports itself', res.armed === true);
  assert('a nudge names /knowledge-migrate',
    res.messages.some(function (m) { return m.indexOf('/knowledge-migrate') !== -1; }));
  fs.rmSync(proj, { recursive: true, force: true });
})();

// A vault that was never created (scaffold) or refused (none) -> shared none.
(function () {
  var proj = freshProj();
  writeHarness(proj, { vault: { mode: 'scaffold', path: null } });
  migrateVaultConfigToKnowledge(proj);
  var after = harnessJson(proj);
  assert('scaffold vault -> shared none',
    after.knowledge.shared.mode === 'none' && after.knowledge.shared.path === null);
  fs.rmSync(proj, { recursive: true, force: true });
})();

// Idempotent: a second run changes nothing and does not re-arm.
(function () {
  var proj = freshProj();
  writeHarness(proj, { vault: { mode: 'existing', path: '/v' } });
  migrateVaultConfigToKnowledge(proj);
  writeLedger(proj, { status: 'in-progress', steps: { '3': 'done' } });
  var res2 = migrateVaultConfigToKnowledge(proj);
  assert('second run migrates nothing', res2.migrated === false && res2.armed === false);
  assert('second run does not reset an in-flight ledger', readLedger(proj).status === 'in-progress');
  assert('second run emits no messages', res2.messages.length === 0);
  fs.rmSync(proj, { recursive: true, force: true });
})();

// Both keys present (a half-applied earlier run): the legacy key is dropped,
// the knowledge key is left exactly as the user has it.
(function () {
  var proj = freshProj();
  writeHarness(proj, {
    vault: { mode: 'existing', path: '/old' },
    knowledge: { local: 'knowledge-base', shared: { mode: 'existing', path: '/new' }, migratedAt: '2026-08-01T00:00:00Z' },
  });
  var res = migrateVaultConfigToKnowledge(proj);
  var after = harnessJson(proj);
  assert('stale vault key is dropped', after.vault === undefined);
  assert('existing knowledge config is NOT overwritten', after.knowledge.shared.path === '/new');
  assert('an already-migrated project does not re-arm', res.armed === false);
  fs.rmSync(proj, { recursive: true, force: true });
})();

// No vault key at all (pre-vault install) -> silent no-op, nothing armed.
(function () {
  var proj = freshProj();
  writeHarness(proj, { stopGate: [] });
  var res = migrateVaultConfigToKnowledge(proj);
  assert('no vault key: nothing migrated, nothing armed', res.migrated === false && res.armed === false);
  assert('no vault key: no knowledge key invented', harnessJson(proj).knowledge === undefined);
  assert('no vault key: no ledger created', readLedger(proj) === null);
  fs.rmSync(proj, { recursive: true, force: true });
})();

// No harness.json at all -> no-op (init installs it later).
(function () {
  var proj = freshProj();
  var res = migrateVaultConfigToKnowledge(proj);
  assert('absent harness.json: no-op', res.migrated === false && res.armed === false);
  fs.rmSync(proj, { recursive: true, force: true });
})();

// Malformed harness.json -> REFUSE, change nothing.
(function () {
  var proj = freshProj();
  writeHarness(proj, '{ oops not json');
  var threw = false;
  try { migrateVaultConfigToKnowledge(proj); } catch (e) { threw = true; }
  assert('malformed harness.json throws', threw);
  assert('malformed harness.json is left untouched',
    fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8') === '{ oops not json');
  fs.rmSync(proj, { recursive: true, force: true });
})();
```

Change the require line at `cli/migrations.test.js:12` to:

```js
const { migrateRenamedSkills, migrateVaultConfigToKnowledge, RENAMED_SKILLS } = require('./migrations');
const { readLedger, writeLedger } = require('./knowledge-migrate');
```

- [ ] **Step 2: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/migrations.test.js 2>&1 | tail -5
```

Expected: `TypeError: migrateVaultConfigToKnowledge is not a function` and a non-zero exit.

- [ ] **Step 3: Implement the rename**

In `cli/migrations.js`, replace the two require lines at `:1-2` with:

```js
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./harness-config');
const { readLedger, writeLedger } = require('./knowledge-migrate');
```

Insert this function immediately after `migrateRenamedSkills` ends (after line 56) and before `module.exports`:

```js
// harness.json `vault` -> `knowledge` (2.1.0). The vault stops being THE store
// and becomes the SHARED store beside a project-local knowledge-base/; the key
// rename is what makes that visible in config instead of only in prose.
//
// Idempotent by construction: the legacy key is the trigger, so a second run has
// nothing to trigger on. Arming is separately guarded — a ledger that already
// exists belongs to a run in flight (or a finished one) and must NEVER be reset
// to `pending`, or a crash-resume would restart a migration that was half done.
function migrateVaultConfigToKnowledge(projectRoot) {
  var result = { migrated: false, armed: false, messages: [] };
  var p = path.join(projectRoot, '.claude', 'harness.json');
  if (!fs.existsSync(p)) return result;

  var current;
  try {
    current = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.');
  }
  if (current === null || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
  }
  if (!Object.prototype.hasOwnProperty.call(current, 'vault')) return result;

  var hasKnowledge = current.knowledge && typeof current.knowledge === 'object' && !Array.isArray(current.knowledge);
  if (!hasKnowledge) {
    var v = current.vault && typeof current.vault === 'object' ? current.vault : {};
    var usable = v.mode === 'existing' && typeof v.path === 'string' && v.path;
    current.knowledge = {
      local: 'knowledge-base',
      shared: usable ? { mode: 'existing', path: v.path } : { mode: 'none', path: null },
      migratedAt: null,
    };
    result.migrated = true;
    result.messages.push('harness.json: `vault` -> `knowledge` (local knowledge-base/, shared ' +
      (usable ? v.path : 'none') + ').');
  } else {
    result.messages.push('harness.json: dropped the stale `vault` key (`knowledge` was already configured).');
  }
  delete current.vault;
  writeJsonAtomic(p, current);

  if (result.migrated && readLedger(projectRoot) === null) {
    writeLedger(projectRoot, { status: 'pending', steps: {}, backups: [], manifest: [] });
    result.armed = true;
    result.messages.push('Knowledge migration ARMED (.claude/state/knowledge-migration.json = pending). ' +
      'Run /knowledge-migrate to reconcile your existing knowledge into knowledge-base/ — nothing has been moved yet.');
  }

  return result;
}
```

Extend `module.exports` (`cli/migrations.js:58-61`) with `migrateVaultConfigToKnowledge: migrateVaultConfigToKnowledge,`.

- [ ] **Step 4: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/migrations.test.js 2>&1 | tail -3
```

Expected:

```
  PASS: malformed harness.json is left untouched

38 passed, 0 failed
```

(16 pre-existing asserts — the measured baseline — plus the 22 added here.)

- [ ] **Step 5: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/migrations.js cli/migrations.test.js && git commit -m "feat(cli): rename the legacy vault key to knowledge and arm the pending marker"
```

Expected: `2 files changed`.

---

## Task 9: Wire the rename into `update`

`cli/update.js:249-254` merges `harness.json` (creating it when absent), so the rename MUST run after it — otherwise a project without a `harness.json` gets a silent no-op and never migrates.

**Files:**
- Modify: `cli/update.js` (`:13` require, insert after `:263`)
- Modify: `cli/cli-hardening.test.js` (new test after the init.js order test at `:429`)

**Interfaces:**
- Consumes: `migrateVaultConfigToKnowledge(projectRoot)` (Task 8).
- Produces: the update-time nudge on stdout; nothing exported.

- [ ] **Step 1: Write the failing test**

In `cli/cli-hardening.test.js`, insert immediately after the closing `});` of `'init.js records harness targets immediately after the .claude/ copy, before anything else can throw'` (line 429):

```js
test('update.js runs the knowledge-config rename AFTER harness.json is installed', () => {
  const src = fs.readFileSync(path.join(__dirname, 'update.js'), 'utf-8');
  const installIdx = src.indexOf('installHarnessConfig(');
  const kbIdx = src.indexOf('migrateVaultConfigToKnowledge(projectRoot)');
  const emitIdx = src.indexOf('emitCodexPayload(projectRoot)');
  assert.ok(installIdx !== -1, 'the installHarnessConfig call was not found');
  assert.ok(
    kbIdx !== -1,
    'update.js must call migrateVaultConfigToKnowledge(projectRoot) — without it the legacy `vault` key never becomes `knowledge`'
  );
  assert.ok(emitIdx !== -1, 'the Codex emit call was not found');
  // installHarnessConfig CREATES harness.json when a project has none. Renaming
  // before it would be a silent no-op on exactly the projects that need it.
  assert.ok(
    installIdx < kbIdx && kbIdx < emitIdx,
    'order must be installHarnessConfig < migrateVaultConfigToKnowledge < emitCodexPayload — found ' +
      installIdx + ', ' + kbIdx + ', ' + emitIdx
  );
  const callCount = src.split('migrateVaultConfigToKnowledge(projectRoot)').length - 1;
  assert.strictEqual(callCount, 1, 'migrateVaultConfigToKnowledge must be called exactly once, found ' + callCount);
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js 2>&1 | grep -A2 "knowledge-config rename"
```

Expected:

```
  FAIL  update.js runs the knowledge-config rename AFTER harness.json is installed
        update.js must call migrateVaultConfigToKnowledge(projectRoot) — without it the legacy `vault` key never becomes `knowledge`
```

- [ ] **Step 3: Wire it**

In `cli/update.js`, change line 13 to:

```js
const { migrateRenamedSkills, migrateVaultConfigToKnowledge } = require('./migrations');
```

Insert this block immediately after the `migrateRenamedSkills` message loop ends (after line 263, the `}` closing the `for (var mi = …)` loop) and before the `writeHarnessTargets` comment at line 265:

```js
    // Knowledge moved into the repo (design 2026-08-03): the legacy `vault` key
    // becomes `knowledge` (local knowledge-base/ + the vault demoted to SHARED),
    // and a pending marker tells /harness-init to route to /knowledge-migrate.
    // Runs AFTER installHarnessConfig above — that call CREATES harness.json for
    // a project that has none, and renaming a key in a file that does not exist
    // yet is a silent no-op on exactly the projects that need the rename.
    // NOTHING is moved here; the marker only arms the skill.
    var kbMigration = migrateVaultConfigToKnowledge(projectRoot);
    for (var kbI = 0; kbI < kbMigration.messages.length; kbI++) {
      console.log(kbMigration.messages[kbI]);
    }
```

- [ ] **Step 4: Run it and see it pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/cli-hardening.test.js 2>&1 | tail -3
```

Expected:

```
  PASS  the real update sequence records targets AND preserves the user's existing harness.json config

21 passed, 0 failed
```

- [ ] **Step 5: Prove `update.js` still loads with no side effects**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node -e "require('./cli/update.js');" && echo "clean require"
```

Expected: `clean require` with no other output (this is what `cli/cli-hardening.test.js:208-222` asserts).

- [ ] **Step 6: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add cli/update.js cli/cli-hardening.test.js && git commit -m "feat(cli): update arms the knowledge migration and prints the nudge"
```

Expected: `2 files changed`.

---

## Task 10: The `/knowledge-migrate` skill — the judgment half

The eleven steps do not fit in 100 body lines, so this ships as the phase-table router `template/.claude/references/harness-maintenance.md:106` prescribes: header + Refusals + Ledger contract + a Phases table with per-phase load conditions from section 7 of that file, with the procedure relocated (not deleted) into three load-on-cite references.

**Files:**
- Create: `template/.claude/skills/knowledge-migrate/SKILL.md`
- Create: `template/.claude/references/knowledge-migrate/01-detect-and-decide.md`
- Create: `template/.claude/references/knowledge-migrate/02-reconcile.md`
- Create: `template/.claude/references/knowledge-migrate/03-links-cleanup-report.md`

**Interfaces:**
- Consumes: the subcommands `status | detect | decide | backup | verify-links | record` (Task 6); the ledger at `.claude/state/knowledge-migration.json` (Task 1).
- Produces: `reports/knowledge-reconciliation.md`; a populated `knowledge-base/`; `knowledge.migratedAt` stamped in `harness.json`.

- [ ] **Step 0: See it red — the payload does not exist yet**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && ls template/.claude/references/knowledge-migrate/ 2>&1
```

Expected: `ls: template/.claude/references/knowledge-migrate/: No such file or directory`. This is the red this task turns green; Step 6's OK/MISSING cross-reference loop is the proof, and a loop that was never seen failing proves nothing.

- [ ] **Step 1: Write the router**

Create `template/.claude/skills/knowledge-migrate/SKILL.md`:

```markdown
---
name: knowledge-migrate
description: "Reconcile existing knowledge — the shared store's project folder plus legacy repo folders — into knowledge-base/: classify, merge, rewrite links, report."
disable-model-invocation: true
argument-hint: "[--dry-run]"
---

# /knowledge-migrate — move knowledge INTO the repo, once

The CLI half (`npx perfect-harness-engineering knowledge-migrate <step>`) is deterministic: detect,
leak-scan, back up, keep the ledger, verify links. THIS half is the judgment: what counts as
knowledge, what merges cleanly, what genuinely contradicts, what a broken link meant. Run once per
project; the ledger makes a re-run resumable, never duplicative.

Two stores, one boundary rule: project-scoped facts live in `knowledge-base/`, generalized facts stay
in the shared store, and promotion MOVES. No fact ever exists in both.

## Refuse first — three hard stops, checked before step 0

| Condition | Do |
|---|---|
| Autonomous mode active (`.claude/references/autonomous-mode.md`) | REFUSE. Steps 2 and 2b are human-only. Log the blocker, stop. |
| Step 0 reports `unresolved` leaks (a `needsDecision` hit with no ledger resolution) | REFUSE. Nothing rewritten, nothing moved. List the hits, take one `decide` per marker from the human, re-run. |
| Backup failed or was skipped while candidates exist | REFUSE. Change nothing. |

Also: unparseable `.claude/harness.json` → refuse, surfacing the CLI's message verbatim. No shared
store → skip every shared step and SAY SO (`no shared store configured — skipping <step>`), the same
loud degradation the vault steps have always used.

## Ledger — the resume contract

`.claude/state/knowledge-migration.json`. Start every run with
`npx perfect-harness-engineering knowledge-migrate status`.

- BEFORE any step: read it. Read-only steps (0, 1) re-run on a resume; destructive ones (3) are
  skipped once recorded done.
- AFTER every step: `npx perfect-harness-engineering knowledge-migrate record <n> done`
  (`failed` when you stop; `--from <src> --to <dest>` on every move, which is what fills the
  manifest). The CLI records its own steps (0, 1, 3, 6b); you record yours (2, 2b, 4, 5, 6, 7, 8, 9).
- A step-0 leak the human has ruled on: `knowledge-migrate decide <marker> <genericize|redact|accept>`,
  one call per marker. The gate re-runs over the PLANNED COPY with those decisions applied — the
  source is never rewritten to clear it.
- The backup paths, the move manifest and the leak decisions live here too — they are what a rollback
  and a resume read.

## Phases — load a reference only when its condition holds

| # | Phase | Steps | Reference | Load condition |
|---|---|---|---|---|
| A | Detect & decide | 0 · 1 · 2 · 2b | `.claude/references/knowledge-migrate/01-detect-and-decide.md` | always |
| B | Back up & reconcile | 3 · 4 · 5 | `.claude/references/knowledge-migrate/02-reconcile.md` | ledger step 2b recorded done |
| C | Links, cleanup, report | 6 · 6b · 7 · 8 · 9 | `.claude/references/knowledge-migrate/03-links-cleanup-report.md` | ledger step 5 recorded done |

Never load all three at once — each phase's decisions are made before the next one is readable.

`--dry-run`: run phase A, then write the phase-B step-4 plan into
`reports/knowledge-reconciliation.md` and STOP. Nothing is backed up, moved or rewritten.

## The three scenarios are one pipeline

- **Clean project** — steps 0/1 find nothing, 2/2b have nothing to ask, no backup is taken (nothing
  is at risk); the run collapses to "the scaffold is already there, close the ledger".
- **Shared knowledge only** — the shared project folder is the whole import set.
- **Out-and-back** — shared folder plus detected local folders; step 5 is where the real work is.

## Output contract

Per `.claude/references/output-contract.md`. Everything reviewable — decisions, backup paths,
unresolved links, conflicts — is WRITTEN to `reports/knowledge-reconciliation.md`, never narrated.
Interactive surfaces: exactly the two `AskUserQuestion` rounds in phase A (steps 2 and 2b) plus any
genuine step-5 contradiction.

One final line:

`Migrated knowledge into knowledge-base/ · Next: /validate` — append ` · Report: reports/knowledge-reconciliation.md`.
A blocker REPLACES this line.
```

- [ ] **Step 2: Check the body budget**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && awk 'NR>6' template/.claude/skills/knowledge-migrate/SKILL.md | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' | wc -l
```

Expected: a number `<= 100`. This is the ledger's own body definition (everything after the closing `---` on line 6 — this file has four frontmatter keys — trailing blanks stripped — `tools/context-ledger.mjs:83-86`); over 100 it warns, over 120 it hard-fails. Over budget → move a section into a phase reference, never trim it lossily.

- [ ] **Step 3: Write phase A's reference**

Create `template/.claude/references/knowledge-migrate/01-detect-and-decide.md`:

```markdown
# Phase A — detect and decide (steps 0, 1, 2, 2b)

Load when `/knowledge-migrate` starts. Nothing in this phase writes to a knowledge file.

## Step 0 · LEAK GATE (read-only)

`npx perfect-harness-engineering knowledge-migrate detect` runs the gate and the inventory together.
(`detect --dry-run` returns the identical inspection but writes NOTHING — not even the ledger, and
not even on the blocking path — which is what the skill's `--dry-run` mode and step 4's plan are
built from.) It classifies every hit in the import set:

| Class | What it is | What happens |
|---|---|---|
| `autoGenericizable` | an absolute home path (`/Users/<someone>/...`) | rewritten at step 5, on the COPY. Not a blocker |
| `needsDecision` | another project's or person's name | needs ONE recorded resolution each |
| `unresolved` | a `needsDecision` hit with no resolution in the ledger | BLOCKS |

**The gate judges the PLANNED COPY, never the source** — the import set as step 5 will write it, with
genericization and every recorded decision applied. That copy is the only text that can leak into a
tracked, possibly public repo. **The shared store is never rewritten to satisfy the gate**: it is
byte-identical through step 0, and a source that stays "leaky" is not a blocker once the copy is
clean (it is archived or left behind at step 7 anyway).

**Nothing is rewritten here either.** The gate reads and recomputes in memory. Rewriting happens at
step 5, on the copy, after the backup — so a wrong call is always recoverable.

`unresolved` non-empty → STOP. Write the hits (file, line, match) into
`reports/knowledge-reconciliation.md` and record `record 0 failed`. Then resolve each marker WITH THE
HUMAN — one call per marker,
`npx perfect-harness-engineering knowledge-migrate decide <marker> <genericize|redact|accept>`:

| Resolution | The planned copy |
|---|---|
| `genericize` | names it generically; step 5 writes the real prose, and may not write the marker back |
| `redact` | drops it entirely |
| `accept` | keeps it verbatim — the human has said this name MAY be published |

Never pick for them: whether a name may be published in a tracked, possibly public repo is not a
decision this skill gets to make. Re-run `detect` afterwards; with every marker decided `unresolved`
is empty, the gate clears, and the CLI records steps 0 and 1 itself.

Empty from the start → the CLI records steps 0 and 1 itself.

## Step 1 · DETECT (read-only)

The same command returns:

- `shared` — the shared store's project folder and its markdown count, or `null` (say so, skip the
  shared steps).
- `local[]` — every root directory holding markdown, each with `mdCount`, `tracked`, and a `verdict`:
  `likely` (a curated name: `docs/ wiki/ knowledge/ notes/ ai_docs/ context/ PRPs/ specs/ .ai/
  memory-bank/ adr/ decisions/`), `maybe` (3+ markdown files), `unlikely` (1–2).

The verdict is a hint, not a decision. `plans/`, `reports/`, `backlog/`, `sprints/` and
`knowledge-base/` are never candidates — they are work artifacts or the target itself.

Read enough of each candidate to describe it in one line (what it holds, roughly how old). An
`unlikely` folder that is actually the project's ADR archive is exactly the case the human is here
for.

## Step 2 · CONFIRM — one AskUserQuestion round

Present the shared store and every candidate with its verdict, md count, tracked flag and your
one-line description. The human picks. **Nothing is auto-moved** — not even a `likely` verdict.

`record 2 done` after the answer.

## Step 2b · DISPOSITION — one AskUserQuestion round, BEFORE anything destructive

Ask once, for the whole run:

| Option | Meaning |
|---|---|
| move | sources are deleted after a verified copy |
| copy | sources stay where they are (two copies exist — say so plainly) |
| archive+move | sources are moved into `archive/` in the shared store first, then removed from the repo |

`archive+move` also means phase C creates `archive/` with its `_index.md` stub if it is absent.

`record 2b done` after the answer. Phase B is unreadable until this is recorded.

## Autonomous mode

Both questions are human-only. If autonomous mode is active
(`.claude/references/autonomous-mode.md`), REFUSE at step 0: log the blocker, record nothing, stop.
```

- [ ] **Step 4: Write phase B's reference**

Create `template/.claude/references/knowledge-migrate/02-reconcile.md`:

````markdown
# Phase B — back up and reconcile (steps 3, 4, 5)

Load when the ledger records step 2b `done`.

## Step 3 · BACKUP (mandatory, before the first byte)

```
npx perfect-harness-engineering knowledge-migrate backup \
  --candidate <dir> [--candidate <dir> ...]
```

Covers the shared store AND every confirmed local candidate — those are often gitignored, so git is
NOT a fallback. Archives land in `~/.phe-backups/`; the CLI REFUSES a destination inside the repo or
inside the shared store, and refuses an archive that verifies empty.

Backup fails → REFUSE the whole migration and change nothing. Backup skipped because nothing was
confirmed (clean project) → the CLI records step 3 anyway and says nothing was at risk.

The archive paths are in the ledger's `backups`. Copy them into the report: they are the rollback.

## Step 4 · DRY-RUN PLAN

Write the complete plan into `reports/knowledge-reconciliation.md` BEFORE applying anything:

- every move: `from` → `to` (both repo- or store-relative)
- every shared-store edit phase C will make
- every merge that will need a human answer
- the backup paths from step 3

`record 4 done`. On `--dry-run`, STOP here.

## Step 5 · RECONCILE

Target shape: `knowledge-base/` with `_index.md`, `architecture.md`, `decisions.md`, `resources.md`,
`runbook.md`, `inbox/`, `research/`.

| Incoming content | Destination |
|---|---|
| module map, boundaries, data flow | `architecture.md` |
| an ADR or a recorded decision | `decisions.md` (keep its original date) |
| how to drive the app, failure classes | `runbook.md` |
| credential INDEX (pointers only), links | `resources.md` |
| raw capture, undigested notes | `inbox/` |
| project research, the CITED briefs only | `research/` |
| generalizes beyond this project | LEAVE it in the shared store — do not import |

Merge rules:

1. **Non-overlapping content merges silently.** Append under the right heading; never rewrite a file
   from scratch.
2. **Ask ONLY on genuine contradictions** — two sources asserting different facts about the same
   thing. Present both verbatim with their paths and let the human pick.
3. **An unresolvable conflict preserves BOTH** (the second under a `<!-- conflicting import: <path> -->`
   heading) and is reported. Never silently drop one.
4. **Any imported claim with a command behind it is RE-DERIVED by running the command** — never
   merged from prose. Imported corpora are routinely self-inconsistent about counts, versions and
   paths. Run the command, record the real number, cite the command.
5. **Apply step 0's genericization to the IMPORTED COPY only.** Source files are never rewritten by
   this skill. `/Users/<someone>/...` becomes `~/...` or a repo-relative path.
6. **Index Law**: every folder you create or change gets its `_index.md` created/updated in the same
   change.
7. Obsidian conventions are kept: frontmatter, `[[wikilinks]]`, `_index.md` per folder. Do NOT create
   `.obsidian/` — it is gitignored and the operator makes it on first open.

8. **Step 2b's disposition is APPLIED here, not just recorded.** The CLI has no subcommand that
   moves a file; this step is the one that acts on the answer. `move` — copy into `knowledge-base/`,
   verify byte-for-byte, then delete each source file explicitly and `rmdir` the empty dirs (never
   `rm -rf`). `copy` — leave every source exactly where it is and say plainly in the report that two
   copies now exist. `archive+move` — first move the sources into `archive/` in the shared store
   (creating it with its `_index.md` stub if absent), then remove them from the repo. Whichever it
   was, record every move as `from` → `to`; that list is the manifest and the report's move table.

Record every decision (kept / merged / conflicted / left shared) with its source path — the report
is written from this list. `record 5 done`.
````

- [ ] **Step 5: Write phase C's reference**

Create `template/.claude/references/knowledge-migrate/03-links-cleanup-report.md`:

````markdown
# Phase C — links, cleanup, ledger, report (steps 6, 6b, 7, 8, 9)

Load when the ledger records step 5 `done`.

## Step 6 · REWRITE LINKS

Every `[[wikilink]]` in the imported copy is rewritten KB-relative. Resolution order, no exceptions:

1. **exact path** — the target matches a file's path relative to the import root (with or without
   `.md`).
2. **basename** — exactly ONE file in the import set has that basename.
3. **REPORT** — zero matches, or two or more. **Never guess.** The link stays as it is and goes into
   the report's unresolved table.

Skip: fenced regions (```` ``` ```` and `~~~`) and HTML comments — a link inside them is
documentation ABOUT links, and rewriting it turns an example into a lie. Honour the escaped pipe:
inside a table cell Obsidian requires `[[target\|alias]]`, and the alias is never part of the path.
A `#heading` anchor is not part of the path either.

`npx perfect-harness-engineering knowledge-migrate record 6 done --from <src> --to <dest>` — one call
per move, so the ledger's `manifest` holds what moved from where. A `record 6 done` with no
`--from`/`--to` records the step and leaves the manifest empty, which makes the rollback guesswork.

## Step 6b · VERIFY LINKS

```
npx perfect-harness-engineering knowledge-migrate verify-links
```

Re-runs the resolver over `knowledge-base/` and compares it with the pre-migration snapshot the CLI
stored at step 1. **Any link that resolved BEFORE and does not resolve now FAILS the migration.** A
link that was already broken before is not this run's fault — it belongs in the report, not in the
failure.

Regressions → fix the rewrite and re-run. Do not record step 6b done to move past it.

## Step 7 · SHARED-STORE CLEANUP

Only what the migration actually invalidated, per project:

| Location | Change |
|---|---|
| the store's root `CLAUDE.md` | the doctrine line claiming the store is the sole home of project knowledge |
| `projects/_index.md` | this project's registry row marked `migrated` — **marked, never deleted**; plus any Contents lines pointing into the moved folder |
| `system/pointer-block.md` | the pointer template, if it names this project |
| `agent-kb/patterns/` inbound links | repoint at the repo path |
| `inbox/research/` inbound links | repoint at the repo path |

`archive/` is created with its `_index.md` stub if step 2b's disposition needs it. Index Law applies
to every folder touched. Deletions are explicit file removals — never `rm -rf` (the guard denies it).

No shared store → skip this step and say so. `record 7 done`.

## Step 8 · CLOSE THE LEDGER

```
npx perfect-harness-engineering knowledge-migrate record 8 done --status done
```

Then stamp `.claude/harness.json` → `knowledge.migratedAt` with today's ISO-8601 timestamp
— `node -e 'require("<repo>/cli/knowledge-config.js").stampMigratedAt(process.cwd(), new Date().toISOString())'`,
the one writer of that field (`writeKnowledgeConfig` deliberately preserves it and cannot set it).
That pair is what tells `/harness-init` the routing line is spent.

## Step 9 · REPORT

`reports/knowledge-reconciliation.md`, containing:

- the disposition chosen and every candidate accepted or rejected, with the reason
- every move as `from` → `to`
- **the backup archive paths** (the rollback)
- every merge decision, and every conflict with both sides preserved
- every unresolved link: file, line, link text, why (`not-found` / `ambiguous`)
- every claim re-derived by running a command, with the command and its real output
- what was left in the shared store, and why

`record 9 done`. Then the skill's one output line.
````

- [ ] **Step 6: Verify the payload budgets and cross-references**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && wc -l template/.claude/references/knowledge-migrate/*.md && node tools/context-ledger.mjs template | tail -4
```

Expected: three counts each `<= 160`, then:

```
TOTAL                                                                <LEDGER>

Status: WARN — <LEDGER> / 2000 est. tokens (83%)
```

(Unchanged: references are not always-loaded, and the new skill is `disable-model-invocation: true`.)

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && for f in $(grep -o 'knowledge-migrate/[0-9-a-z]*\.md' template/.claude/skills/knowledge-migrate/SKILL.md); do test -f "template/.claude/references/$f" && echo "OK $f" || echo "MISSING $f"; done
```

Expected: three `OK …` lines, no `MISSING`.

- [ ] **Step 7: Prove the payload tests still pass**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node cli/skill-preview-guards.test.js | tail -2 && node cli/emit-codex.test.js | tail -2
```

Expected: `… passed, 0 failed` from both (the new skill adds no `` !`…` `` preview line, and its `disable-model-invocation: true` frontmatter is what `cli/emit-codex.test.js:604-636` expects).

- [ ] **Step 8: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add template/.claude/skills/knowledge-migrate template/.claude/references/knowledge-migrate && git commit -m "feat(skills): /knowledge-migrate router + three phase references"
```

Expected: `4 files changed`.

---

## Task 11: `/harness-init` routing line and the full gate

**Files:**
- Modify: `template/.claude/skills/harness-init/SKILL.md` (insert after `:68`)

**Interfaces:**
- Consumes: the pending marker armed by Task 8/9.
- Produces: nothing exported — one routing line.

- [ ] **Step 1: Record the current body length**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && awk 'NR>5' template/.claude/skills/harness-init/SKILL.md | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' | wc -l
```

Expected: `98`. One line takes it to 99, still inside the 100-line soft cap.

- [ ] **Step 2: Add the routing line**

In `template/.claude/skills/harness-init/SKILL.md`, insert this as a new bullet immediately after the **Knowledge** bullet that ends `Index Law already holds in both scaffolds.` (increment 1 rewrote the old Vault bullet in place; the line number is unchanged at `:68`) and before the `context7 (from question 6):` bullet:

```markdown
- Knowledge: `.claude/state/knowledge-migration.json` with `"status": "pending"` (armed by `update`) → STOP after this section and tell the user to run `/knowledge-migrate` before any pipeline work; it reconciles existing knowledge into `knowledge-base/` and nothing has moved yet. Absent, or `done` → nothing to do.
```

- [ ] **Step 3: Verify the budget and the pinned literals**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && awk 'NR>5' template/.claude/skills/harness-init/SKILL.md | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' | wc -l && node tools/context-ledger.mjs template | grep -c "harness-init"
```

Expected: `99`, then `0` (no budget warning naming harness-init).

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && grep -n 'npx ' template/.claude/skills/harness-init/SKILL.md | head -3
```

Expected: the first backticked `npx <pkg> <sub>` literal is still `` `npx perfect-harness-engineering file-size-check` `` on the step-4 verification row — the routing line names `/knowledge-migrate` (the skill), never an `npx` command, so `cli/cli-hardening.test.js:275-305` keeps testing the gate it was written for.

- [ ] **Step 4: Run the whole gate**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && npm test 2>&1 | grep -E "passed, [0-9]+ failed|FAIL" | tail -15
```

Expected: every suite reports `… passed, 0 failed`, no `FAIL` lines, exit 0. Specifically `cli/knowledge-migrate.test.js` → `105 passed, 0 failed`, `cli/migrations.test.js` → `38 passed, 0 failed`, `cli/cli-hardening.test.js` → `21 passed, 0 failed`, and the hook smoke test → `<SMOKE>`.

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node tools/context-ledger.mjs template | tail -3
```

Expected:

```
Status: WARN — <LEDGER> / 2000 est. tokens (83%)
```

Unchanged from the baseline: no line was added to `AGENTS.md` or `00-core.md`.

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git status --porcelain template/ && git ls-files --others --exclude-standard template/
```

Expected: both print nothing — `cli/cli-hardening.test.js:363-369` fails on any untracked file under `template/`.

- [ ] **Step 5: Commit**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && git add template/.claude/skills/harness-init/SKILL.md && git commit -m "feat(skills): harness-init routes to /knowledge-migrate while the marker is pending"
```

Expected: `1 file changed, 1 insertion(+)`.

---

## End-to-end verification

1. **Full gate:** `npm test` → exit 0, every suite `0 failed`.
2. **Budgets:** `node tools/context-ledger.mjs template` → `<LEDGER> / 2000`, no `!!HARD`, no new `!soft`.
3. **Fixture-vault dry run (already inside the suite, re-runnable in isolation):**
   `node cli/knowledge-migrate.test.js` → `105 passed, 0 failed`. Every fixture lives under
   `fs.realpathSync(os.tmpdir())`; prove it with
   `grep -n "os.homedir()\|process.env.HOME" cli/knowledge-migrate.test.js | wc -l; ls ~/.phe-backups 2>&1 | head -1`
   → `0` (no fixture is ever rooted at the real home), then the `ls` line.
4. **Subcommand reachable:** in an empty scratch dir,
   `mkdir -p /tmp/kmdemo/.claude && cd /tmp/kmdemo && node <repo>/cli/index.js knowledge-migrate status`
   → prints `"message": "no migration ledger at .claude/state/knowledge-migration.json — nothing armed, nothing in flight."` and exits 0.
5. **Rename + arm, end to end:**
   ```bash
   D=$(mktemp -d); mkdir -p "$D/.claude"; echo '{"stopGate":["npm test"],"vault":{"mode":"existing","path":"/v"}}' > "$D/.claude/harness.json"
   node -e "console.log(require('/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/cli/migrations.js').migrateVaultConfigToKnowledge(process.argv[1]).messages.join('\n'))" "$D"
   cat "$D/.claude/harness.json"; cat "$D/.claude/state/knowledge-migration.json"
   ```
   Expected: two messages (the rename, then the ARMED nudge naming `/knowledge-migrate`); `harness.json`
   has `knowledge` and no `vault`; the ledger reads `"status": "pending"`.
6. **Autonomous refusal is stated where it is enforced:**
   `grep -n "Autonomous" template/.claude/skills/knowledge-migrate/SKILL.md template/.claude/references/knowledge-migrate/01-detect-and-decide.md`
   → a REFUSE row in the skill and the matching paragraph in phase A.

---

## Risks & assumptions

- **Increment 1 must be merged first.** `cli/knowledge-config.js` is required lazily and only on the
  production path (`sharedPathFromConfig`); the whole test suite passes `--shared` explicitly, so the
  suite is green either way — which is exactly why Task 1 Step 2 is a hard preflight rather than a
  test.
- **`tar` and `git` are shelled out.** Both are assumed present (the repo already shells out to both:
  `cli/update.js:203` for `tar`, `cli/cli-hardening.test.js:364` for `git`). A missing `git` degrades `tracked` to
  `false`, which is the safe answer; a missing `tar` fails the backup loudly, which is the correct
  outcome for a mandatory backup.
- **The link `key` is `<basename>#<index>`.** It survives a move (the file keeps its name) and a
  rewrite (the link text changes). It does NOT survive a rename of the file itself during step 5 —
  such a rename shows up as a step-6b regression, which is a deliberate choice: renaming a file
  mid-migration is exactly the kind of change that should be re-confirmed rather than assumed safe.
  It is also not collision-safe across same-named files: a KB with `_index.md` at three depths
  produces duplicate keys, which can mask a regression. Documented, not fixed — making the key
  path-relative would make every legitimate move look like a regression.
- **`linksBefore` and `leakDecisions` are additive ledger keys.** The spec's four keys are all
  present and unchanged. Step 6b is impossible without a stored snapshot; and the step-0 gate judges
  the PLANNED COPY (spec table, step 0), which it cannot reconstruct without the resolutions the
  human already recorded — so the decisions have to be persisted somewhere a resume can read them.
- **Step 7's five doctrine locations are named, not line-numbered.** The spec cites line numbers in a
  private vault that this repo cannot read or test against; encoding them would rot on the first vault
  edit. The reference names the files and what to change in each.
