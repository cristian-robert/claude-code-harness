const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const readline = require('readline');
const { toProjectRelative } = require('./protected-files');
const { copyClaudeMdWithBackup } = require('./claude-md-copy');
const { backupAndCopy, preserveBeforeOverwrite } = require('./backup-copy');
const { reconcileSettingsJson, capturePluginKeys, restorePluginKeys } = require('./merge-settings');
const { HARNESS_PROMPT, parseHarnessAnswer, writeHarnessTargets } = require('./harness-targets');
const { KNOWLEDGE_PROMPT, parseKnowledgeAnswer, writeKnowledgeConfig } = require('./knowledge-config');
const { emitCodexPayload, cleanupDroppedTargets } = require('./emit-codex');
const { migrateRenamedSkills } = require('./migrations');
const { installHarnessConfig, readHarnessConfig } = require('./harness-config');
const { initCapabilitiesFlow } = require('./capabilities');

const REPO = 'cristian-robert/claude-code-harness';
const BRANCH = 'main';
const TARBALL_URL = 'https://github.com/' + REPO + '/archive/refs/heads/' + BRANCH + '.tar.gz';

// Two input mechanisms, chosen once per process by ask() below, based on
// whether stdin is a TTY:
//
// - TTY (a human typing): today's readline behaviour, unchanged. Lazy-init
//   so requiring this module for tests doesn't open stdin.
// - Piped/redirected (not a TTY): readline is unsafe here. main() asks
//   MULTIPLE questions in sequence (harness, then knowledge, then maybe git-init).
//   If a script pipes every answer in one chunk
//   (`printf '1\n/path\n' | node cli/init.js`), readline delivers line 1 to
//   the first ask(), then the pipe hits EOF before the second ask()'s
//   rl.question() callback ever fires -- that `await` never resolves, the
//   event loop drains with nothing left to do, and the process exits 0
//   having installed nothing. Fix: read ALL of stdin to EOF up front and
//   hand out one queued line per ask() call (createPipedAsker below).
//   Running out of queued answers is a loud, non-zero failure -- never a
//   silent no-op and never a hang.
var _rl = null;
function getRl() {
  if (!_rl) {
    _rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return _rl;
}

function askTTY(question) {
  var rl = getRl();
  return new Promise(function (resolve) {
    rl.question(question, resolve);
  });
}

// Splits pre-read stdin text into a line queue. A trailing '\n' produces one
// trailing empty-string artifact from String#split -- that's the terminator
// of the last real line, not an extra blank answer, so it's dropped. A blank
// line in the MIDDLE of the input (a genuine empty answer) is kept.
function splitStdinLines(text) {
  if (!text) return [];
  var lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

// Pure-ish and unit-testable in isolation (see init-input.test.js): takes the
// full stdin text and returns an asker whose ask(prompt) shifts the next
// queued line, writing the prompt (and echoing the answer) the way a human
// typing at a TTY would see. Throws -- does not hang, does not silently
// return "" -- once the queue is exhausted, per the module comment above.
function createPipedAsker(stdinText) {
  var queue = splitStdinLines(stdinText);
  return {
    ask: function (prompt) {
      process.stdout.write(prompt);
      if (queue.length === 0) {
        throw new Error(
          'perfect-harness-engineering init: ran out of piped input (needed an answer to a prompt). ' +
          'Provide all answers, or run interactively.'
        );
      }
      var line = queue.shift();
      console.log(line);
      return line;
    },
  };
}

var _pipedAsker = null;
function ask(question) {
  if (process.stdin.isTTY) {
    return askTTY(question);
  }
  if (!_pipedAsker) {
    _pipedAsker = createPipedAsker(fs.readFileSync(0, 'utf-8'));
  }
  return _pipedAsker.ask(question);
}

// Releases whatever input mechanism was actually used. The piped path never
// creates a readline interface (see ask() above), so this is a no-op there --
// calling getRl() here instead would create one just to close it.
function closeAsk() {
  if (_rl) {
    _rl.close();
  }
}

// Collision-resistant temp path (UUID-based). Replaces Date.now() which
// collided when two CLI runs started in the same millisecond.
function __test_tmpPath(prefix) {
  var p = prefix || 'ai-framework-';
  return path.join(os.tmpdir(), p + crypto.randomUUID());
}

function copyFileSimple(srcPath, destPath) {
  var destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(srcPath, destPath);
}

function downloadAndExtract(tmpDir) {
  console.log('Downloading latest framework from GitHub...');
  try {
    execFileSync('curl', ['-sL', TARBALL_URL, '-o', path.join(tmpDir, 'framework.tar.gz')]);
    execFileSync('tar', ['-xzf', path.join(tmpDir, 'framework.tar.gz'), '-C', tmpDir, '--strip-components=1']);
    return true;
  } catch (err) {
    console.error('Download failed: ' + err.message);
    return false;
  }
}

function getLocalFallbackDir() {
  var frameworkDir = path.join(__dirname, '..');
  if (fs.existsSync(path.join(frameworkDir, 'template', '.claude'))) {
    return frameworkDir;
  }
  return null;
}

function cleanupTmpDir(tmpDir) {
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (e) {
    // Best-effort cleanup
  }
}

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

function detectTechStack() {
  var detected = [];
  // Guard package.json access so detection never crashes the installer on
  // projects without package.json (Python, Go, Rust) and emits an actionable
  // warning on malformed JSON instead of silently swallowing the error.
  if (fs.existsSync('package.json')) {
    var raw = null;
    try {
      raw = fs.readFileSync('package.json', 'utf-8');
    } catch (readErr) {
      console.warn('Warning: package.json exists but could not be read: ' + readErr.message);
    }
    if (raw !== null) {
      try {
        var pkg = JSON.parse(raw);
        var deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
        for (var depKey in DEP_SIGNALS) {
          if (deps[depKey] && detected.indexOf(DEP_SIGNALS[depKey]) === -1) {
            detected.push(DEP_SIGNALS[depKey]);
          }
        }
      } catch (parseErr) {
        console.warn('Warning: package.json is malformed; skipping tech-stack detection (' + parseErr.message + ')');
      }
    }
  }

  if (fs.existsSync('requirements.txt') || fs.existsSync('pyproject.toml')) {
    detected.push('Python');
    try {
      var reqContent = '';
      if (fs.existsSync('requirements.txt')) {
        reqContent = fs.readFileSync('requirements.txt', 'utf-8');
      } else if (fs.existsSync('pyproject.toml')) {
        reqContent = fs.readFileSync('pyproject.toml', 'utf-8');
      }
      for (var pyKey in PY_SIGNALS) {
        if (reqContent.includes(pyKey)) detected.push(PY_SIGNALS[pyKey]);
      }
    } catch (e) {
      // ignore
    }
  }
  if (fs.existsSync('go.mod')) detected.push('Go');
  if (fs.existsSync('Cargo.toml')) detected.push('Rust');

  return detected;
}

// Get version from a package.json file, returns null if not found.
// Distinguishes "missing" from "malformed" so malformed files produce a warning
// (easier to diagnose) without crashing the installer.
function getVersion(dir) {
  var pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    var pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || null;
  } catch (e) {
    console.warn('Warning: could not parse ' + pkgPath + ' (' + e.message + ')');
    return null;
  }
}

// Whether init should merge a just-backed-up settings.json as the USER's pre-PHE
// config. True ONLY on genuine first adoption: a settings.json was backed up this
// run AND PHE was not already installed. Re-running init on an already-PHE project
// backs up PHE's OWN settings.json, which must not be treated as user content.
function shouldMergeUserSettings(pheAlreadyInstalled, backedUpFiles) {
  return !pheAlreadyInstalled && backedUpFiles.indexOf('.claude/settings.json') !== -1;
}

// Write init metadata for /harness-init reconcile (lists backed-up files)
function createInitMeta(targetDir, previousVersion, newVersion, backedUpFiles) {
  var metaDir = path.join(targetDir, '.claude');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  var meta = {
    timestamp: new Date().toISOString(),
    previousVersion: previousVersion || 'unknown',
    newVersion: newVersion || 'unknown',
    backedUpFiles: backedUpFiles,
  };
  fs.writeFileSync(
    path.join(metaDir, '.init-meta.json'),
    JSON.stringify(meta, null, 2)
  );
}

async function main() {
  console.log('');
  console.log('  perfect-harness-engineering');
  console.log('  The harness around Claude Code that makes it reliable.');
  console.log('');

  var targetDir = process.cwd();
  var hasGit = fs.existsSync('.git');
  var hasExisting = fs.existsSync('.claude') || fs.existsSync('CLAUDE.md');

  // Capture BEFORE the copy whether PHE is already installed here. A settings.json
  // this run backs up is the user's pre-PHE config ONLY on genuine first adoption;
  // re-running init on an already-PHE project would back up PHE's OWN settings.json,
  // which must never be merged as "user content" (it would resurrect framework-
  // removed hooks/permissions). PHE's signature: harness.json / .init-meta.json / marker.
  var claudeDir = path.join(targetDir, '.claude');
  var pheAlreadyInstalled =
    fs.existsSync(path.join(claudeDir, 'harness.json')) ||
    fs.existsSync(path.join(claudeDir, '.init-meta.json')) ||
    fs.existsSync(path.join(claudeDir, '.settings-user-origin'));

  // Detect tech stack
  var stack = detectTechStack();
  if (stack.length > 0) {
    console.log('  Detected tech stack: ' + stack.join(', '));
    console.log('');
  }

  // Which harness(es)? Asked once, at init; recorded in .claude/harness.json so
  // `update` re-emits the same payload without prompting.
  var targets = null;
  while (targets === null) {
    var answer = await ask('\n' + HARNESS_PROMPT);
    targets = parseHarnessAnswer(answer);
    if (targets === null) {
      console.log('  Please answer 1, 2, or 3 (or claude / codex / both).');
    }
  }
  console.log('  Harness: ' + targets.join(' + '));
  console.log('');

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

  // Get previous version before overwriting
  var previousVersion = getVersion(targetDir);

  // Validate an EXISTING harness.json BEFORE anything is downloaded or written. On a
  // re-init, installHarnessConfig merges it and backupAndCopy mutates the rest of
  // .claude/ — a malformed file discovered late would leave a half-applied re-init. Run
  // this FIRST, ahead of even the temp-dir download, so a bad file stops the run with
  // nothing created and nothing to clean up. Parity with update.js's preflight. A fresh
  // project has no file: readHarnessConfig returns null.
  try {
    readHarnessConfig(targetDir);
  } catch (cfgErr) {
    console.error(cfgErr.message);
    closeAsk();
    process.exit(1);
    return;
  }

  // Download framework to temp dir. UUID-based to avoid collisions between
  // parallel CLI runs (Date.now() has millisecond granularity).
  var tmpDir = __test_tmpPath('ai-framework-');
  fs.mkdirSync(tmpDir, { recursive: true });

  var sourceDir = null;
  var downloaded = downloadAndExtract(tmpDir);
  if (downloaded) {
    sourceDir = tmpDir;
  } else {
    var fallback = getLocalFallbackDir();
    if (fallback) {
      console.log('Using local package as fallback...');
      sourceDir = fallback;
    } else {
      console.error('No framework source available. Check your internet connection.');
      cleanupTmpDir(tmpDir);
      closeAsk();
      process.exit(1);
    }
  }

  var newVersion = getVersion(sourceDir);

  if (hasExisting) {
    console.log('Existing configuration detected. All files will be backed up as .backup');
    console.log('before installing new framework versions.');
    console.log('');
  }

  // From here the install writes to disk — run it under try/finally so the temp
  // dir is always cleaned up even if a copy throws (parity with update.js).
  try {
  // Install .claude/ with backup
  console.log('Installing framework...');
  // Capture enabledPlugins/extraKnownMarketplaces BEFORE the copy — Claude Code
  // writes these into .claude/settings.json via `claude plugin install
  // --scope project`, and backupAndCopy only preserves the FIRST backup ever
  // taken, so on a re-init the template would clobber them with no re-union.
  // restorePluginKeys below puts them back after the copy + reconcile.
  var capturedPluginKeys = capturePluginKeys(targetDir);
  var stats = backupAndCopy(
    path.join(sourceDir, 'template', '.claude'),
    path.join(targetDir, '.claude'),
    targetDir
  );

  // Install harness.json (skipped by the copy above): a fresh project gets the
  // template's file; a RE-init MERGES — the user's existing keys win, the template
  // only contributes newly-shipped keys. Parity with update.js, so init and update
  // treat user config identically instead of one preserving and one resetting it.
  var harnessDelta = installHarnessConfig(
    targetDir,
    path.join(sourceDir, 'template', '.claude', 'harness.json')
  );
  stats.created += harnessDelta.created;
  stats.updated += harnessDelta.updated;

  // Persist the harness choice IMMEDIATELY after — that install left harness.json
  // with no `harness` key (neither the template nor a legacy user file has one).
  // Recording it right here, before anything else can throw (EACCES in the
  // instruction-file copy, a settings-merge failure, ...), closes the crash
  // window where a project's harness choice could be silently lost: a later
  // `update` would then print "No harness recorded — assuming Claude Code"
  // and silently drop Codex.
  writeHarnessTargets(targetDir, targets);

  // Retire framework skills the payload has renamed (RE-init over an existing
  // install has the same additive-copy gap as update: the old `plan`/`review`
  // dirs would survive and keep shadowing Claude Code built-ins). Runs before
  // the Codex emit below so .agents/skills/ never re-derives the orphan.
  var initMigration = migrateRenamedSkills(targetDir);
  for (var mgI = 0; mgI < initMigration.messages.length; mgI++) {
    console.log(initMigration.messages[mgI]);
  }
  writeKnowledgeConfig(targetDir, knowledge);

  // Instructions: AGENTS.md is canonical and installed for EVERY target (Codex
  // reads it directly). CLAUDE.md is a thin `@AGENTS.md` import shim and is only
  // installed when Claude Code is a target. Both use the backup+rollback copier.
  var instructionFiles = [{ name: 'AGENTS.md' }];
  if (targets.indexOf('claude') !== -1) instructionFiles.push({ name: 'CLAUDE.md' });

  for (var ifI = 0; ifI < instructionFiles.length; ifI++) {
    var ifName = instructionFiles[ifI].name;
    var ifDelta = copyClaudeMdWithBackup(
      path.join(sourceDir, 'template', ifName),
      path.join(targetDir, ifName),
      { backupLabel: ifName }
    );
    stats.created += ifDelta.created;
    stats.updated += ifDelta.updated;
    stats.backedUp += ifDelta.backedUp;
    for (var bi = 0; bi < ifDelta.backedUpFiles.length; bi++) {
      stats.backedUpFiles.push(ifDelta.backedUpFiles[bi]);
    }
  }

  // Install root symbol-search config: .mcp.json (codebase-search MCP) and
  // .lsp.json (language-server diagnostics). Back up existing ones first;
  // /harness-init prunes them to the project's actual stack.
  var rootConfigFiles = ['.mcp.json', '.lsp.json'];
  for (var rc = 0; rc < rootConfigFiles.length; rc++) {
    var rcSrc = path.join(sourceDir, 'template', rootConfigFiles[rc]);
    if (!fs.existsSync(rcSrc)) continue;
    var rcDest = path.join(targetDir, rootConfigFiles[rc]);
    var rcExisted = fs.existsSync(rcDest);
    if (rcExisted) {
      // Same preserve-or-rotate semantics as the .claude/ copy above (see
      // backup-copy.js): a re-init must not overwrite a user-edited .mcp.json
      // whose content exists nowhere else just because a .backup is present.
      var rcPreserved = preserveBeforeOverwrite(
        rcDest, rcSrc, toProjectRelative(rcDest, targetDir)
      );
      if (rcPreserved.backedUp) {
        stats.backedUp++;
        stats.backedUpFiles.push(rcPreserved.recordName);
      }
    }
    fs.copyFileSync(rcSrc, rcDest);
    if (rcExisted) { stats.updated++; } else { stats.created++; }
  }

  // Install examples/ (frontend/backend CLAUDE.md samples). /harness-init copies
  // the relevant one into real subdirs and deletes the rest — it can't do that if
  // the dir was never installed.
  var examplesSrc = path.join(sourceDir, 'template', 'examples');
  if (fs.existsSync(examplesSrc)) {
    var exStats = backupAndCopy(examplesSrc, path.join(targetDir, 'examples'), targetDir);
    stats.created += exStats.created;
    stats.updated += exStats.updated;
    stats.backedUp += exStats.backedUp;
    for (var ei = 0; ei < exStats.backedUpFiles.length; ei++) {
      stats.backedUpFiles.push(exStats.backedUpFiles[ei]);
    }
  }

  // Reconcile settings.json: if the user had a pre-existing team settings.json
  // (now saved as settings.json.backup), deterministically union their hooks +
  // permissions back into the freshly-installed framework settings.json so the
  // guardrails they already had keep firing alongside PHE's. init is PHE's first
  // contact with the project, so a settings.json backed up HERE is genuinely the
  // user's — flag it so the merge runs and marks the backup user-origin for
  // future updates. CLAUDE.md/rules need judgment and are reconciled by
  // /harness-init instead.
  var settingsReconcile = reconcileSettingsJson(targetDir, {
    userBackupJustCreated: shouldMergeUserSettings(pheAlreadyInstalled, stats.backedUpFiles),
  });
  if (settingsReconcile.merged) {
    console.log('Merged your existing .claude/settings.json (hooks + permissions) with the framework version.');
  } else if (settingsReconcile.error) {
    console.warn('Could not merge your existing settings.json (' + settingsReconcile.error + '); the framework version is active and yours is at .claude/settings.json.backup.');
  }

  // Restore the plugin keys captured before the copy (see the capturePluginKeys
  // call above).
  restorePluginKeys(targetDir, capturedPluginKeys);

  // Resolve tier-`required` capabilities — the one approval question. Fail-open
  // twice over: the flow catches its own errors, and this catch guarantees a
  // resolver bug can never kill init (spec: Failure handling).
  try {
    await initCapabilitiesFlow({ targetDir: targetDir, targets: targets, tty: !!process.stdin.isTTY, askFn: ask, log: console.log });
  } catch (e) {
    console.log('Capabilities: skipped (' + e.message + ')');
  }

  // Derive the Codex tree from the canonical .claude/ payload.
  var codexCounts = null;
  if (targets.indexOf('codex') !== -1) {
    codexCounts = emitCodexPayload(targetDir);
    console.log('Emitted Codex payload: ' + codexCounts.skills + ' skills -> .agents/skills/, ' +
      codexCounts.agents + ' agents -> .codex/agents/');
  }

  // A re-run that DROPPED a target (init(both) -> init(claude), or the
  // symmetric init(both) -> init(codex)) must not leave that target's
  // generated tree behind, stale forever — same point as the conditional
  // emit above.
  var cleanupMsg = cleanupDroppedTargets(targetDir, targets);
  if (cleanupMsg) console.log(cleanupMsg);

  // Create init metadata if files were backed up
  if (stats.backedUp > 0) {
    createInitMeta(targetDir, previousVersion, newVersion, stats.backedUpFiles);
  }

  // Init git if needed. When the user explicitly opts in, a failure is fatal —
  // silently continuing would leave them with a non-git project while the
  // framework's workflow (branch naming, /ship, /evolve) assumes git works.
  if (!hasGit) {
    console.log('');
    var initGit = await ask('No git repo found. Initialize one? (yes/no): ');
    if (initGit.toLowerCase() === 'yes' || initGit.toLowerCase() === 'y') {
      try {
        execFileSync('git', ['init']);
        execFileSync('git', ['branch', '-m', 'main']);
        console.log('Git repository initialized.');
      } catch (e) {
        console.error('Could not initialize git: ' + e.message);
        console.error('You explicitly opted in to git init, but it failed. Aborting.');
        cleanupTmpDir(tmpDir);
        closeAsk();
        process.exit(1);
      }
    }
  }

  // Summary
  console.log('');
  console.log('Setup complete!');
  console.log('');
  console.log('  Created:   ' + stats.created + ' files');
  console.log('  Updated:   ' + stats.updated + ' files');
  if (stats.backedUp > 0) {
    console.log('  Backed up: ' + stats.backedUp + ' files (saved as .backup)');
  }
  console.log('');
  console.log('  .claude/skills/      pipeline + delivery + knowledge skills (/plan-work …/research)');
  console.log('  .claude/agents/      scout · code-reviewer · qa-evaluator · research-gatherer · architect-agent');
  console.log('  .claude/rules/       always-on core + paths-scoped domain rules');
  console.log('  .claude/hooks/       6 tested hooks (wired via .claude/settings.json)');
  console.log('  .claude/references/  on-demand references + knowledge-base-scaffold + vault-scaffold');
  console.log('  .mcp.json/.lsp.json  symbol navigation (codebase-search + language servers)');
  console.log('  .claude/capabilities.json  declared plugin/marketplace needs (resolve later: npx perfect-harness-engineering capabilities)');
  console.log('');

  console.log('Next steps:');
  if (targets.indexOf('claude') !== -1) {
    console.log('  1. Open Claude Code in this project');
    console.log('  2. Run /harness-init — it fits the payload to your stack, arms the gate, and scaffolds ./knowledge-base/');
  }
  if (targets.indexOf('codex') !== -1) {
    console.log('  Codex: instructions are in AGENTS.md. Run $harness-init in Codex — it fits the payload to your stack and arms the gate.');
    console.log('  Pipeline skills are invocable as $plan-work, $implement, $validate, $review-branch.');
    console.log('  .agents/skills/ and .codex/ are GENERATED from .claude/ — after $harness-init (or any later hand-edit of .claude/), run `npx perfect-harness-engineering emit` to push the changes into the Codex tree. `update` is NOT a substitute — it reverts .claude/ to the framework template before re-emitting.');
    console.log('  Enforcement hooks are not wired for Codex yet (guidance-only).');
  }
  if (stats.backedUp > 0) {
    console.log('  (existing files were backed up as .backup — reconcile any you had customized)');
  }
  console.log('  Knowledge: /harness-init scaffolds ./knowledge-base/ from ' +
    '.claude/references/knowledge-base-scaffold/ and points the architect agent at it.' +
    (knowledge.mode === 'existing'
      ? ' Shared store ' + knowledge.sharedPath + ' keeps evergreen wiki/ + agent-kb/ only.'
      : ''));
  console.log('');

  if (fs.existsSync(path.join(targetDir, '.idea'))) {
    console.log('IntelliJ IDEA detected (.idea/):');
    console.log('  Connect your database in IDEA (Database tool window) so the agent can run');
    console.log('  SQL through the JetBrains MCP "idea" tools instead of CLI clients.');
    console.log('  Once connected, tell Claude "I connected the database via IDEA" and it');
    console.log('  will record a Database Access section in CLAUDE.md.');
    console.log('');
  }

  } finally {
    cleanupTmpDir(tmpDir);
    closeAsk();
  }
}

// Export for tests and other CLI entry points. Only run main() when invoked
// directly (`node cli/init.js`), NOT when required from a test file — which
// would otherwise install the framework against the tester's cwd.
module.exports = {
  backupAndCopy: backupAndCopy,
  __test_tmpPath: __test_tmpPath,
  shouldMergeUserSettings: shouldMergeUserSettings,
  createPipedAsker: createPipedAsker,
  main: main,
  detectTechStack: detectTechStack,
  STACK_SIGNALS: STACK_SIGNALS,
};

if (require.main === module) {
  main().catch(function (err) {
    console.error('Error: ' + err.message);
    process.exit(1);
  });
}
