const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const readline = require('readline');
const { toProjectRelative } = require('./protected-files');
const { copyClaudeMdWithBackup } = require('./claude-md-copy');
const { reconcileSettingsJson } = require('./merge-settings');
const { readHarnessTargets, writeHarnessTargets } = require('./harness-targets');
const { readHarnessConfig, installHarnessConfig } = require('./harness-config');
const { emitCodexPayload, cleanupDroppedTargets } = require('./emit-codex');

const REPO = 'cristian-robert/claude-code-harness';
const BRANCH = 'main';
const TARBALL_URL = 'https://github.com/' + REPO + '/archive/refs/heads/' + BRANCH + '.tar.gz';

// Lazy-init readline so requiring this module for tests doesn't open stdin.
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
function closeRl() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
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

function getVersion(dir) {
  try {
    var pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    return pkg.version || null;
  } catch (e) {
    return null;
  }
}

function getLocalFallbackDir() {
  var frameworkDir = path.join(__dirname, '..');
  if (fs.existsSync(path.join(frameworkDir, 'template', '.claude'))) {
    return frameworkDir;
  }
  return null;
}

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

      // Refuse to traverse symlinks — a malicious or accidental link could
      // otherwise redirect copy/backup into the user's home directory.
      if (entry.isSymbolicLink()) {
        continue;
      }

      // Never ship/overwrite personal machine-local settings (parity with
      // init.js — matters on the local-fallback source path).
      if (entry.name === 'settings.local.json') {
        continue;
      }

      // harness.json is USER CONFIG, not template content — it holds the stop gate,
      // the protected base branch, work tracking and the model map. Copying the
      // template over it is what destroyed all three (see harness-config.js);
      // installHarnessConfig below installs or merges it instead. Never copied here,
      // so the user's file is never even briefly in a wiped state.
      if (entry.name === 'harness.json') {
        continue;
      }

      if (entry.isDirectory()) {
        copy(srcPath, destPath);
      } else if (entry.isFile()) {
        var destExists = fs.existsSync(destPath);

        if (destExists) {
          // Only create backup if one doesn't already exist (preserve original)
          var backupPath = destPath + '.backup';
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(destPath, backupPath);
            stats.backedUp++;
            var relPath = toProjectRelative(destPath, projectRoot);
            stats.backedUpFiles.push(relPath);
          }
        }

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
      // Skip special files silently.
    }
  }

  copy(sourceDir, targetDir);
  return stats;
}

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
  console.log('  perfect-harness-engineering — Update');
  console.log('');

  if (!fs.existsSync('.claude')) {
    console.error('No .claude/ directory found. Run "npx perfect-harness-engineering init" first.');
    process.exit(1);
  }

  var projectRoot = process.cwd();
  var previousVersion = getVersion(projectRoot);

  // Validate .claude/harness.json BEFORE anything is downloaded or written. It is the
  // user's config (stop gate, protected base branch, work tracking, model map), and the
  // update merges INTO it — so a file we cannot parse has to stop the run here, with
  // nothing touched, rather than be silently replaced by the template's defaults. That
  // replacement is the worst outcome available: it disarms the stop gate without a word.
  try {
    readHarnessConfig(projectRoot);
  } catch (cfgErr) {
    console.error(cfgErr.message);
    process.exit(1);
  }

  // Non-interactive: the harness choice was made at init. A project installed
  // before multi-harness support has no `harness` key — it is Claude-only.
  var targets = readHarnessTargets(projectRoot);
  if (targets === null) {
    targets = ['claude'];
    console.log('No harness recorded — assuming Claude Code. Re-run `init` to add Codex.');
  }
  console.log('Harness: ' + targets.join(' + '));

  // UUID-based tmp dir — avoids collisions when two update runs start in the
  // same millisecond (Date.now() has millisecond granularity).
  var tmpDir = path.join(os.tmpdir(), 'ai-framework-update-' + crypto.randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log('Downloading latest framework from GitHub...');

  var sourceDir = null;
  var downloaded = false;
  try {
    execFileSync('curl', ['-sL', TARBALL_URL, '-o', path.join(tmpDir, 'framework.tar.gz')]);
    execFileSync('tar', ['-xzf', path.join(tmpDir, 'framework.tar.gz'), '-C', tmpDir, '--strip-components=1']);
    sourceDir = tmpDir;
    downloaded = true;
  } catch (dlErr) {
    console.error('Download failed: ' + dlErr.message);
    // Clean up the partially-populated tmpDir before falling back. Otherwise
    // a half-extracted tarball could pollute future runs or confuse callers
    // that probe the same directory.
    cleanupTmpDir(tmpDir);
    var fallback = getLocalFallbackDir();
    if (fallback) {
      console.log('Using local package as fallback...');
      sourceDir = fallback;
    } else {
      console.error('No framework source available. Check your internet connection.');
      closeRl();
      process.exit(1);
    }
  }

  try {
    var newVersion = getVersion(sourceDir);

    console.log('');
    console.log('All existing files will be backed up as .backup before updating.');
    console.log('Run /harness-init after update to reconcile your project configuration.');
    console.log('');

    // Update .claude/ with backup
    console.log('Updating .claude/ ...');
    var stats = backupAndCopy(
      path.join(sourceDir, 'template', '.claude'),
      path.join(projectRoot, '.claude'),
      projectRoot
    );

    // harness.json: the user's file WINS, and the template contributes only the keys the
    // user does not have yet (a newly-shipped key arrives with its default). backupAndCopy
    // above deliberately skipped it. This replaces the old snapshot-and-restore of
    // `harness`, `vault` and `models` — three keys added reactively, one per incident,
    // while stopGate, baseBranch, workTracking, requireEvolveBeforePush, autonomous and the
    // two gate timeouts were silently reset to the shipped defaults on every update.
    //
    // Must run BEFORE the Codex emit below: emit-codex.js reads `models` from this file and
    // BAKES the resolved IDs into .codex/agents/*.toml, so merging afterwards would leave
    // the generated tree pinned to the package's IDs while harness.json showed the user's.
    var harnessDelta = installHarnessConfig(
      projectRoot,
      path.join(sourceDir, 'template', '.claude', 'harness.json')
    );
    stats.created += harnessDelta.created;
    stats.updated += harnessDelta.updated;

    // Materialize the harness choice for a project that has none: a pre-multi-harness
    // harness.json has no `harness` key, and neither does the template, so the merge above
    // cannot supply one. Without this, the assumed ['claude'] is re-assumed on every run.
    // (A project that HAS the key keeps it through the merge; this write is then a no-op.)
    writeHarnessTargets(projectRoot, targets);

    // Instructions: AGENTS.md always; the CLAUDE.md shim only for a Claude target.
    var instructionFiles = ['AGENTS.md'];
    if (targets.indexOf('claude') !== -1) instructionFiles.push('CLAUDE.md');

    for (var ifI = 0; ifI < instructionFiles.length; ifI++) {
      var ifName = instructionFiles[ifI];
      var ifDelta = copyClaudeMdWithBackup(
        path.join(sourceDir, 'template', ifName),
        path.join(projectRoot, ifName),
        { backupLabel: ifName }
      );
      stats.created += ifDelta.created;
      stats.updated += ifDelta.updated;
      stats.backedUp += ifDelta.backedUp;
      for (var bi = 0; bi < ifDelta.backedUpFiles.length; bi++) {
        stats.backedUpFiles.push(ifDelta.backedUpFiles[bi]);
      }
    }

    // Update root symbol-search config: .mcp.json (codebase-search MCP) and
    // .lsp.json (language-server diagnostics). Back up existing ones first
    // (parity with init.js — refresh the payload files init installs).
    var rootConfigFiles = ['.mcp.json', '.lsp.json'];
    for (var rc = 0; rc < rootConfigFiles.length; rc++) {
      var rcSrc = path.join(sourceDir, 'template', rootConfigFiles[rc]);
      if (!fs.existsSync(rcSrc)) continue;
      var rcDest = path.join(projectRoot, rootConfigFiles[rc]);
      var rcExisted = fs.existsSync(rcDest);
      if (rcExisted) {
        var rcBackup = rcDest + '.backup';
        if (!fs.existsSync(rcBackup)) {
          fs.copyFileSync(rcDest, rcBackup);
          stats.backedUp++;
          stats.backedUpFiles.push(toProjectRelative(rcDest, projectRoot));
        }
      }
      fs.copyFileSync(rcSrc, rcDest);
      if (rcExisted) { stats.updated++; } else { stats.created++; }
    }

    // Refresh examples/ (parity with init.js).
    var examplesSrc = path.join(sourceDir, 'template', 'examples');
    if (fs.existsSync(examplesSrc)) {
      var exStats = backupAndCopy(examplesSrc, path.join(projectRoot, 'examples'), projectRoot);
      stats.created += exStats.created;
      stats.updated += exStats.updated;
      stats.backedUp += exStats.backedUp;
      for (var ei = 0; ei < exStats.backedUpFiles.length; ei++) {
        stats.backedUpFiles.push(exStats.backedUpFiles[ei]);
      }
    }

    // Reconcile settings.json: union the user's original team settings
    // (settings.json.backup) back into the freshly-updated framework version so
    // their hooks + permissions survive the update. Merges ONLY if a prior
    // adoption (init over an existing harness) left the user-origin marker — a
    // backup created by update itself is PHE's own previous file and is left
    // alone, so framework-side removals are never silently reverted.
    var settingsReconcile = reconcileSettingsJson(projectRoot);
    if (settingsReconcile.merged) {
      console.log('Merged your .claude/settings.json (hooks + permissions) with the updated framework version.');
    } else if (settingsReconcile.error) {
      console.warn('Could not merge your settings.json (' + settingsReconcile.error + '); the framework version is active and yours is at .claude/settings.json.backup.');
    }

    // Re-derive the Codex tree so a payload change (new skill, edited agent)
    // reaches Codex. Generated trees are overwritten, never backed up.
    if (targets.indexOf('codex') !== -1) {
      var codexCounts = emitCodexPayload(projectRoot);
      console.log('Re-emitted Codex payload: ' + codexCounts.skills + ' skills, ' + codexCounts.agents + ' agents.');
    }

    // A recorded target that was DROPPED since the last run (harness.json
    // narrowed from ['claude','codex'] to one) must not leave that target's
    // generated tree behind, stale forever — same point as the conditional
    // emit above.
    var cleanupMsg = cleanupDroppedTargets(projectRoot, targets);
    if (cleanupMsg) console.log(cleanupMsg);

    // Create init metadata for /harness-init merge
    if (stats.backedUp > 0) {
      createInitMeta(projectRoot, previousVersion, newVersion, stats.backedUpFiles);
    }

    console.log('');
    console.log('Update complete!');
    console.log('');
    console.log('  Created:   ' + stats.created + ' files');
    console.log('  Updated:   ' + stats.updated + ' files');
    if (stats.backedUp > 0) {
      console.log('  Backed up: ' + stats.backedUp + ' files (saved as .backup)');
    }
    console.log('');
    if (stats.backedUp > 0) {
      console.log('Run /harness-init to reconcile your existing configuration with the updated payload.');
    } else {
      console.log('Run /harness-init to re-fit the payload to your project.');
    }
    console.log('');
    var claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
    var hasDbAccessSection = fs.existsSync(claudeMdPath) &&
      fs.readFileSync(claudeMdPath, 'utf-8').includes('## Database Access');
    if (fs.existsSync(path.join(projectRoot, '.idea')) && !hasDbAccessSection) {
      console.log('Tip (IntelliJ detected): connect your database in IDEA so the agent can run');
      console.log('SQL via the JetBrains MCP "idea" tools — then tell Claude "I connected the');
      console.log('database via IDEA" to record it in CLAUDE.md.');
      console.log('');
    }
  } catch (err) {
    console.error('Update failed: ' + err.message);
    process.exit(1);
  } finally {
    cleanupTmpDir(tmpDir);
    closeRl();
  }
}

// Export for tests and other CLI entry points. Only run main() when invoked
// directly (`node cli/update.js`), NOT when required from a test file — which
// would otherwise run the full update against the tester's cwd.
module.exports = {
  backupAndCopy: backupAndCopy,
  main: main,
};

if (require.main === module) {
  main();
}
