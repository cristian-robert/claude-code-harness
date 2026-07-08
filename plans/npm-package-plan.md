# claude-code-harness npm Package (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `claude-code-harness` repo (this PHE repo) into a publishable npm package: `npx claude-code-harness init` installs the `template/` payload into any project, with backup/update/merge machinery ported from AIDF and retargeted to PHE's layout + conventions.

**Architecture:** Bring AIDF's battle-tested CLI (`cli/index.js`, `init.js`, `update.js`, `merge-settings.js`, `protected-files.js`, `claude-md-copy.js` + tests) into `cli/`, adapting: the payload now lives under `template/` (not repo root), so the installer copies from `template/.claude`, `template/CLAUDE.md`, `template/.mcp.json`, `template/.lsp.json`; all AIDF names/URLs → `claude-code-harness`; AIDF-specific banners/next-steps → PHE reality (`/harness-init`); `file-size-check` routes to the existing `tools/context-ledger.mjs`. A new `package.json` defines the package.

**Tech Stack:** Node.js CLI (CommonJS, no deps), Node ≥18. Copy source: the AIDF worktree `cli/` at `/Users/cristian-robertiosef/Dev/AIDevelopmentFramework-phe-v1/cli/` (READ-ONLY reference — never modify it).

## Global Constraints

- **This is Phase 3 of 3.** Phases 1–2 are committed on this branch. Spec: `docs/design/2026-07-08-vault-research-reuse.md` (Phase 3 there was "AIDF port"; redefined per user decision to "new `claude-code-harness` package in THIS repo; leave AIDF untouched").
- **Branch:** `feat/vault-research-reuse` (PHE / claude-code-harness repo). Never commit to `main`.
- **Copy source is READ-ONLY:** `/Users/cristian-robertiosef/Dev/AIDevelopmentFramework-phe-v1/cli/` (the `ai-development-framework` package). Do NOT modify it — the user wants it left untouched.
- **Payload lives under `template/`.** The installer reads `template/.claude`, `template/CLAUDE.md`, `template/.mcp.json`, `template/.lsp.json`. The `vault-scaffold/` (Phase 2) is inside `template/.claude/references/`, so it ships automatically with `.claude/`.
- **Package identity:** name `claude-code-harness`; bin `claude-code-harness` → `cli/index.js`; repo `cristian-robert/claude-code-harness`; version `1.0.0`.
- **Do NOT install into consumer projects:** `docs/`, `docs/plans/`, or any `cli/` tool. Those live in the package and run via `npx`. Install only `.claude/` + `CLAUDE.md` + `.mcp.json` + `.lsp.json`.
- **`file-size-check`** command runs the existing `tools/context-ledger.mjs` (PHE's budget tool) — AIDF's `file-size-check.js` is NOT ported.
- **No secrets/PII in the package** — final `npm pack --dry-run` gate greps the tarball file list; a leak scan of any copied text confirms no personal paths.
- **Commits:** conventional, one per task, trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Publishing to npm is the USER's action — this plan stops at a publish-ready, `npm pack`-verified package.

---

## File Structure

New in the `claude-code-harness` repo:
- `package.json` — package manifest.
- `cli/index.js` — bin dispatcher (init / update / merge-settings / file-size-check / --version / --help).
- `cli/init.js` — download + install the `template/` payload (backup existing).
- `cli/update.js` — update with three-way merge.
- `cli/merge-settings.js` — deep-merge `settings.local.json`.
- `cli/protected-files.js` — merge/restore catalog (PHE file set) + helpers.
- `cli/claude-md-copy.js` — CLAUDE.md copy with backup + rollback.
- `cli/init-backup.test.js`, `cli/cli-hardening.test.js`, `cli/merge-settings.test.js` — tests.

Edited:
- `README.md` — add the npm install section.
- `template/.claude/skills/harness-init/SKILL.md` — verify line uses `npx claude-code-harness file-size-check`.

---

## Task 1: package.json + cli/index.js (dispatcher)

**Files:**
- Create: `package.json`, `cli/index.js`

**Interfaces:**
- Produces: the bin entry `claude-code-harness` → `cli/index.js`, routing `init`/`update`/`merge-settings`/`file-size-check`. `require('./init.js').main()` and `require('./update.js').main()` are called (defined in Tasks 2–3).

- [ ] **Step 1: Create `package.json`** with exactly this content:

```json
{
  "name": "claude-code-harness",
  "version": "1.0.0",
  "description": "The harness around Claude Code that makes it reliable — tested hooks, two-tier context, a PIV+E pipeline with an agile delivery layer, doc-grounded research reuse, and a vault-linked knowledge loop. Installs a hardened .claude/ payload.",
  "bin": {
    "claude-code-harness": "cli/index.js"
  },
  "keywords": ["claude", "claude-code", "harness", "agentic", "piv-loop", "context-engineering", "obsidian"],
  "author": "Cristian-Robert Iosef",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/cristian-robert/claude-code-harness.git"
  },
  "files": ["cli/", "template/", "docs/*.md", "README.md"],
  "scripts": {
    "test:init": "node cli/init-backup.test.js",
    "test:cli": "node cli/cli-hardening.test.js && node cli/merge-settings.test.js",
    "test:hooks": "node template/.claude/hooks/smoke-test.mjs",
    "test": "node cli/init-backup.test.js && node cli/cli-hardening.test.js && node cli/merge-settings.test.js && node template/.claude/hooks/smoke-test.mjs"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Create `cli/index.js`** by copying the AIDF `cli/index.js` verbatim, then applying these changes: keep the `init`/`update`/`merge-settings` cases as-is; change the `file-size-check` case to run the PHE ledger instead of a ported script; update the help text and banner to `claude-code-harness`. Full content:

```javascript
#!/usr/bin/env node

const command = process.argv[2];

switch (command) {
  case 'init':
    require('./init.js').main().catch(function (err) {
      console.error('Error: ' + err.message);
      process.exit(1);
    });
    break;
  case 'update':
    require('./update.js').main().catch(function (err) {
      console.error('Error: ' + err.message);
      process.exit(1);
    });
    break;
  case 'merge-settings': {
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      process.execPath,
      [require.resolve('./merge-settings.js'), ...process.argv.slice(3)],
      { stdio: 'inherit' }
    );
    process.exit(result.status === null ? 1 : result.status);
    break;
  }
  case 'file-size-check': {
    // PHE ships tools/context-ledger.mjs as the always-loaded-budget tool;
    // route the command to it (path is relative to the package root).
    const path = require('path');
    const { spawnSync } = require('child_process');
    const ledger = path.join(__dirname, '..', 'tools', 'context-ledger.mjs');
    const result = spawnSync(process.execPath, [ledger, ...process.argv.slice(3)], { stdio: 'inherit' });
    process.exit(result.status === null ? 1 : result.status);
    break;
  }
  case '--version':
  case '-v':
    console.log(require('../package.json').version);
    break;
  case '--help':
  case '-h':
  case undefined:
    console.log(`
claude-code-harness — the harness around Claude Code that makes it reliable.

Usage:
  npx claude-code-harness init             Install the harness payload into the current project
  npx claude-code-harness update           Update payload files, preserving customizations (three-way merge)
  npx claude-code-harness merge-settings   Deep-merge your .claude/settings.local.json with the framework version
  npx claude-code-harness file-size-check  Lint always-loaded context (CLAUDE.md, rules, skills) against budgets
  npx claude-code-harness --version        Show version
  npx claude-code-harness --help           Show this help

Then run /harness-init inside Claude Code to fit the payload to your project.
Docs: https://github.com/cristian-robert/claude-code-harness
    `);
    break;
  default:
    console.error('Unknown command: ' + command);
    console.log('Run "npx claude-code-harness --help" for usage information.');
    process.exit(1);
}
```

- [ ] **Step 3: Verify the dispatcher + manifest**

Run (cd `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering`):
```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
node cli/index.js --version   # expect: 1.0.0
node cli/index.js --help      # expect: claude-code-harness usage text
node cli/index.js file-size-check template   # expect: the context-ledger output (Status: OK ... < 2000)
```
Expected: version prints `1.0.0`; help shows `claude-code-harness`; `file-size-check template` runs the ledger clean.

- [ ] **Step 4: Commit**

`git -C <repo> add package.json cli/index.js && git commit` — message: `feat: package.json + cli dispatcher for claude-code-harness`.

---

## Task 2: cli/init.js + protected-files.js + claude-md-copy.js (install path)

**Files:**
- Create: `cli/init.js`, `cli/protected-files.js`, `cli/claude-md-copy.js`

**Interfaces:**
- Consumes: nothing prior.
- Produces: `require('./init.js').main()`, `backupAndCopy`, `__test_tmpPath` (used by index.js Task 1 + tests Task 4). `protected-files.js` exports `toProjectRelative`, `NEEDS_MERGE`, `NEEDS_RESTORE`, `FRAMEWORK_CLI_FILES`.

- [ ] **Step 1: Copy `cli/claude-md-copy.js` verbatim** from the AIDF source (it takes explicit paths, no layout assumptions):
`cp /Users/cristian-robertiosef/Dev/AIDevelopmentFramework-phe-v1/cli/claude-md-copy.js cli/claude-md-copy.js`

- [ ] **Step 2: Create `cli/protected-files.js`** — copy the AIDF file, then retarget the catalogs to PHE and empty the CLI-copy list. Full content:

```javascript
// Files that need LLM merge during re-init/update (project-specific content to preserve).
// Paths are relative to the PROJECT ROOT. The backup-everything strategy in init/update
// protects every file regardless; these are hints for the merge flow.
var NEEDS_MERGE = [
  'CLAUDE.md',
  '.claude/harness.json',
  '.claude/rules/frontend.md',
  '.claude/rules/backend.md',
  '.claude/settings.local.json',
  '.claude/skills/architecture-map/SKILL.md',
  '.claude/skills/debugging-this-repo/SKILL.md',
];

// Directories with project-populated content — always restore from backup on update.
var NEEDS_RESTORE = [
  'backlog',
  'sprints',
  'plans',
  'reports',
];

// CLI tools to copy into the target project. claude-code-harness ships none —
// merge-settings / file-size-check run via npx from the package, not from the project.
var FRAMEWORK_CLI_FILES = [];

function toProjectRelative(filePath, rootDir) {
  var path = require('path');
  var abs = path.resolve(filePath);
  var root = path.resolve(rootDir);
  return path.relative(root, abs).split(path.sep).join('/');
}

module.exports = {
  NEEDS_MERGE: NEEDS_MERGE,
  NEEDS_RESTORE: NEEDS_RESTORE,
  FRAMEWORK_CLI_FILES: FRAMEWORK_CLI_FILES,
  toProjectRelative: toProjectRelative,
};
```

- [ ] **Step 3: Create `cli/init.js`** — copy the AIDF `cli/init.js` verbatim, then apply these adaptations (everything else stays byte-identical, including `backupAndCopy`, symlink refusal, `settings.local.json` skip, `detectTechStack`, `getVersion`, `createInitMeta`, git-init offer, module.exports):

  1. **REPO constant** (line ~10): `const REPO = 'cristian-robert/claude-code-harness';`
  2. **`getLocalFallbackDir`** (line ~60-66): check the payload under `template/` —
     ```javascript
     function getLocalFallbackDir() {
       var frameworkDir = path.join(__dirname, '..');
       if (fs.existsSync(path.join(frameworkDir, 'template', '.claude'))) {
         return frameworkDir;
       }
       return null;
     }
     ```
  3. **Banner** (main(), lines ~237-240): replace the two `console.log` banner lines with:
     ```javascript
       console.log('  claude-code-harness');
       console.log('  The harness around Claude Code that makes it reliable.');
     ```
  4. **`.claude` install source** (line ~289): `path.join(sourceDir, 'template', '.claude')`.
  5. **CLAUDE.md source** (line ~296): `var claudeMdSource = path.join(sourceDir, 'template', 'CLAUDE.md');`
  6. **root config source** (line ~311): `var rcSrc = path.join(sourceDir, 'template', rootConfigFiles[rc]);`
  7. **DELETE the docs/ install block** (lines ~327-358) and the **docs/plans creation** (lines ~391-395) and the **FRAMEWORK_CLI_FILES copy loop** (lines ~360-389) — claude-code-harness installs only `.claude` + `CLAUDE.md` + `.mcp.json`/`.lsp.json`. (Keep the `FRAMEWORK_CLI_FILES` import line harmless, or drop it; the loop is gone.)
  8. **Summary block** (lines ~433-439): replace the AIDF file-list with PHE reality:
     ```javascript
       console.log('  .claude/skills/      pipeline + delivery + knowledge skills (/plan …/research)');
       console.log('  .claude/agents/      scout · code-reviewer · qa-evaluator · research-gatherer');
       console.log('  .claude/rules/       always-on core + paths-scoped domain rules');
       console.log('  .claude/hooks/       6 tested hooks (wired via .claude/settings.json)');
       console.log('  .claude/references/  on-demand references + vault-scaffold');
       console.log('  .mcp.json/.lsp.json  symbol navigation (codebase-search + language servers)');
     ```
  9. **Next steps** (lines ~442-453): replace both branches' body with the PHE next step:
     ```javascript
       console.log('Next steps:');
       console.log('  1. Open Claude Code in this project');
       console.log('  2. Run /harness-init — it fits the payload to your stack, arms the gate, and (optionally) scaffolds a vault');
       console.log('');
     ```
     (If files were backed up, additionally print: `console.log('  (existing files were backed up as .backup — reconcile any you had customized)');` before the blank line.)

- [ ] **Step 4: Local-fallback install gate** — prove init installs the payload from `template/`:

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
T=$(mktemp -d)
git -C "$T" init -q   # so init.js sees a git repo and skips the interactive git-init prompt
( cd "$T" && node /Users/cristian-robertiosef/Dev/perfectHarnessEngineering/cli/index.js init < /dev/null ) 2>&1 | tail -20
echo "--- installed tree ---"
ls "$T"/.claude "$T"/CLAUDE.md "$T"/.mcp.json "$T"/.lsp.json
test -d "$T/.claude/references/vault-scaffold" && echo "vault-scaffold shipped ✓" || echo "MISSING vault-scaffold"
test ! -e "$T/docs" && echo "docs NOT installed ✓ (correct)" || echo "docs wrongly installed"
rm -rf "$T"
```
Expected: `.claude/`, `CLAUDE.md`, `.mcp.json`, `.lsp.json` present; `vault-scaffold` shipped; no `docs/`. (Download will fail — repo isn't pushed yet — and it falls back to the local package. That is the intended path.)

- [ ] **Step 5: Commit** — `feat: init.js installs the template/ payload (backup, symlink-safe)`.

---

## Task 3: cli/update.js + cli/merge-settings.js (update path)

**Files:**
- Create: `cli/update.js`, `cli/merge-settings.js`

**Interfaces:**
- Consumes: `protected-files.js` (Task 2). Produces `require('./update.js').main()` (used by index.js).

- [ ] **Step 1: Copy `cli/merge-settings.js` verbatim** from AIDF, then rebrand only user-facing strings: any `ai-development-framework` / `AIDevelopmentFramework` in log/usage text → `claude-code-harness`. Its merge logic is layout-independent (operates on `.claude/settings*.json` paths). Do not change behavior.

- [ ] **Step 2: Create `cli/update.js`** — copy AIDF `cli/update.js`, then apply the SAME layout + identity adaptations as init.js: `REPO = 'cristian-robert/claude-code-harness'`; any payload source reads change from `sourceDir/.claude`, `sourceDir/CLAUDE.md`, `sourceDir/.mcp.json`, `sourceDir/.lsp.json` to the `sourceDir/template/...` equivalents; local-fallback check → `template/.claude`; drop docs/ and FRAMEWORK_CLI_FILES handling if present; rebrand banner/message strings to `claude-code-harness`. Preserve the three-way-merge + backup logic exactly. (Read the AIDF update.js to locate each payload-path read; apply the `template/` prefix identically to init.js.)

- [ ] **Step 3: Verify update path**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
node -e "require('./cli/update.js'); console.log('update.js requires clean')"
node cli/index.js merge-settings --help 2>&1 | head -5 || true
# Round-trip: init into temp, edit a tracked file, update, confirm merge/backup behavior
T=$(mktemp -d)
git -C "$T" init -q
( cd "$T" && node /Users/cristian-robertiosef/Dev/perfectHarnessEngineering/cli/index.js init < /dev/null ) >/dev/null 2>&1
echo "custom line" >> "$T/CLAUDE.md"
( cd "$T" && node /Users/cristian-robertiosef/Dev/perfectHarnessEngineering/cli/index.js update < /dev/null ) 2>&1 | tail -8
test -f "$T/CLAUDE.md.backup" && echo "update backed up CLAUDE.md ✓" || echo "no backup (check update semantics)"
rm -rf "$T"
```
Expected: `update.js` requires without error; the round-trip runs and backs up the customized file (three-way merge preserves user content per AIDF semantics).

- [ ] **Step 4: Commit** — `feat: update.js + merge-settings for claude-code-harness (template/ layout)`.

---

## Task 4: Tests (init-backup, cli-hardening, merge-settings)

**Files:**
- Create: `cli/init-backup.test.js`, `cli/cli-hardening.test.js`, `cli/merge-settings.test.js`

**Interfaces:**
- Consumes: init.js, protected-files.js, merge-settings.js.

- [ ] **Step 1: Copy the three test files** from AIDF `cli/` verbatim, then adapt their fixtures to the `template/` payload layout. The tests build a fake framework source dir and run `backupAndCopy` / init against it. Wherever a test creates the fake source's payload at `<src>/.claude`, `<src>/CLAUDE.md`, `<src>/.mcp.json`, `<src>/.lsp.json`, move it under `<src>/template/...` to match init.js's new source layout (Task 2). Any assertion referencing installed `docs/`, `docs/plans/`, or copied `cli/` tools must be removed (claude-code-harness no longer installs those). Rebrand any `ai-development-framework` strings. Do NOT weaken assertions about backup, symlink refusal, `settings.local.json` skip, or path-traversal safety.

- [ ] **Step 2: Run the full suite**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
npm test
```
Expected: all green — `init-backup`, `cli-hardening`, `merge-settings`, and `template/.claude/hooks/smoke-test.mjs` (62/62). Fix failures against the real behavior; never weaken a test to pass.

- [ ] **Step 3: Commit** — `test: port CLI tests to the template/ payload layout`.

---

## Task 5: README + harness-init verify line

**Files:**
- Modify: `README.md`, `template/.claude/skills/harness-init/SKILL.md`

- [ ] **Step 1: Add an Install section to `README.md`.** After the intro/first section, insert:

```markdown
## Install

```bash
# in your project directory
npx claude-code-harness init      # installs .claude/, CLAUDE.md, .mcp.json, .lsp.json (existing files backed up)
npx claude-code-harness update    # updates the payload, preserving your customizations (three-way merge)
```

Then open Claude Code and run **`/harness-init`** — it detects your stack, fills every `CLAUDE.md` placeholder, arms the stop gate, optionally scaffolds an Obsidian vault, and configures work tracking. Requires Node ≥18.
```

(Place it so it reads naturally; don't duplicate an existing install/adopt section — replace the old `cp`-based adopt instructions if present.)

- [ ] **Step 2: Point harness-init's budget check at the package command.** In `template/.claude/skills/harness-init/SKILL.md` VERIFY table, replace the ledger row's command `node <PHE>/tools/context-ledger.mjs .` with `npx claude-code-harness file-size-check` (keep the "paste the real output" expectation).

- [ ] **Step 3: Verify**

```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
grep -n "npx claude-code-harness" README.md template/.claude/skills/harness-init/SKILL.md
node tools/context-ledger.mjs template   # harness-init edit is body-only (disable-model-invocation) — confirm still clean
```
Expected: both files reference `npx claude-code-harness`; ledger clean.

- [ ] **Step 4: Commit** — `docs: README install section + harness-init budget command`.

---

## Task 6: End-to-end verification + publish dry-run

**Files:** none.

- [ ] **Step 1: Full test suite** — `cd <repo> && npm test` → all green (incl. 62/62 smoke).

- [ ] **Step 2: Clean-install proof** — `npx . init` into a fresh temp project ships the full payload, then that project's OWN gates pass:
```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
T=$(mktemp -d)
git -C "$T" init -q
( cd "$T" && node /Users/cristian-robertiosef/Dev/perfectHarnessEngineering/cli/index.js init < /dev/null ) >/dev/null 2>&1
node "$T/.claude/hooks/smoke-test.mjs" 2>&1 | tail -1        # expect all pass
ls "$T/.claude/skills/research" "$T/.claude/agents/research-gatherer.md" "$T/.claude/references/vault-scaffold/wiki/stack/_index.md"
rm -rf "$T"
```
Expected: installed project's smoke test passes; research skill, research-gatherer, and vault-scaffold all present in the install.

- [ ] **Step 3: Publish dry-run (no publish)** — confirm the tarball contents:
```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
npm pack --dry-run 2>&1 | grep -E 'npm notice|package size|filename' | head -40
```
Expected: the file list includes `cli/`, `template/` (with `.claude/`, `CLAUDE.md`, `.mcp.json`, `.lsp.json`, `references/vault-scaffold/`), `docs/*.md`, `README.md`, `package.json` — and NOTHING under `plans/`, `reports/`, `global/`, `loop/`, the coleam00 clones, or `docs/design/`.

- [ ] **Step 4: Leak scan the shipped tree**
```bash
cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering
grep -rnE '/Users/cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness|The Vault' cli/ template/ package.json 2>/dev/null || echo "✅ no personal content in shipped files"
```
Expected: nothing (or the ✅ line).

- [ ] **Step 5: Branch + tree** — `git -C <repo> status -sb` → on `feat/vault-research-reuse`, clean tree, all Phase-3 commits present.

## End-to-end verification (feature proof)

The package "works" when: `npm test` is green; `npx . init` into a scratch dir produces a project whose `.claude/hooks/smoke-test.mjs` passes and that contains the research skill + agent + vault-scaffold; `npm pack --dry-run` ships exactly the payload + CLI + docs and nothing internal; and the leak scan is clean. At that point `npm publish` (the user's action) would ship a working `npx claude-code-harness init`.

## Out of scope (Phase 3)

- Actually running `npm publish` — the user publishes when ready.
- Any change to the `ai-development-framework` package / its `feat/phe-payload-v1` branch — left untouched per the user's decision.
- Porting AIDF's `file-size-check.js` — replaced by routing `file-size-check` to `tools/context-ledger.mjs`.
- Installing `docs/` or CLI tools into consumer projects — they run via `npx`.
