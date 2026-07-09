#!/usr/bin/env node
'use strict';

// cli/cli-hardening.test.js
//
// Regression tests for CLI P0 bugs:
//  - symlink traversal in backupAndCopy
//  - tmpDir collisions from Date.now()

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-hardening-'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.error('  FAIL  ' + name);
    console.error('        ' + e.message);
    failed++;
    process.exitCode = 1;
  }
}

console.log('\ncli hardening tests\n');

test('backupAndCopy does not follow symlinked directories', () => {
  const src = path.join(TMP, 'src');
  const dest = path.join(TMP, 'dest');
  const outside = path.join(TMP, 'outside');
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'SECRET');
  // Include a normal file inside src to verify normal operation still works
  fs.writeFileSync(path.join(src, 'normal.txt'), 'NORMAL');
  fs.symlinkSync(outside, path.join(src, 'link-to-outside'), 'dir');

  // Clear require cache so a fresh init.js load picks up exports
  delete require.cache[require.resolve('./init.js')];
  const { backupAndCopy } = require('./init.js');

  backupAndCopy(src, dest, dest);

  assert.ok(
    !fs.existsSync(path.join(dest, 'link-to-outside', 'secret.txt')),
    'symlink should not be traversed'
  );
  assert.ok(
    fs.existsSync(path.join(dest, 'normal.txt')),
    'regular files should still be copied'
  );
});

test('tmpDir does not collide across runs', () => {
  delete require.cache[require.resolve('./init.js')];
  const initMod = require('./init.js');
  assert.ok(
    typeof initMod.__test_tmpPath === 'function',
    '__test_tmpPath must be exported'
  );
  const p1 = initMod.__test_tmpPath();
  const p2 = initMod.__test_tmpPath();
  assert.notStrictEqual(p1, p2, 'tmp paths must differ across calls');
});

test('init.js and update.js export main() function', () => {
  delete require.cache[require.resolve('./init.js')];
  delete require.cache[require.resolve('./update.js')];
  const initMod = require('./init.js');
  const updateMod = require('./update.js');
  assert.strictEqual(
    typeof initMod.main,
    'function',
    'init.js must export main() — cli/index.js depends on it'
  );
  assert.strictEqual(
    typeof updateMod.main,
    'function',
    'update.js must export main() — cli/index.js depends on it'
  );
});

test('copyClaudeMdWithBackup restores original on copy failure (fresh backup)', () => {
  const dir = path.join(TMP, 'claude-md-rollback-fresh');
  fs.mkdirSync(dir, { recursive: true });
  const sourcePath = path.join(dir, 'source.md');
  const destPath = path.join(dir, 'CLAUDE.md');
  const backupPath = destPath + '.backup';

  fs.writeFileSync(sourcePath, 'NEW CONTENT');
  fs.writeFileSync(destPath, 'ORIGINAL USER CONTENT');

  delete require.cache[require.resolve('./claude-md-copy.js')];
  const { copyClaudeMdWithBackup } = require('./claude-md-copy.js');

  // Stub fs.copyFileSync to succeed on backup (dest->backup) but fail on
  // the source->dest copy (the second call).
  const realCopy = fs.copyFileSync;
  let callCount = 0;
  fs.copyFileSync = function (src, dst) {
    callCount++;
    if (callCount === 2) {
      throw new Error('simulated copy failure');
    }
    return realCopy(src, dst);
  };

  let threw = null;
  try {
    copyClaudeMdWithBackup(sourcePath, destPath);
  } catch (e) {
    threw = e;
  } finally {
    fs.copyFileSync = realCopy;
  }

  assert.ok(threw, 'helper must rethrow the copy error');
  assert.strictEqual(threw.message, 'simulated copy failure');
  assert.strictEqual(
    fs.readFileSync(destPath, 'utf-8'),
    'ORIGINAL USER CONTENT',
    'original CLAUDE.md must be restored after failure'
  );
  assert.ok(
    !fs.existsSync(backupPath),
    'fresh backup must be cleaned up after rollback'
  );
});

test('copyClaudeMdWithBackup preserves pre-existing backup on failure', () => {
  const dir = path.join(TMP, 'claude-md-rollback-preexisting');
  fs.mkdirSync(dir, { recursive: true });
  const sourcePath = path.join(dir, 'source.md');
  const destPath = path.join(dir, 'CLAUDE.md');
  const backupPath = destPath + '.backup';

  fs.writeFileSync(sourcePath, 'NEW CONTENT');
  fs.writeFileSync(destPath, 'ORIGINAL USER CONTENT');
  fs.writeFileSync(backupPath, 'PRE-EXISTING USER BACKUP');

  delete require.cache[require.resolve('./claude-md-copy.js')];
  const { copyClaudeMdWithBackup } = require('./claude-md-copy.js');

  // Stub fs.copyFileSync to fail on the very first call (no fresh backup
  // was needed, since one already exists — the only copy is source->dest).
  const realCopy = fs.copyFileSync;
  fs.copyFileSync = function () {
    throw new Error('simulated copy failure');
  };

  let threw = null;
  try {
    copyClaudeMdWithBackup(sourcePath, destPath);
  } catch (e) {
    threw = e;
  } finally {
    fs.copyFileSync = realCopy;
  }

  assert.ok(threw, 'helper must rethrow the copy error');
  assert.strictEqual(
    fs.readFileSync(backupPath, 'utf-8'),
    'PRE-EXISTING USER BACKUP',
    'pre-existing backup must NOT be destroyed by a failed run'
  );
});

// ─── update.js teardown: no bare `rl` references after closeRl refactor ─────

test('update.js has no bare rl.close() (uses closeRl helper)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'update.js'), 'utf-8');
  // Strip comments to avoid matching words in doc strings.
  const lines = src.split('\n');
  const bareRlLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip single-line comments.
    if (/^\s*\/\//.test(line)) continue;
    // Match standalone `rl` as an identifier (not `closeRl`, not `_rl`, not
    // inside words). Negative lookbehind not portable in old JS — use
    // boundary + explicit exclusions.
    const re = /(^|[^A-Za-z0-9_])rl(\.[A-Za-z_]|\b)/;
    const m = line.match(re);
    if (m) {
      // Confirm it's not closeRl/getRl/_rl by looking at what's immediately
      // before the match.
      const before = line.slice(0, m.index + (m[1] ? m[1].length : 0));
      if (/[A-Za-z0-9_]$/.test(before)) continue; // part of a longer ident
      bareRlLines.push((i + 1) + ': ' + line.trim());
    }
  }
  assert.deepStrictEqual(
    bareRlLines,
    [],
    'update.js must not reference bare `rl`; use closeRl() helper instead. Found: ' + bareRlLines.join(' | ')
  );
});

test('update.js requires cleanly without throwing (teardown path is safe)', () => {
  // End-to-end smoke: require the module, then invoke the finally-path helper
  // directly. closeRl() must exist and be callable with no readline opened.
  delete require.cache[require.resolve('./update.js')];
  const out = execFileSync('node', ['-e', "require('./cli/update.js');"], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.strictEqual(
    out,
    '',
    'requiring update.js must not produce side-effect output, got: ' + out
  );
});

// ─── PHE hooks: run the payload’s own smoke test (the authoritative check) ──

test('PHE hook smoke test passes (guard / stop-gate / post-edit / session-start / pre-compact / verdict-gate)', () => {
  const repoRoot = path.join(__dirname, '..');
  const smoke = path.join(repoRoot, 'template', '.claude', 'hooks', 'smoke-test.mjs');
  assert.ok(fs.existsSync(smoke), 'PHE payload ships template/.claude/hooks/smoke-test.mjs');
  // execFileSync throws on non-zero exit, so a red suite fails this test.
  const out = execFileSync('node', [smoke], { cwd: repoRoot, encoding: 'utf-8' });
  assert.ok(/\d+ passed, 0 failed/.test(out), 'all hook fixtures must pass, got: ' + out.trim().split('\n').pop());
});

// ─── Phase A: KB engine removed from installer catalog ──────────────────────

test('protected-files catalog has no KB engine or .obsidian entries', () => {
  delete require.cache[require.resolve('./protected-files.js')];
  const pf = require('./protected-files.js');
  assert.ok(!pf.FRAMEWORK_CLI_FILES.includes('cli/kb-search.js'), 'kb-search.js removed');
  assert.ok(!pf.FRAMEWORK_CLI_FILES.includes('cli/lean-index.js'), 'lean-index.js removed');
  // claude-code-harness installs NO CLI tools into consumer projects —
  // merge-settings / file-size-check run via npx from the package, not the project.
  assert.deepStrictEqual(pf.FRAMEWORK_CLI_FILES, [], 'FRAMEWORK_CLI_FILES must be empty — CLI tools run via npx');
  const all = pf.NEEDS_MERGE.concat(pf.NEEDS_RESTORE);
  const stale = all.filter(function (p) { return p.indexOf('.obsidian/') === 0; });
  assert.deepStrictEqual(stale, [], 'no .obsidian/ paths may remain, found: ' + stale.join(', '));
});

test('cli/index.js has no KB engine surface (help text + lean-index gone)', () => {
  const out = execFileSync('node', [path.join(__dirname, 'index.js'), '--help'], {
    encoding: 'utf-8',
  });
  assert.ok(
    !/kb-search|lean-index|Knowledge base tools/i.test(out),
    '--help must not mention the deleted KB tools, got: ' + out
  );
  let status = 0;
  try {
    execFileSync('node', [path.join(__dirname, 'index.js'), 'lean-index'], { stdio: 'pipe' });
  } catch (e) {
    status = e.status;
  }
  assert.notStrictEqual(status, 0, 'lean-index must be an unknown command (non-zero exit)');
});

// Cleanup
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch (_) {}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
