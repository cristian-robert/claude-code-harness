---
ticket: ad-hoc (PO directive 2026-08-29 — dynamic capabilities)
created: 2026-08-29
complexity: L
confidence: 8/10
tier: deep
---

# Dynamic Capabilities — Increment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx perfect-harness-engineering init` detects what the harness needs, asks one approval question, and installs the superpowers plugin at project scope — recording accepts/declines in `harness.json` and never assuming a plugin is present again.

**Architecture:** One template-owned manifest (`template/.claude/capabilities.json`) declares every external capability with a tier and a traceable `why`. One CLI module (`cli/capabilities.js`) reads machine state via the `claude` CLI (fail-open when absent), computes a pure plan into buckets, and applies approved installs. `init.js` calls it for tier `required` only, TTY only. A two-assertion ratchet test stops undeclared references and matrix/detector drift. The pipeline's terminal superpowers call gets its missing inline fallback so declining is safe.

**Tech Stack:** Node ≥18, CommonJS `var`-style in `cli/` (matches surrounding code), zero npm dependencies. Tests are plain Node scripts with the repo's hand-rolled assert-counter pattern (see `cli/harness-targets.test.js`).

**Spec:** `docs/design/2026-08-29-dynamic-capabilities.md` (revised after adversarial review — see `reports/2026-08-29-adversarial-workflow-review.md` for dispositions).

**Knowledge to load first:** the spec above; `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` ADR-006 (fail-open), ADR-007 (no shell checks), ADR-008 (superpowers wiring + fallbacks), ADR-011 (name audits).

## Global Constraints

- **Node ≥18, CommonJS, `var`-style, zero npm dependencies — ever** (matches every `cli/*.js`).
- **Fail-open (ADR-006):** no capability failure may abort `init` or exit non-zero from it. Every `claude` spawn is wrapped; unparseable output degrades to "unknown", never a crash.
- **No shell-dependent checks (ADR-007):** binary lookups scan `process.env.PATH` in Node (PATHEXT-aware on win32). Never `command -v`, never `which`.
- **Approval-gated:** nothing installs without the user's explicit yes. `--apply <ids>` carries prior approval (the ids ARE the approval). Piped/non-TTY `init` installs nothing.
- **`enabledPlugins` is written by `claude plugin install`** — hand-written only on the no-`claude` path, using the documented `{ "<id>": true }` shape.
- **Budgets:** skill bodies ≤100 lines (`npx perfect-harness-engineering file-size-check`); no always-loaded context added by this increment.
- **Tests registered in `package.json` `scripts.test`** (append with `&&`); `npm test` stays green throughout; hooks untouched, so `smoke-test.mjs` needs no new fixtures.
- **`init` downloads the payload from GitHub main** — integration tests must call exported functions against local dirs, never run `main()` end-to-end (see memory: local template edits are invisible to a real `init`).
- **Spawning `claude` with fixed-literal args only** (ids come from the repo-owner-trusted manifest — same trust class as `stopGate` commands). On win32 a resolved `.cmd`/`.bat` needs `shell: true`; acceptable only because args are fixed literals.

## File Structure

| File | Responsibility |
|---|---|
| `cli/init.js` | **Modify.** Extract `DEP_SIGNALS`/`PY_SIGNALS` tables + export `STACK_SIGNALS` and `detectTechStack`; call `initCapabilitiesFlow` after the settings reconcile; capture/restore plugin keys around the payload copy. |
| `cli/update.js` | **Modify (2 lines).** Same capture/restore around its copy. |
| `cli/merge-settings.js` | **Modify.** Add `capturePluginKeys` / `restorePluginKeys` (plugin keys survive re-init/update). |
| `template/.claude/capabilities.json` | **Create.** The manifest, verbatim from the spec. |
| `cli/capabilities.js` | **Create.** `findOnPath`, `runClaude`, `readState`, `readEnabledPlugins`, `planCapabilities` (pure), `classifyFailure` (pure), `writeCapabilityDecisions`, `applyCapabilities`, `initCapabilitiesFlow`, `mainCli`. |
| `cli/index.js` | **Modify.** `capabilities` subcommand + help text row. |
| `cli/capabilities.test.js` | **Create.** Pure-function fixtures + shim-based spawn tests. |
| `cli/capabilities-manifest.test.js` | **Create.** The two ratchet assertions. |
| `template/.claude/skills/evolve/SKILL.md`, `.../review-branch/SKILL.md` | **Modify.** The missing terminal fallback (one sentence each). |
| `package.json` | **Modify.** Register the two new test files. |

---

### Task 1: Export the stack-signal vocabulary from `detectTechStack`

**Files:**
- Modify: `cli/init.js` (the `detectTechStack` function, currently ~lines 155–210, and `module.exports`)
- Test: `cli/capabilities.test.js` (created here; more sections appended by later tasks)

**Interfaces:**
- Produces: `require('./init.js').STACK_SIGNALS` — `string[]`, every signal `detectTechStack()` can emit; `require('./init.js').detectTechStack` — `() => string[]` (reads cwd).

- [ ] **Step 1: Write the failing test**

Create `cli/capabilities.test.js` with the repo's assert-counter pattern:

```js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}
function tmpdir() {
  const d = path.join(os.tmpdir(), 'phe-cap-' + crypto.randomUUID());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Task 1: STACK_SIGNALS vocabulary ──────────────────────────────────────
const initMod = require('./init.js');
check('STACK_SIGNALS is a non-empty array', Array.isArray(initMod.STACK_SIGNALS) && initMod.STACK_SIGNALS.length > 0);
check('STACK_SIGNALS covers the known signals', ['Next.js','React','Vue','Svelte','Express','NestJS','Expo','Supabase','Tailwind','Stripe','Prisma','Drizzle','MongoDB/Mongoose','Python','FastAPI','Django','Flask','Go','Rust'].every(s => initMod.STACK_SIGNALS.indexOf(s) !== -1));
check('STACK_SIGNALS has no duplicates', new Set(initMod.STACK_SIGNALS).size === initMod.STACK_SIGNALS.length);

// detection still behaves: dual-key deps dedupe to one signal
{
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({
    dependencies: { next: '1', svelte: '1', '@sveltejs/kit': '1', prisma: '1', '@prisma/client': '1' }
  }));
  const prev = process.cwd();
  process.chdir(d);
  const got = initMod.detectTechStack();
  process.chdir(prev);
  check('detect: Next.js present', got.indexOf('Next.js') !== -1);
  check('detect: Svelte deduped', got.filter(s => s === 'Svelte').length === 1);
  check('detect: Prisma deduped', got.filter(s => s === 'Prisma').length === 1);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it — expect FAIL** — `node cli/capabilities.test.js` → FAIL on `STACK_SIGNALS is a non-empty array` (undefined export).

- [ ] **Step 3: Refactor `detectTechStack` to tables + export**

In `cli/init.js`, directly above `function detectTechStack()`, add:

```js
// Stack-signal vocabulary. The capabilities manifest's `when.stack` strings MUST come
// from this list (cli/capabilities-manifest.test.js enforces it), so detector and
// manifest cannot drift apart. Key order = output order (JS string-key insertion order).
var DEP_SIGNALS = {
  'next': 'Next.js', 'react': 'React', 'vue': 'Vue',
  'svelte': 'Svelte', '@sveltejs/kit': 'Svelte',
  'express': 'Express', '@nestjs/core': 'NestJS', 'expo': 'Expo',
  '@supabase/supabase-js': 'Supabase', 'tailwindcss': 'Tailwind', 'stripe': 'Stripe',
  'prisma': 'Prisma', '@prisma/client': 'Prisma',
  'drizzle-orm': 'Drizzle', 'mongoose': 'MongoDB/Mongoose',
};
var PY_SIGNALS = { 'fastapi': 'FastAPI', 'django': 'Django', 'flask': 'Flask' };
var STACK_SIGNALS = (function () {
  var seen = {};
  var out = [];
  var all = Object.keys(DEP_SIGNALS).map(function (k) { return DEP_SIGNALS[k]; })
    .concat(['Python'], Object.keys(PY_SIGNALS).map(function (k) { return PY_SIGNALS[k]; }), ['Go', 'Rust']);
  for (var i = 0; i < all.length; i++) {
    if (!seen[all[i]]) { seen[all[i]] = true; out.push(all[i]); }
  }
  return out;
})();
```

Inside `detectTechStack`, replace the 13 hardcoded `if (deps['next']) detected.push('Next.js');`-style lines with:

```js
        for (var depKey in DEP_SIGNALS) {
          if (deps[depKey] && detected.indexOf(DEP_SIGNALS[depKey]) === -1) {
            detected.push(DEP_SIGNALS[depKey]);
          }
        }
```

Replace the three `if (reqContent.includes('fastapi')) detected.push('FastAPI');`-style lines with:

```js
      for (var pyKey in PY_SIGNALS) {
        if (reqContent.includes(pyKey)) detected.push(PY_SIGNALS[pyKey]);
      }
```

Leave the `Python`/`Go`/`Rust` file checks as they are. Add to `module.exports`:

```js
  detectTechStack: detectTechStack,
  STACK_SIGNALS: STACK_SIGNALS,
```

- [ ] **Step 4: Run tests — expect PASS** — `node cli/capabilities.test.js`, then `npm run test:cli && npm run test:init` (no regression; the existing init tests must stay green).

- [ ] **Step 5: Commit**

```bash
git add cli/init.js cli/capabilities.test.js
git commit -m "refactor(cli): detectTechStack emits from an exported STACK_SIGNALS vocabulary"
```

---

### Task 2: The manifest + the two-assertion ratchet test

**Files:**
- Create: `template/.claude/capabilities.json`
- Create: `cli/capabilities-manifest.test.js`
- Modify: `package.json` (`scripts.test`: append `&& node cli/capabilities-manifest.test.js && node cli/capabilities.test.js`)

**Interfaces:**
- Produces: the manifest file consumed by `cli/capabilities.js` (Task 4+). Shape: `{ marketplaces: {name: {source, trust}}, capabilities: [{id, class, tier, when?, skills?, usedBy?, requiresBinary?, supersedes?, provision?, path?, why}] }`.

- [ ] **Step 1: Write the failing ratchet test**

Create `cli/capabilities-manifest.test.js`:

```js
'use strict';
// The capabilities ratchet (spec: Components 6). Two assertions:
//  (a) every `<plugin>:<skill>` reference in template/ is declared in the manifest —
//      a new external dependency cannot sneak in undeclared;
//  (b) every `when.stack` string is in init.js's STACK_SIGNALS — the matrix cannot
//      drift from the detector.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STACK_SIGNALS } = require('./init.js');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'template', '.claude', 'capabilities.json');
check('manifest exists', fs.existsSync(manifestPath));

let manifest = { marketplaces: {}, capabilities: [] };
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch (e) { check('manifest parses', false); }

// (a) referenced plugin skills ⊆ declared skills
// Known plugin namespaces referenced by the payload. Extend when a new namespace appears —
// the grep below will fail first and name the file.
const NAMESPACES = ['superpowers', 'codex'];
let refs = '';
try {
  refs = execFileSync('grep', ['-rhoE', '\\b(' + NAMESPACES.join('|') + '):[a-z][a-z-]+', path.join(root, 'template')], { encoding: 'utf-8' });
} catch (e) { /* no matches → empty */ }
const referenced = Array.from(new Set(refs.split('\n').filter(Boolean)));
const declared = new Set();
for (const cap of manifest.capabilities) {
  const name = String(cap.id).split('@')[0];
  for (const s of cap.skills || []) declared.add(name + ':' + s);
}
for (const ref of referenced) {
  check('declared: ' + ref, declared.has(ref));
}
check('at least the superpowers refs were found by the grep', referenced.some(r => r.indexOf('superpowers:') === 0));

// (b) when.stack ⊆ STACK_SIGNALS
for (const cap of manifest.capabilities) {
  const stacks = (cap.when && cap.when.stack) || [];
  for (const s of stacks) {
    check('when.stack known to detector: ' + cap.id + ' → ' + s, STACK_SIGNALS.indexOf(s) !== -1);
  }
}

// every row carries a non-empty, non-"same" why (review finding m2)
for (const cap of manifest.capabilities) {
  check('why is real: ' + cap.id, typeof cap.why === 'string' && cap.why.length > 10 && cap.why !== 'same');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it — expect FAIL** on `manifest exists`.

- [ ] **Step 3: Write the manifest** — `template/.claude/capabilities.json`, exactly the revised spec's Components 1 JSON (copy it verbatim from `docs/design/2026-08-29-dynamic-capabilities.md` — superpowers `required` with the 11-skill list; `codex@openai-codex` `optional` with `skills: ["rescue"]`; the four LSP rows with `when.files: ["tsconfig.json"]` on typescript-lsp; the two `global-agent` rows; the three marketplaces). Add a `$comment` first key: `"Template-owned (overwritten on update, like settings.json). Declares what the payload assumes exists. Read by cli/capabilities.js; decisions land in harness.json `capabilities`, never here."`

- [ ] **Step 4: Run tests — expect PASS** — `node cli/capabilities-manifest.test.js`. Every `superpowers:*` grep hit must be declared; if one fails, the manifest's `skills` list is missing a referenced skill — fix the manifest, not the test.

- [ ] **Step 5: Register both test files in `package.json` `scripts.test`, run `npm test` — green — and commit**

```bash
git add template/.claude/capabilities.json cli/capabilities-manifest.test.js package.json
git commit -m "feat(capabilities): declare the manifest + two-assertion ratchet test"
```

---

### Task 3: Plugin keys survive re-init/update (`capturePluginKeys`/`restorePluginKeys`)

**Files:**
- Modify: `cli/merge-settings.js` (add two functions + exports; `PLUGIN_KEYS` const)
- Modify: `cli/init.js` (capture before the `.claude` `backupAndCopy`, restore after `reconcileSettingsJson`)
- Modify: `cli/update.js` (same pair around its copy/reconcile)
- Test: `cli/merge-settings.test.js` (append cases)

**Interfaces:**
- Produces: `capturePluginKeys(projectRoot) => {enabledPlugins?, extraKnownMarketplaces?} | null`; `restorePluginKeys(projectRoot, captured) => {restored: boolean, error?}`. Restore merges captured-user-wins via the existing `deepMergeUserWins`.
- Why not `mergeSettings`: the re-init clobber is in the COPY path — `backupAndCopy` preserves only the FIRST backup ever taken, so plugin keys added later (by `claude plugin install --scope project`) are overwritten and never re-unioned. Capture/restore brackets the copy itself.

- [ ] **Step 1: Append failing tests to `cli/merge-settings.test.js`** (same check-counter style as the file already uses):

```js
// ── plugin keys survive the copy path ────────────────────────────────────
{
  const d = tmpTestDir(); // reuse the file's existing tmp-dir helper name — read the file first and use ITS helper
  fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
  const live = path.join(d, '.claude', 'settings.json');
  fs.writeFileSync(live, JSON.stringify({
    permissions: {},
    enabledPlugins: { 'superpowers@claude-plugins-official': true, 'x@m': false },
    extraKnownMarketplaces: { 'openai-codex': { source: { source: 'github', repo: 'openai/codex-plugin-cc' } } },
  }));
  const captured = capturePluginKeys(d);
  check('capture picks up both keys', captured && captured.enabledPlugins && captured.extraKnownMarketplaces);
  // simulate the template copy clobbering the file
  fs.writeFileSync(live, JSON.stringify({ permissions: {}, hooks: {} }));
  const res = restorePluginKeys(d, captured);
  check('restore reports restored', res.restored === true);
  const after = JSON.parse(fs.readFileSync(live, 'utf-8'));
  check('enabledPlugins restored', after.enabledPlugins && after.enabledPlugins['superpowers@claude-plugins-official'] === true);
  check('user false preserved', after.enabledPlugins['x@m'] === false);
  check('marketplaces restored', !!after.extraKnownMarketplaces['openai-codex']);
  check('other keys intact', !!after.permissions && !!after.hooks);
  check('capture on missing file is null', capturePluginKeys(path.join(d, 'nope')) === null);
  check('restore with null is a no-op', restorePluginKeys(d, null).restored === false);
}
```

- [ ] **Step 2: Run — expect FAIL** (functions not defined).

- [ ] **Step 3: Implement in `cli/merge-settings.js`** (below `reconcileSettingsJson`):

```js
// Keys in .claude/settings.json that Claude Code itself writes on the user's behalf
// (`claude plugin install --scope project`). backupAndCopy preserves only the FIRST
// backup ever taken, so on re-init/update these keys would be overwritten by the
// template and never re-unioned. init/update bracket the copy with this pair.
const PLUGIN_KEYS = ['enabledPlugins', 'extraKnownMarketplaces'];

function capturePluginKeys(projectRoot) {
  const live = path.join(projectRoot, '.claude', 'settings.json');
  if (!fs.existsSync(live)) return null;
  let parsed;
  try { parsed = readJson(live); } catch (e) { return null; }
  const captured = {};
  let any = false;
  for (const k of PLUGIN_KEYS) {
    if (parsed && parsed[k] && typeof parsed[k] === 'object' && !Array.isArray(parsed[k])) {
      captured[k] = parsed[k];
      any = true;
    }
  }
  return any ? captured : null;
}

function restorePluginKeys(projectRoot, captured) {
  if (!captured) return { restored: false };
  const live = path.join(projectRoot, '.claude', 'settings.json');
  if (!fs.existsSync(live)) return { restored: false };
  let parsed;
  try { parsed = readJson(live); } catch (e) { return { restored: false, error: e.message }; }
  for (const k of PLUGIN_KEYS) {
    if (k in captured) parsed[k] = deepMergeUserWins(captured[k], parsed[k]);
  }
  writeJsonAtomic(live, parsed);
  return { restored: true };
}
```

Add both to `module.exports`. In `cli/init.js` `main()`: immediately before `var stats = backupAndCopy(` add `var capturedPluginKeys = capturePluginKeys(targetDir);` (require it from `./merge-settings` in the existing destructured require) and immediately after the `settingsReconcile` if/else block add `restorePluginKeys(targetDir, capturedPluginKeys);`. In `cli/update.js`: same pair around its `backupAndCopy`/reconcile calls (read the file to find them; the structure mirrors init).

- [ ] **Step 4: Run — expect PASS** — `node cli/merge-settings.test.js`, then `npm test` (init/update tests stay green).

- [ ] **Step 5: Commit** — `git add cli/merge-settings.js cli/init.js cli/update.js cli/merge-settings.test.js && git commit -m "fix(cli): enabledPlugins/extraKnownMarketplaces survive re-init and update"`

---

### Task 4: `cli/capabilities.js` — state readers (`findOnPath`, `runClaude`, `readState`)

**Files:**
- Create: `cli/capabilities.js`
- Test: `cli/capabilities.test.js` (append)

**Interfaces:**
- Produces:
  - `findOnPath(bin, env?) => string|null` — PATH scan, PATHEXT on win32, no shell (ADR-007).
  - `runClaude(args) => {ok: boolean, out: string, err: string} | null` — `null` means no `claude` binary; `ok:false` carries stderr for classification. 30s timeout, never throws.
  - `readState(projectRoot) => { claude: string|null, plugins: [], pluginNames: {name: entry}, marketplaces: [], catalog: {id: entry}, enabledIn: {id: {value, scope}} }`.
  - `claudeConfigDir() => string` — honours `CLAUDE_CONFIG_DIR`.

- [ ] **Step 1: Append failing tests** (shim-based; POSIX shim, so guard with `if (process.platform !== 'win32')`):

```js
// ── Task 4: findOnPath / runClaude / readState with a fake `claude` ──────
const cap = require('./capabilities.js');
{
  const bindir = tmpdir();
  fs.writeFileSync(path.join(bindir, 'claude'),
    '#!/bin/sh\n' +
    'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
    'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo \'[{"id":"superpowers@claude-plugins-official","scope":"user","enabled":true,"installPath":"/tmp/x","version":"6.3.0"}]\'; exit 0; fi\n' +
    'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ]; then echo "[]"; exit 0; fi\n' +
    'exit 1\n');
  fs.chmodSync(path.join(bindir, 'claude'), 0o755);
  const prevPath = process.env.PATH;
  process.env.PATH = bindir; // shim is the ONLY thing on PATH

  check('findOnPath finds the shim', cap.findOnPath('claude') === path.join(bindir, 'claude'));
  check('findOnPath misses absent bins', cap.findOnPath('definitely-not-a-binary-xyz') === null);
  const v = cap.runClaude(['--version']);
  check('runClaude ok', v && v.ok === true && v.out.indexOf('9.9.9') !== -1);
  const bad = cap.runClaude(['nonsense']);
  check('runClaude failure carries ok:false, not a throw', bad && bad.ok === false);

  const proj = tmpdir();
  const state = cap.readState(proj);
  check('state.claude read', state.claude === '9.9.9 (Claude Code)');
  check('plugin indexed by bare name', !!state.pluginNames['superpowers']);

  process.env.PATH = prevPath;
  check('no claude → state.claude null', (function () {
    process.env.PATH = tmpdir(); // empty dir
    const s = cap.readState(proj);
    process.env.PATH = prevPath;
    return s.claude === null;
  })());
}
```

- [ ] **Step 2: Run — expect FAIL** (module missing).

- [ ] **Step 3: Implement** — create `cli/capabilities.js`:

```js
'use strict';
// Dynamic capabilities resolver — spec: docs/design/2026-08-29-dynamic-capabilities.md.
// Everything here fails OPEN (ADR-006): no claude binary, no network, no marketplace —
// init still completes; the outcome is recorded, never thrown.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { writeJsonAtomic } = require('./harness-config');
const { deepMergeUserWins } = require('./merge-settings');

// PATH scan in Node — never `command -v`/`which` (ADR-007: shell checks fail open
// on Windows). PATHEXT makes `claude` match claude.CMD on win32.
function findOnPath(bin, env) {
  env = env || process.env;
  var dirs = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  var exts = process.platform === 'win32'
    ? String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (var i = 0; i < dirs.length; i++) {
    for (var j = 0; j < exts.length; j++) {
      var p = path.join(dirs[i], bin + exts[j]);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        if (fs.statSync(p).isFile()) return p;
      } catch (e) { /* keep scanning */ }
    }
  }
  return null;
}

// null = no binary. {ok,out,err} otherwise — callers classify, never see a throw.
// .cmd/.bat need shell:true on win32; safe ONLY because every caller passes fixed
// literals from the repo-owner-trusted manifest (same trust class as stopGate).
function runClaude(args) {
  var bin = findOnPath('claude');
  if (!bin) return null;
  var opts = { encoding: 'utf-8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] };
  if (/\.(cmd|bat)$/i.test(bin)) opts.shell = true;
  try {
    var out = execFileSync(bin, args, opts);
    return { ok: true, out: String(out), err: '' };
  } catch (e) {
    return { ok: false, out: String(e.stdout || ''), err: String(e.stderr || e.message || '') };
  }
}

function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// id -> {value, scope} across the three documented settings files.
// Later files win: user < project < local (matches the documented precedence).
function readEnabledPlugins(projectRoot) {
  var files = [
    { p: path.join(claudeConfigDir(), 'settings.json'), scope: 'user' },
    { p: path.join(projectRoot, '.claude', 'settings.json'), scope: 'project' },
    { p: path.join(projectRoot, '.claude', 'settings.local.json'), scope: 'local' },
  ];
  var out = {};
  for (var i = 0; i < files.length; i++) {
    try {
      var parsed = JSON.parse(fs.readFileSync(files[i].p, 'utf-8'));
      var ep = parsed && parsed.enabledPlugins;
      if (ep && typeof ep === 'object') {
        for (var id in ep) out[id] = { value: ep[id], scope: files[i].scope };
      }
    } catch (e) { /* absent/unparseable file contributes nothing */ }
  }
  return out;
}

function readState(projectRoot) {
  var state = { claude: null, plugins: [], pluginNames: {}, marketplaces: [], catalog: {}, enabledIn: {} };
  var v = runClaude(['--version']);
  if (v === null || !v.ok) { state.enabledIn = readEnabledPlugins(projectRoot); return state; }
  state.claude = v.out.trim();
  var list = runClaude(['plugin', 'list', '--json']);
  if (list && list.ok) {
    try {
      state.plugins = JSON.parse(list.out);
      for (var i = 0; i < state.plugins.length; i++) {
        var name = String(state.plugins[i].id || '').split('@')[0];
        if (name && !state.pluginNames[name]) state.pluginNames[name] = state.plugins[i];
      }
    } catch (e) { /* unparseable → treated as empty */ }
  }
  var mkts = runClaude(['plugin', 'marketplace', 'list', '--json']);
  if (mkts && mkts.ok) {
    try { state.marketplaces = JSON.parse(mkts.out); } catch (e) {}
  }
  for (var m = 0; m < state.marketplaces.length; m++) {
    var loc = state.marketplaces[m].installLocation;
    if (!loc) continue;
    try {
      var catFile = path.join(loc, '.claude-plugin', 'marketplace.json');
      var cat = JSON.parse(fs.readFileSync(catFile, 'utf-8'));
      var plugins = Array.isArray(cat.plugins) ? cat.plugins : [];
      for (var pI = 0; pI < plugins.length; pI++) {
        state.catalog[plugins[pI].name + '@' + state.marketplaces[m].name] = plugins[pI];
      }
    } catch (e) { /* catalog unreadable → no provenance shown, still installable */ }
  }
  state.enabledIn = readEnabledPlugins(projectRoot);
  return state;
}

module.exports = {
  findOnPath: findOnPath,
  runClaude: runClaude,
  claudeConfigDir: claudeConfigDir,
  readEnabledPlugins: readEnabledPlugins,
  readState: readState,
};
```

- [ ] **Step 4: Run — expect PASS** — `node cli/capabilities.test.js`.

- [ ] **Step 5: Commit** — `git add cli/capabilities.js cli/capabilities.test.js && git commit -m "feat(capabilities): state readers — PATH scan, claude spawn wrapper, machine state"`

---

### Task 5: `planCapabilities()` — the pure bucket planner

**Files:**
- Modify: `cli/capabilities.js`
- Test: `cli/capabilities.test.js` (append)

**Interfaces:**
- Consumes: `readState` output shape (Task 4).
- Produces: `planCapabilities({manifest, stack, files, binaries, state, decisions, tiers}) => {present:[], disabledByUser:[], install:[], needsMarketplace:[], declined:[], reoffer:[], blocked:[], manual:[]}`. Pure — no fs, no spawn; `files` is the list of `when.files` names that exist (caller checks), `binaries` maps binary name → `string|null` (caller runs `findOnPath`), `decisions` is `harness.json.capabilities` or `{}`. Every bucket entry: `{id, tier, why, class, requiresBinary?, binaryMissing?, source?, sha?, marketplace?, overridesUserDisable?}`.
- `TIER_RANK = { required: 3, recommended: 2, optional: 1 }` (exported).

- [ ] **Step 1: Append failing tests** — build one small manifest fixture and drive every bucket:

```js
// ── Task 5: planCapabilities buckets ─────────────────────────────────────
{
  const M = { marketplaces: { 'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' }, trust: 'official' } }, capabilities: [
    { id: 'superpowers@claude-plugins-official', class: 'plugin', tier: 'required', skills: ['brainstorming'], why: 'w' },
    { id: 'typescript-lsp@claude-plugins-official', class: 'plugin', tier: 'recommended', when: { files: ['tsconfig.json'] }, requiresBinary: 'typescript-language-server', why: 'w' },
    { id: 'pyright-lsp@claude-plugins-official', class: 'plugin', tier: 'recommended', when: { stack: ['Python'] }, requiresBinary: 'pyright-langserver', why: 'w' },
    { id: 'codex@openai-codex', class: 'plugin', tier: 'optional', skills: ['rescue'], why: 'w' },
    { id: 'architect-agent', class: 'global-agent', tier: 'recommended', provision: 'manual', why: 'w' },
  ]};
  const baseState = { claude: '9.9.9', plugins: [], pluginNames: {}, marketplaces: [{ name: 'claude-plugins-official' }], catalog: {}, enabledIn: {} };
  const P = (over) => cap.planCapabilities(Object.assign({ manifest: M, stack: [], files: [], binaries: {}, state: baseState, decisions: {}, tiers: ['required', 'recommended', 'optional'] }, over));

  check('required + registered mkt → install', P({}).install.some(e => e.id === 'superpowers@claude-plugins-official'));
  check('global-agent → manual', P({}).manual.some(e => e.id === 'architect-agent'));
  check('no claude → everything manual', P({ state: Object.assign({}, baseState, { claude: null }) }).manual.some(e => e.id === 'superpowers@claude-plugins-official'));
  check('recommended without when-match is absent everywhere', Object.values(P({})).every(b => !b.some || !b.some(e => e.id === 'pyright-lsp@claude-plugins-official')) || !JSON.stringify(P({})).includes('pyright-lsp'));
  check('when.stack match → install', P({ stack: ['Python'] }).install.some(e => e.id === 'pyright-lsp@claude-plugins-official'));
  check('when.files match → install', P({ files: ['tsconfig.json'] }).install.some(e => e.id === 'typescript-lsp@claude-plugins-official'));
  check('binaryMissing flagged', P({ stack: ['Python'], binaries: { 'pyright-langserver': null } }).install.find(e => e.id === 'pyright-lsp@claude-plugins-official').binaryMissing === true);
  check('installed+enabled by bare name → present (any marketplace)',
    P({ state: Object.assign({}, baseState, { pluginNames: { superpowers: { id: 'superpowers@elsewhere', enabled: true } } }) }).present.some(e => e.id === 'superpowers@claude-plugins-official'));
  check('installed but disabled → disabledByUser',
    P({ state: Object.assign({}, baseState, { pluginNames: { superpowers: { id: 'superpowers@claude-plugins-official', enabled: false } } }) }).disabledByUser.length === 1);
  check('unregistered marketplace → needsMarketplace', P({}).needsMarketplace.some(e => e.id === 'codex@openai-codex') === false /* optional tier not requested */ &&
    cap.planCapabilities({ manifest: M, stack: [], files: [], binaries: {}, state: baseState, decisions: {}, tiers: ['optional'] }).needsMarketplace.some(e => e.id === 'codex@openai-codex'));
  check('declined same tier → declined bucket', P({ decisions: { declined: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'required' } } } }).declined.length === 1);
  check('declined lower tier, now higher → reoffer', P({ decisions: { declined: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'recommended' } } } }).reoffer.length === 1);
  check('recorded blocked → blocked, never install', P({ decisions: { unavailable: { 'superpowers@claude-plugins-official': { at: 'x', reason: 'blocked: strictKnownMarketplaces' } } } }).blocked.length === 1);
}
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** in `cli/capabilities.js`:

```js
var TIER_RANK = { required: 3, recommended: 2, optional: 1 };

function whenMatches(cap, stack, files) {
  if (!cap.when) return true; // required/optional rows usually carry no `when`
  var stacks = cap.when.stack || [];
  for (var i = 0; i < stacks.length; i++) if (stack.indexOf(stacks[i]) !== -1) return true;
  var fl = cap.when.files || [];
  for (var j = 0; j < fl.length; j++) if (files.indexOf(fl[j]) !== -1) return true;
  return false;
}

function planCapabilities(opts) {
  var out = { present: [], disabledByUser: [], install: [], needsMarketplace: [], declined: [], reoffer: [], blocked: [], manual: [] };
  var caps = (opts.manifest && opts.manifest.capabilities) || [];
  var decisions = opts.decisions || {};
  var registered = {};
  for (var m = 0; m < (opts.state.marketplaces || []).length; m++) registered[opts.state.marketplaces[m].name] = true;

  for (var i = 0; i < caps.length; i++) {
    var cap = caps[i];
    if (opts.tiers.indexOf(cap.tier) === -1) continue;
    if (cap.tier === 'recommended' && !whenMatches(cap, opts.stack || [], opts.files || [])) continue;

    var name = String(cap.id).split('@')[0];
    var mkt = String(cap.id).split('@')[1] || null;
    var catalogEntry = opts.state.catalog[cap.id] || {};
    var entry = {
      id: cap.id, tier: cap.tier, why: cap.why, class: cap.class || 'plugin',
      requiresBinary: cap.requiresBinary || null,
      binaryMissing: !!(cap.requiresBinary && opts.binaries && opts.binaries[cap.requiresBinary] === null),
      source: catalogEntry.source || null, sha: catalogEntry.sha || (catalogEntry.source && catalogEntry.source.sha) || null,
      marketplace: mkt,
    };

    // Order matters: recorded blocks beat everything; declines beat state reads.
    var blockedRec = decisions.unavailable && decisions.unavailable[cap.id];
    if (blockedRec && String(blockedRec.reason || '').indexOf('blocked') === 0) { out.blocked.push(entry); continue; }
    var declinedRec = decisions.declined && decisions.declined[cap.id];
    if (declinedRec) {
      if (TIER_RANK[cap.tier] > (TIER_RANK[declinedRec.tier] || 0)) out.reoffer.push(entry);
      else out.declined.push(entry);
      continue;
    }
    if (cap.class === 'global-agent' || cap.provision === 'manual' || opts.state.claude === null) { out.manual.push(entry); continue; }

    var installed = opts.state.pluginNames[name]; // bare-name match: any marketplace, --plugin-dir copies included
    if (installed && installed.enabled !== false) { out.present.push(entry); continue; }
    if (installed && installed.enabled === false) { out.disabledByUser.push(entry); continue; }
    var userDisabled = opts.state.enabledIn[cap.id];
    if (userDisabled && userDisabled.value === false && (userDisabled.scope === 'user' || userDisabled.scope === 'local')) {
      entry.overridesUserDisable = true;
      out.disabledByUser.push(entry); continue;
    }
    if (mkt && !registered[mkt]) { out.needsMarketplace.push(entry); continue; }
    out.install.push(entry);
  }
  return out;
}
```

Export `planCapabilities` and `TIER_RANK`.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** — `git commit -am "feat(capabilities): pure bucket planner"`

---

### Task 6: `applyCapabilities()` + decisions writer + failure classifier

**Files:**
- Modify: `cli/capabilities.js`
- Test: `cli/capabilities.test.js` (append)

**Interfaces:**
- Produces:
  - `classifyFailure(err) => string` — pure: `/strictKnownMarketplaces|blockedMarketplaces|disableCommandPluginSources|managed settings/i` → `'blocked: <matched setting name>'`; `/ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|fetch failed|getaddrinfo/i` → `'network'`; `/not found/i` → `'not-found'`; else first non-empty line of `err`, truncated to 120 chars.
  - `writeCapabilityDecisions(projectRoot, patch)` — merges `{accepted?, declined?, unavailable?, scope?, resolvedAt?, manifestVersion?}` into `harness.json` `capabilities`, preserving every other harness.json key and every existing decision not named in the patch. Mirrors `writeKnowledgeConfig`: parse-refusal throws, `writeJsonAtomic` writes. Missing harness.json → creates `{capabilities}` only.
  - `applyCapabilities({ids, planned, scope, projectRoot, manifestVersion}) => {installed:[], failed:[], manual:[], marketplacesAdded:[]}` — for each id (must be in `planned.install`/`needsMarketplace`/`reoffer`/`disabledByUser`): add marketplace if needed (`runClaude(['plugin','marketplace','add', spec])` where spec is `repo` for github sources else `url`), then `runClaude(['plugin','install', id, '--scope', scope])`. Success → `accepted[id] = {at: ISOdate, tier, overrodeUserDisable}`; sha re-read post-install from the catalog file, mismatch → also `unavailable[id] = {reason: 'sha-drift'}` recorded alongside the accept. Failure → `unavailable[id] = {at, reason: classifyFailure(err)}`. `runClaude === null` (no binary) → hand-write `enabledPlugins`/`extraKnownMarketplaces` into project settings via `restorePluginKeys(projectRoot, {...})` and return the id under `manual` with the exact command string. Never throws; prints `Run /reload-plugins in any open session.` once if `installed.length > 0`.

- [ ] **Step 1: Append failing tests** — classifier is pure (5 one-line checks: blocked/network/not-found/fallback-first-line/120-char truncation); decisions writer round-trips (write accepted, then declined patch, both survive; other harness.json keys intact; unparseable harness.json throws); apply against the shim: extend the Task 4 shim script with an `install` branch that logs its argv to a file and exits 0 (assert: argv recorded `plugin install superpowers@claude-plugins-official --scope project`, `accepted` recorded in harness.json, reload line printed) and a second shim variant exiting 1 with `Error: blocked by strictKnownMarketplaces` on stderr (assert: `unavailable` reason starts `blocked:`, exit path still returns). No-claude path: empty PATH, project settings pre-seeded `{}` → after apply, `enabledPlugins['superpowers@claude-plugins-official'] === true` hand-written and command string returned under `manual`. Write each as real `check(...)` lines following the Task 4/5 patterns.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** the three functions per the Interfaces block above. `writeCapabilityDecisions` skeleton:

```js
function writeCapabilityDecisions(projectRoot, patch) {
  var p = path.join(projectRoot, '.claude', 'harness.json');
  var current = {};
  if (fs.existsSync(p)) {
    try { current = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.'); }
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
    }
  }
  var caps = current.capabilities && typeof current.capabilities === 'object' ? current.capabilities : {};
  ['accepted', 'declined', 'unavailable'].forEach(function (k) {
    if (patch[k]) caps[k] = Object.assign({}, caps[k] || {}, patch[k]);
  });
  ['scope', 'resolvedAt', 'manifestVersion'].forEach(function (k) {
    if (patch[k] !== undefined) caps[k] = patch[k];
  });
  current.capabilities = caps;
  writeJsonAtomic(p, current);
}
```

An id accepted now must also be DELETED from `caps.declined`/`caps.unavailable` (and vice versa for a new decline) — a capability is in exactly one decision state; implement that pruning in the same function.

- [ ] **Step 4: Run — expect PASS**, then `npm test`.

- [ ] **Step 5: Commit** — `git commit -am "feat(capabilities): apply + decision record + failure classifier"`

---

### Task 7: CLI subcommand `capabilities`

**Files:**
- Modify: `cli/capabilities.js` (add `mainCli(argv)`), `cli/index.js` (case + help row)
- Test: `cli/capabilities.test.js` (append — spawn `node cli/index.js capabilities --propose --json` in a tmp project via `spawnSync`)

**Interfaces:**
- Produces: `npx perfect-harness-engineering capabilities [--propose --json] [--apply id1,id2] [--check] [--scope user|project|local] [--reset]`.
  - `--propose --json`: prints `JSON.stringify({stack, plan}, null, 2)` — stack from `detectTechStack()` (cwd), `files` = which of the manifest's `when.files` names exist in cwd, `binaries` via `findOnPath`, decisions from harness.json, tiers `['required','recommended','optional']`. Reads the manifest from `./.claude/capabilities.json` (the installed copy).
  - `--apply id1,id2`: `applyCapabilities` with those ids; scope from `--scope`, else recorded `capabilities.scope`, else `project`. Runs without a TTY by design (the ids are the approval — spec B2 fix).
  - `--check`: exit 1 if any `accepted` id is not in `claude plugin list --json` (matched by bare name); `claude` absent → print `capabilities --check: claude not on PATH — cannot verify` and exit 0 (fail-open, ADR-006).
  - `--reset`: delete `declined` and `unavailable` from `harness.json` `capabilities`.
- `cli/index.js`: add a case mirroring the `emit` pattern (`require('./capabilities.js').mainCli(process.argv.slice(3))` in try/catch → exit 1 on throw), plus one help line: `capabilities  Resolve declared plugins/marketplaces (propose/apply/check; approval-gated)`.

- [ ] **Step 1: Append failing tests** — tmp project with `.claude/capabilities.json` (the Task 5 fixture manifest), `.claude/harness.json` `{}`; PATH = shim dir. `spawnSync(process.execPath, [path.join(__dirname,'index.js'), 'capabilities', '--propose', '--json'], {cwd: proj, env: {...process.env, PATH: shimdir}})` → exit 0, stdout parses, `plan.install` names superpowers. `--check` with accepted-but-uninstalled id → exit 1. `--check` with empty PATH → exit 0. `--reset` clears declined.

- [ ] **Step 2: Run — expect FAIL.** — **Step 3: Implement `mainCli`** (plain argv scan, no parsing library; unknown flag → print usage, exit 1). — **Step 4: Run — expect PASS**, `npm test` green.

- [ ] **Step 5: Commit** — `git commit -am "feat(cli): capabilities subcommand — propose/apply/check/reset"`

---

### Task 8: `init` integration — the one required question

**Files:**
- Modify: `cli/capabilities.js` (add `initCapabilitiesFlow`), `cli/init.js` (call site + summary line)
- Test: `cli/capabilities.test.js` (append)

**Interfaces:**
- Produces: `initCapabilitiesFlow({targetDir, targets, tty, askFn, log}) => Promise<{asked, installed, declined, skippedReason?}>`. `askFn(prompt) => Promise<string>` is init.js's existing `ask`; `log` is `console.log` (injected for tests).
- Behaviour (spec Data flow → init):
  - `targets` lacks `'claude'` → `{skippedReason: 'codex-only'}`, log one line: `Capabilities: skipped (Codex-only target).`
  - `!tty` → `{skippedReason: 'no-tty'}`, log: `Capabilities: not resolved (no TTY) — run npx perfect-harness-engineering capabilities, or /harness-init in a session.` **Never call askFn here** (a piped run must not consume an answer line — acceptance 3).
  - Else: manifest from `targetDir/.claude/capabilities.json` (just installed), plan for `tiers: ['required']`. For each `install`/`needsMarketplace`/`reoffer` entry, print the spec's prompt block (id, source repo/url + sha when the catalog provided them, `why`; append the raw output of `runClaude(['plugin','details', id])` when `ok` — verbatim, never parsed), ask `Install to project scope? [Y/n] `; empty or `y`/`yes` (case-insensitive) = yes. Yes → `applyCapabilities` for that id (scope `'project'`); no → record decline. `disabledByUser` entries: same ask, with the extra line `NOTE: you disabled this at ${scope} scope — project-scope enable overrides it.` `present`/`manual`/`blocked`/`declined` buckets: log one summary line each, no question.
- Call site in `cli/init.js`: after the `restorePluginKeys` call from Task 3 and before the Codex-emit block: `await initCapabilitiesFlow({ targetDir: targetDir, targets: targets, tty: !!process.stdin.isTTY, askFn: ask, log: console.log });` — wrapped in try/catch that logs `Capabilities: skipped (' + e.message + ')` (fail-open: a resolver bug must never kill init).
- Summary block: add one line after the `.mcp.json/.lsp.json` row: `console.log('  .claude/capabilities.json  declared plugin/marketplace needs (resolve later: npx perfect-harness-engineering capabilities)');`

- [ ] **Step 1: Append failing tests** — call `initCapabilitiesFlow` directly with tmp dirs: (a) codex-only → `skippedReason: 'codex-only'`, askFn never called (assert via counter); (b) `tty: false` → `skippedReason: 'no-tty'`, askFn never called — acceptance 3; (c) tty + shim + scripted askFn answering `'y'` → shim argv log shows the install, harness.json `accepted` recorded — acceptance 1; (d) askFn `'n'` → nothing spawned beyond list/version reads, `declined` recorded — acceptance 2; (e) empty PATH (no claude) → no askFn call for install prompts is still fine (bucket is `manual`), settings hand-write happened, commands logged — acceptance 4.

- [ ] **Step 2: Run — expect FAIL.** — **Step 3: Implement.** — **Step 4: Run — expect PASS**, then `npm test` (all suites), then `node cli/init-backup.test.js` explicitly.

- [ ] **Step 5: Commit** — `git commit -am "feat(init): resolve required capabilities with one approval question"`

---

### Task 9: The missing terminal fallback (review finding M1)

**Files:**
- Modify: `template/.claude/skills/evolve/SKILL.md` (line ~86, end of the `Next:` paragraph)
- Modify: `template/.claude/skills/review-branch/SKILL.md` (line ~70)

**Interfaces:** none — prose. ADR-008's fallback pattern, applied to the one call that lacks it.

- [ ] **Step 1: Edit `evolve/SKILL.md`** — append to the paragraph that explains the `Next:` line (after "…A blocker REPLACES this line."):

```
Superpowers unavailable → the Next target becomes: merge or PR the branch per AGENTS.md, then `git worktree remove .worktrees/<slug>`.
```

- [ ] **Step 2: Edit `review-branch/SKILL.md`** — replace the sentence `After `/evolve`, finish the branch with `superpowers:finishing-a-development-branch`.` with:

```
After `/evolve`, finish the branch with `superpowers:finishing-a-development-branch` (plugin unavailable → merge or PR per AGENTS.md and `git worktree remove .worktrees/<slug>` yourself).
```

- [ ] **Step 3: Verify budgets + smoke** — `npx perfect-harness-engineering file-size-check` (both skills stay ≤100 lines; if one crosses, cut an equal number of lines from ITS OWN prose — never from another file) and `node template/.claude/hooks/smoke-test.mjs` (green, unchanged).

- [ ] **Step 4: Commit** — `git add template/.claude/skills/evolve/SKILL.md template/.claude/skills/review-branch/SKILL.md && git commit -m "fix(pipeline): terminal superpowers call gains its missing inline fallback"`

---

### Task 10: ADR-017 + full verification

**Files:**
- Modify: `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (prepend ADR-017 above ADR-014, matching the existing entry format: Date/Status/Context/Decision/Consequences)
- Modify: `~/Dev/The Vault/projects/perfectHarnessEngineering/architecture.md` (Key dependencies line: superpowers is now *declared in `template/.claude/capabilities.json` and resolved with approval at init* — replace "skills degrade to inline fallbacks without it" with "declined/absent degrades to inline fallbacks, recorded in harness.json")

**ADR-017 content (write exactly this, adjusting nothing but the date if needed):**

> ## ADR-017 — Capabilities are declared, resolved with approval, never assumed
> - **Date:** 2026-08-29
> - **Status:** accepted (spec: `docs/design/2026-08-29-dynamic-capabilities.md`; increment 1)
> - **Context:** The template referenced superpowers (11 skills), `codex:rescue`, global agents and language servers without declaring or checking any of them. Verified platform facts: project `enabledPlugins` auto-installs only relative-source plugins after workspace trust; superpowers is external-source, so the one plugin the pipeline leans on hardest is exactly the one the native path never fetches. An adversarial review (2026-08-29) killed two of the spec's own components: a session-start drift check that structurally read "present" in the committed-settings teammate case, and a non-TTY rule that would have disabled in-session applies.
> - **Decision:** One template-owned manifest (`.claude/capabilities.json`: tier + traceable `why` per row; `when` matched against `detectTechStack()`'s exported vocabulary, ratchet-tested both directions) and one resolver (`cli/capabilities.js`: fail-open state reads via the `claude` CLI, pure bucket planner, approval-gated apply). `init` asks tier `required` only (TTY only, one Y/n); `--apply <ids>` carries prior approval and runs non-TTY; declines are recorded in `harness.json` `capabilities` and never nagged — there is deliberately NO session-start drift check. `enabledPlugins` is written by `claude plugin install --scope project` (hand-written only when `claude` is absent); plugin keys survive re-init/update via capture/restore around the copy. Soft-required per ADR-006: the pipeline's fallbacks (ADR-008) are the degraded path, including the previously missing terminal-step fallback.
> - **Consequences:** Superpowers is pulled at init with one approved yes; teammates get the committed declaration plus Claude Code's own install hint (external plugins still need their one manual install — platform property, documented, not papered over). Decisions and state live in different files by design (harness.json vs settings.json); `capabilities --check` reconciles them in `/harness-init` and `/evolve`. Increments 2–3 (stack tier + discovery; update delta + rename guard) build on this record.

- [ ] **Step 1: Write ADR-017 + the architecture.md line** (both files above; decisions.md `updated:` frontmatter bumped to 2026-08-29).
- [ ] **Step 2: Full verification — run and record real output:** `npm test` (all suites green) · `node tools/context-ledger.mjs template` (no increase from this increment) · `npx perfect-harness-engineering file-size-check` · `node template/.claude/hooks/smoke-test.mjs`.
- [ ] **Step 3: Commit** — `git commit -am "docs(adr): ADR-017 — capabilities declared, resolved with approval, never assumed"` (repo files only; the vault is not a git concern of this repo).

---

## Self-Review (run after writing, before execution)

1. **Spec coverage:** manifest (Task 2), resolver readers/planner/apply/decisions (4–6), CLI surface (7), init flow + acceptance 1–4 (8), M1 fallback (9), ratchet both assertions (2), merge-settings gap (3), ADR (10). NOT in this increment, by design: `/harness-init`/`/evolve` wiring, supersedes prune, `--check` rungs in skills (increment 2); `update` manifest delta + rename guard (increment 3) — `update.js` gets only the plugin-keys capture/restore here.
2. **Placeholder scan:** every code step carries real code or an exact enumerated behavior list; the two "append tests" steps that compress (Tasks 6–8 Step 1) enumerate each check's condition precisely.
3. **Type consistency:** `runClaude` returns `{ok,out,err}|null` everywhere (Tasks 4, 6, 7, 8); buckets and entry shape identical in Tasks 5–8; `writeCapabilityDecisions(projectRoot, patch)` signature identical in 6–8.
