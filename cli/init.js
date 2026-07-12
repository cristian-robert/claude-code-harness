const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const readline = require('readline');
const { toProjectRelative } = require('./protected-files');
const { copyClaudeMdWithBackup } = require('./claude-md-copy');
const { reconcileSettingsJson } = require('./merge-settings');
const { HARNESS_PROMPT, parseHarnessAnswer, writeHarnessTargets } = require('./harness-targets');
const { VAULT_PROMPT, parseVaultAnswer, writeVaultConfig } = require('./vault-config');
const { emitCodexPayload, cleanupDroppedTargets } = require('./emit-codex');

const REPO = 'cristian-robert/claude-code-harness';
const BRANCH = 'main';
const TARBALL_URL = 'https://github.com/' + REPO + '/archive/refs/heads/' + BRANCH + '.tar.gz';

// Two input mechanisms, chosen once per process by ask() below, based on
// whether stdin is a TTY:
//
// - TTY (a human typing): today's readline behaviour, unchanged. Lazy-init
//   so requiring this module for tests doesn't open stdin.
// - Piped/redirected (not a TTY): readline is unsafe here. main() asks
//   MULTIPLE questions in sequence (harness, then vault, then maybe git-init).
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
        if (deps['next']) detected.push('Next.js');
        if (deps['react']) detected.push('React');
        if (deps['vue']) detected.push('Vue');
        if (deps['svelte'] || deps['@sveltejs/kit']) detected.push('Svelte');
        if (deps['express']) detected.push('Express');
        if (deps['@nestjs/core']) detected.push('NestJS');
        if (deps['expo']) detected.push('Expo');
        if (deps['@supabase/supabase-js']) detected.push('Supabase');
        if (deps['tailwindcss']) detected.push('Tailwind');
        if (deps['stripe']) detected.push('Stripe');
        if (deps['prisma'] || deps['@prisma/client']) detected.push('Prisma');
        if (deps['drizzle-orm']) detected.push('Drizzle');
        if (deps['mongoose']) detected.push('MongoDB/Mongoose');
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
      if (reqContent.includes('fastapi')) detected.push('FastAPI');
      if (reqContent.includes('django')) detected.push('Django');
      if (reqContent.includes('flask')) detected.push('Flask');
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

// Back up every existing file, then copy source over it.
// Returns { created, updated, backedUp, backedUpFiles[] }
function backupAndCopy(sourceDir, targetDir, projectRoot) {
  var stats = { created: 0, updated: 0, backedUp: 0, backedUpFiles: [] };

  function copy(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    var entries = fs.readdirSync(src, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var srcPath = path.join(src, entry.name);
      var destPath = path.join(dest, entry.name);

      // Refuse to follow symlinks. A malicious or accidental symlink in the
      // source tree (e.g. inside an extracted tarball) could otherwise cause
      // us to traverse into /etc, $HOME, or other directories outside the
      // intended scope. Dirent.isSymbolicLink() reports the link itself
      // without following it — no extra lstat needed.
      if (entry.isSymbolicLink()) {
        continue;
      }

      // Never ship/overwrite personal machine-local settings. Team settings
      // live in .claude/settings.json; settings.local.json is the consumer's.
      if (entry.name === 'settings.local.json') {
        continue;
      }

      if (entry.isDirectory()) {
        copy(srcPath, destPath);
      } else if (entry.isFile()) {
        var destExists = fs.existsSync(destPath);

        if (destExists) {
          // Back up the existing file — only if no backup exists yet
          // (preserves original user content on double-init/update)
          var backupPath = destPath + '.backup';
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(destPath, backupPath);
            stats.backedUp++;
            var relPath = toProjectRelative(destPath, projectRoot);
            stats.backedUpFiles.push(relPath);
          }
        }

        // Copy new framework file
        var destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(srcPath, destPath);

        if (destExists) {
          stats.updated++;
        } else {
          stats.created++;
        }
      }
      // Skip special files (sockets, devices, FIFOs) silently.
    }
  }

  copy(sourceDir, targetDir);
  return stats;
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

  // Get previous version before overwriting
  var previousVersion = getVersion(targetDir);

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
  var stats = backupAndCopy(
    path.join(sourceDir, 'template', '.claude'),
    path.join(targetDir, '.claude'),
    targetDir
  );

  // Persist the harness choice IMMEDIATELY after the .claude/ copy — that
  // copy just installed the framework's harness.json (no `harness` key).
  // Recording it right here, before anything else can throw (EACCES in the
  // instruction-file copy, a settings-merge failure, ...), closes the crash
  // window where a project's harness choice could be silently lost: a later
  // `update` would then print "No harness recorded — assuming Claude Code"
  // and silently drop Codex.
  writeHarnessTargets(targetDir, targets);
  writeVaultConfig(targetDir, vault);

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
      var rcBackup = rcDest + '.backup';
      if (!fs.existsSync(rcBackup)) {
        fs.copyFileSync(rcDest, rcBackup);
        stats.backedUp++;
        stats.backedUpFiles.push(toProjectRelative(rcDest, targetDir));
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
  console.log('  .claude/skills/      pipeline + delivery + knowledge skills (/plan …/research)');
  console.log('  .claude/agents/      scout · code-reviewer · qa-evaluator · research-gatherer');
  console.log('  .claude/rules/       always-on core + paths-scoped domain rules');
  console.log('  .claude/hooks/       6 tested hooks (wired via .claude/settings.json)');
  console.log('  .claude/references/  on-demand references + vault-scaffold');
  console.log('  .mcp.json/.lsp.json  symbol navigation (codebase-search + language servers)');
  console.log('');

  console.log('Next steps:');
  if (targets.indexOf('claude') !== -1) {
    console.log('  1. Open Claude Code in this project');
    console.log('  2. Run /harness-init — it fits the payload to your stack, arms the gate, and (optionally) scaffolds a vault');
  }
  if (targets.indexOf('codex') !== -1) {
    console.log('  Codex: instructions are in AGENTS.md. Run $harness-init in Codex — it fits the payload to your stack and arms the gate.');
    console.log('  Pipeline skills are invocable as $plan, $implement, $validate, $review.');
    console.log('  .agents/skills/ and .codex/ are GENERATED from .claude/ — after $harness-init (or any later hand-edit of .claude/), run `npx perfect-harness-engineering emit` to push the changes into the Codex tree. `update` is NOT a substitute — it reverts .claude/ to the framework template before re-emitting.');
    console.log('  Enforcement hooks are not wired for Codex yet (guidance-only).');
  }
  if (stats.backedUp > 0) {
    console.log('  (existing files were backed up as .backup — reconcile any you had customized)');
  }
  if (vault.mode === 'scaffold' || vault.mode === 'existing') {
    console.log('  Vault: /harness-init will ' + (vault.mode === 'scaffold' ? 'scaffold it and ' : '') +
      'wire the pointer block and point the architect agent at projects/<name>/.');
  }
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
};

if (require.main === module) {
  main().catch(function (err) {
    console.error('Error: ' + err.message);
    process.exit(1);
  });
}
