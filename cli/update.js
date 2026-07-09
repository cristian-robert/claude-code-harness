const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const readline = require('readline');
const { toProjectRelative } = require('./protected-files');
const { copyClaudeMdWithBackup } = require('./claude-md-copy');
const { reconcileSettingsJson } = require('./merge-settings');

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
  console.log('  claude-code-harness — Update');
  console.log('');

  if (!fs.existsSync('.claude')) {
    console.error('No .claude/ directory found. Run "npx claude-code-harness init" first.');
    process.exit(1);
  }

  var projectRoot = process.cwd();
  var previousVersion = getVersion(projectRoot);

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

    // Update CLAUDE.md with backup + rollback on failure. See
    // cli/claude-md-copy.js for the rollback semantics.
    var claudeMdSource = path.join(sourceDir, 'template', 'CLAUDE.md');
    var claudeMdDest = path.join(projectRoot, 'CLAUDE.md');
    var claudeMdDelta = copyClaudeMdWithBackup(claudeMdSource, claudeMdDest);
    stats.created += claudeMdDelta.created;
    stats.updated += claudeMdDelta.updated;
    stats.backedUp += claudeMdDelta.backedUp;
    for (var bi = 0; bi < claudeMdDelta.backedUpFiles.length; bi++) {
      stats.backedUpFiles.push(claudeMdDelta.backedUpFiles[bi]);
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
