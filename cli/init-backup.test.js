// cli/init-backup.test.js
//
// Tests the backup-and-copy logic used by init.js and update.js.
// Verifies: backup creation, .init-meta.json, version detection.

const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(require('os').tmpdir(), 'init-backup-test-' + require('crypto').randomUUID());
const SOURCE_DIR = path.join(TEST_DIR, 'source');
const TARGET_DIR = path.join(TEST_DIR, 'target');

function setup() {
  // Create source (simulating framework files)
  fs.mkdirSync(path.join(SOURCE_DIR, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(SOURCE_DIR, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(SOURCE_DIR, 'CLAUDE.md'), '# Framework CLAUDE.md\n\n## Tech Stack\n\n- Node.js\n');
  fs.writeFileSync(path.join(SOURCE_DIR, '.claude', 'rules', 'backend.md'), '# Backend Rules v2\n\n## New section\n');
  fs.writeFileSync(path.join(SOURCE_DIR, '.claude', 'commands', 'start.md'), '# /start v2\n');
  fs.writeFileSync(path.join(SOURCE_DIR, 'package.json'), '{"version": "0.3.0"}');

  // Create target (simulating existing project)
  fs.mkdirSync(path.join(TARGET_DIR, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(TARGET_DIR, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(TARGET_DIR, 'CLAUDE.md'), '# My Project\n\n## Tech Stack\n\n- React\n- Supabase\n');
  fs.writeFileSync(path.join(TARGET_DIR, '.claude', 'rules', 'backend.md'), '# Backend Rules v1\n\n## My custom convention\n');
  fs.writeFileSync(path.join(TARGET_DIR, '.claude', 'commands', 'start.md'), '# /start v1\n');
  fs.writeFileSync(path.join(TARGET_DIR, 'package.json'), '{"version": "0.2.0"}');
}

function cleanup() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

// Inline backupAndCopy for testing (extracted from init.js logic, with double-init guard)
function backupAndCopy(sourceDir, targetDir) {
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

      if (entry.isDirectory()) {
        copy(srcPath, destPath);
      } else {
        var destExists = fs.existsSync(destPath);
        if (destExists) {
          var backupPath = destPath + '.backup';
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(destPath, backupPath);
            stats.backedUp++;
            stats.backedUpFiles.push(path.relative(targetDir, destPath).split(path.sep).join('/'));
          }
        }
        fs.copyFileSync(srcPath, destPath);
        if (destExists) { stats.updated++; } else { stats.created++; }
      }
    }
  }

  copy(sourceDir, targetDir);
  return stats;
}

function runTests() {
  var passed = 0;
  var failed = 0;

  function assert(name, condition) {
    if (condition) {
      console.log('  PASS: ' + name);
      passed++;
    } else {
      console.log('  FAIL: ' + name);
      failed++;
    }
  }

  setup();

  // Test: backup-and-copy creates .backup files
  console.log('backup-and-copy:');
  var stats = backupAndCopy(SOURCE_DIR, TARGET_DIR);

  assert('backed up 4 existing files', stats.backedUp === 4);
  assert('CLAUDE.md.backup exists', fs.existsSync(path.join(TARGET_DIR, 'CLAUDE.md.backup')));
  assert('backend.md.backup exists', fs.existsSync(path.join(TARGET_DIR, '.claude', 'rules', 'backend.md.backup')));
  assert('start.md.backup exists', fs.existsSync(path.join(TARGET_DIR, '.claude', 'commands', 'start.md.backup')));
  assert('package.json.backup exists', fs.existsSync(path.join(TARGET_DIR, 'package.json.backup')));

  // Test: backup contains old content
  console.log('backup content:');
  var backupContent = fs.readFileSync(path.join(TARGET_DIR, 'CLAUDE.md.backup'), 'utf-8');
  assert('CLAUDE.md.backup has old content', backupContent.includes('My Project'));
  assert('CLAUDE.md.backup has old tech stack', backupContent.includes('React'));

  // Test: new file has framework content
  var newContent = fs.readFileSync(path.join(TARGET_DIR, 'CLAUDE.md'), 'utf-8');
  assert('CLAUDE.md has new framework content', newContent.includes('Framework CLAUDE.md'));

  // Test: backed up files list is correct
  console.log('backed up files list:');
  assert('backedUpFiles has 4 entries', stats.backedUpFiles.length === 4);
  assert('backedUpFiles includes CLAUDE.md', stats.backedUpFiles.includes('CLAUDE.md'));

  // Test: new files with no existing counterpart are just created (no backup)
  console.log('new files:');
  fs.writeFileSync(path.join(SOURCE_DIR, '.claude', 'rules', 'new-rule.md'), '# New Rule\n');
  var stats2 = backupAndCopy(SOURCE_DIR, TARGET_DIR);
  assert('new file counted as created', stats2.created >= 1);

  // Test: double-init guard — running backupAndCopy again should NOT overwrite .backup files
  console.log('double-init guard:');

  // Change the source to simulate a second init with different framework content
  fs.writeFileSync(path.join(SOURCE_DIR, 'CLAUDE.md'), '# Framework CLAUDE.md v3\n\n## Tech Stack\n\n- Node.js\n- Python\n');
  fs.writeFileSync(path.join(SOURCE_DIR, '.claude', 'rules', 'backend.md'), '# Backend Rules v3\n\n## Even newer section\n');

  var stats3 = backupAndCopy(SOURCE_DIR, TARGET_DIR);

  // .backup files should still contain the ORIGINAL project content (not framework v2)
  var doubleInitBackup = fs.readFileSync(path.join(TARGET_DIR, 'CLAUDE.md.backup'), 'utf-8');
  assert('CLAUDE.md.backup still has original content after double-init', doubleInitBackup.includes('My Project'));
  assert('CLAUDE.md.backup was NOT overwritten with framework content', !doubleInitBackup.includes('Framework CLAUDE.md'));

  var backendBackup = fs.readFileSync(path.join(TARGET_DIR, '.claude', 'rules', 'backend.md.backup'), 'utf-8');
  assert('backend.md.backup still has original v1 content', backendBackup.includes('Backend Rules v1'));
  assert('backend.md.backup was NOT overwritten with v2 content', !backendBackup.includes('Backend Rules v2'));

  // The second run should NOT re-backup files that already had .backup from the first run.
  // It may backup new-rule.md (created in "new files" test, no .backup yet), so count may be > 0.
  // The critical check: original 4 files were NOT re-backed-up.
  assert('second run did not re-backup original files', !stats3.backedUpFiles.includes('CLAUDE.md'));
  assert('second run did not re-backup backend.md', !stats3.backedUpFiles.includes('.claude/rules/backend.md'));

  // But the new framework files should still be installed
  var currentContent = fs.readFileSync(path.join(TARGET_DIR, 'CLAUDE.md'), 'utf-8');
  assert('CLAUDE.md has latest framework content (v3)', currentContent.includes('Framework CLAUDE.md v3'));

  // ── Integration: real backupAndCopy + reconcileSettingsJson (adopt-over-existing) ──
  // Exercises the REAL exported functions (not the inlined copy above) to prove
  // the "keep what the user had + add ours" flow end-to-end.
  console.log('adopt-over-existing (real functions):');
  var realInit = require('./init.js');
  var reconcile = require('./merge-settings.js').reconcileSettingsJson;

  var ROOT = path.join(TEST_DIR, 'adopt');
  var SRC_CLAUDE = path.join(ROOT, 'src', '.claude');
  var PROJ = path.join(ROOT, 'proj');
  var PROJ_CLAUDE = path.join(PROJ, '.claude');
  // Framework payload (source): settings.json with the guard hook + a shipped skill.
  fs.mkdirSync(path.join(SRC_CLAUDE, 'skills', 'plan'), { recursive: true });
  fs.writeFileSync(path.join(SRC_CLAUDE, 'settings.json'), JSON.stringify({
    permissions: { deny: ['Read(./.env)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/guard.mjs'], timeout: 15 }] }] },
  }, null, 2));
  fs.writeFileSync(path.join(SRC_CLAUDE, 'skills', 'plan', 'SKILL.md'), '# /plan (framework)\n');
  // Existing user project: their own settings.json hook + their OWN skill PHE never ships.
  fs.mkdirSync(path.join(PROJ_CLAUDE, 'skills', 'my-deploy'), { recursive: true });
  fs.writeFileSync(path.join(PROJ_CLAUDE, 'settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(docker *)'], deny: [] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/my-lint.mjs'], timeout: 10 }] }] },
  }, null, 2));
  var USER_SKILL = path.join(PROJ_CLAUDE, 'skills', 'my-deploy', 'SKILL.md');
  fs.writeFileSync(USER_SKILL, '# /my-deploy (user-owned)\n');

  var adoptStats = realInit.backupAndCopy(SRC_CLAUDE, PROJ_CLAUDE, PROJ);
  // Adoption: init flags a settings.json it just backed up as user-origin.
  var recon = reconcile(PROJ, { userBackupJustCreated: adoptStats.backedUpFiles.indexOf('.claude/settings.json') !== -1 });

  assert('settings reconcile reports merged', recon.merged === true);
  var mergedSettings = JSON.parse(fs.readFileSync(path.join(PROJ_CLAUDE, 'settings.json'), 'utf-8'));
  var mergedScripts = mergedSettings.hooks.PreToolUse[0].hooks.map(function (h) { return h.args[0]; });
  assert('user hook preserved after adopt', mergedScripts.indexOf('.claude/hooks/my-lint.mjs') !== -1);
  assert('framework guard hook added', mergedScripts.indexOf('.claude/hooks/guard.mjs') !== -1);
  assert('user allow permission preserved', mergedSettings.permissions.allow.indexOf('Bash(docker *)') !== -1);
  assert('framework deny permission preserved', mergedSettings.permissions.deny.indexOf('Read(./.env)') !== -1);
  // Step C: a user-owned file PHE does not ship is never touched or backed up.
  assert('user-owned skill preserved verbatim', fs.readFileSync(USER_SKILL, 'utf-8') === '# /my-deploy (user-owned)\n');
  assert('user-owned skill has no .backup', !fs.existsSync(USER_SKILL + '.backup'));

  // ── Blocker-2 regression: re-running init on an already-PHE project must not
  //    treat PHE's OWN settings.json as user content (would ratchet-revert). ──
  console.log('re-init does not ratchet-revert (real functions):');
  assert('shouldMergeUserSettings is exported', typeof realInit.shouldMergeUserSettings === 'function');
  if (typeof realInit.shouldMergeUserSettings === 'function') {
    // Unit: the flag is true ONLY on genuine first adoption.
    assert('flag true: foreign adoption (not PHE-managed, settings backed up)', realInit.shouldMergeUserSettings(false, ['.claude/settings.json']) === true);
    assert('flag false: fresh init (settings created, not backed up)', realInit.shouldMergeUserSettings(false, []) === false);
    assert('flag false: re-init of already-PHE project', realInit.shouldMergeUserSettings(true, ['.claude/settings.json']) === false);

    // Integration: real backupAndCopy + reconcile, harness.json as the "PHE already here" signal.
    var pheHere = function (p) { return fs.existsSync(path.join(p, '.claude', 'harness.json')); };
    var RR = path.join(TEST_DIR, 'reinit');
    var RSRC = path.join(RR, 'src', '.claude');
    var RPROJ = path.join(RR, 'proj');
    var RPC = path.join(RPROJ, '.claude');
    fs.mkdirSync(RSRC, { recursive: true });
    fs.mkdirSync(RPC, { recursive: true });
    fs.writeFileSync(path.join(RSRC, 'harness.json'), '{"stopGate":[]}');
    fs.writeFileSync(path.join(RSRC, 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(curl -s https://api.internal/*)'], deny: [] }, hooks: {} }));

    // init #1 (fresh project): settings.json is CREATED, not backed up.
    var pheBefore1 = pheHere(RPROJ);
    var st1 = realInit.backupAndCopy(RSRC, RPC, RPROJ);
    // backupAndCopy now SKIPS harness.json (it is user config); the real init flow
    // installs it right after via installHarnessConfig. Mirror that here so the
    // "PHE already here" marker (harness.json) exists on the re-init below — the same
    // sequencing the CLI runs, not the old behaviour where the copy carried it.
    require('./harness-config').installHarnessConfig(RPROJ, path.join(RSRC, 'harness.json'));
    var flag1 = realInit.shouldMergeUserSettings(pheBefore1, st1.backedUpFiles);
    reconcile(RPROJ, { userBackupJustCreated: flag1 });
    assert('init#1 flag is false (nothing to adopt)', flag1 === false);

    // Framework v1.5 REMOVES the curl allow; user re-runs `init`.
    fs.writeFileSync(path.join(RSRC, 'settings.json'), JSON.stringify({ permissions: { deny: [] }, hooks: {} }));
    var pheBefore2 = pheHere(RPROJ); // harness.json now present → true
    var st2 = realInit.backupAndCopy(RSRC, RPC, RPROJ);
    var flag2 = realInit.shouldMergeUserSettings(pheBefore2, st2.backedUpFiles);
    var recon2 = reconcile(RPROJ, { userBackupJustCreated: flag2 });
    assert('re-init flag is false (PHE already installed)', flag2 === false);
    assert('re-init does not merge PHE-origin settings', recon2.merged === false);
    var s2 = JSON.parse(fs.readFileSync(path.join(RPC, 'settings.json'), 'utf-8'));
    assert('re-init preserves framework removal (curl allow gone)', (s2.permissions.allow || []).indexOf('Bash(curl -s https://api.internal/*)') === -1);
    assert('re-init writes no user-origin marker', !fs.existsSync(path.join(RPC, '.settings-user-origin')));
  }

  cleanup();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
