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

  cleanup();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
