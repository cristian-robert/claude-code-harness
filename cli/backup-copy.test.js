#!/usr/bin/env node
'use strict';

// cli/backup-copy.test.js
//
// Tests the shared backup-then-copy machinery (cli/backup-copy.js) used by
// init.js, update.js and claude-md-copy.js.
//
// Blocker 1 (upgrade-path review, F1): first-backup-wins meant the SECOND
// update permanently destroyed every customization made after the first one —
// the live file was overwritten by the template, and no backup was taken
// because `<file>.backup` already existed (holding the pre-first-update copy).
// The distilled reviewer sequence is `U1/U2 rotation` below.

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-copy-'));

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

console.log('\nbackup-copy tests\n');

const backupCopy = require('./backup-copy.js');
const { backupAndCopy, preserveBeforeOverwrite, rotationBackupPath, utcStamp } = backupCopy;
const { copyClaudeMdWithBackup } = require('./claude-md-copy.js');

function dir(name) {
  const d = path.join(TMP, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function read(p) {
  return fs.readFileSync(p, 'utf-8');
}
// Every rotation backup of `dest`, newest-name-last.
function rotations(destPath) {
  const base = path.basename(destPath) + '.backup-';
  return fs
    .readdirSync(path.dirname(destPath))
    .filter((f) => f.indexOf(base) === 0)
    .sort()
    .map((f) => path.join(path.dirname(destPath), f));
}

// ─── One implementation, three call sites ───────────────────────────────────

test('init.js and update.js share ONE backupAndCopy implementation', () => {
  const initMod = require('./init.js');
  const updateMod = require('./update.js');
  assert.strictEqual(typeof backupAndCopy, 'function', 'backup-copy.js must export backupAndCopy');
  assert.strictEqual(initMod.backupAndCopy, backupAndCopy, 'init.js must re-export the shared backupAndCopy');
  assert.strictEqual(updateMod.backupAndCopy, backupAndCopy, 'update.js must re-export the shared backupAndCopy');
});

// ─── preserveBeforeOverwrite: the four cases ────────────────────────────────

test('dest identical to the incoming template → no backup at all', () => {
  const d = dir('identical');
  const src = path.join(d, 'src.md');
  const dest = path.join(d, 'dest.md');
  write(src, 'SAME\n');
  write(dest, 'SAME\n');

  const r = preserveBeforeOverwrite(dest, src, 'dest.md');
  assert.strictEqual(r.backedUp, 0, 'identical content must not be backed up');
  assert.strictEqual(r.action, 'none');
  assert.ok(!fs.existsSync(dest + '.backup'), 'no .backup may be written for identical content');
});

test('dest differs, no .backup yet → first-adoption .backup (unchanged behavior)', () => {
  const d = dir('first');
  const src = path.join(d, 'src.md');
  const dest = path.join(d, 'dest.md');
  write(src, 'TEMPLATE\n');
  write(dest, 'USER\n');

  const r = preserveBeforeOverwrite(dest, src, 'dest.md');
  assert.strictEqual(r.backedUp, 1);
  assert.strictEqual(r.action, 'first');
  assert.strictEqual(r.recordName, 'dest.md', 'a first backup records the DEST path, as before');
  assert.strictEqual(read(dest + '.backup'), 'USER\n');
});

test('dest identical to the existing .backup → no new backup (already preserved)', () => {
  const d = dir('already-preserved');
  const src = path.join(d, 'src.md');
  const dest = path.join(d, 'dest.md');
  write(src, 'TEMPLATE v2\n');
  write(dest, 'USER\n');
  write(dest + '.backup', 'USER\n');

  const r = preserveBeforeOverwrite(dest, src, 'dest.md');
  assert.strictEqual(r.backedUp, 0, 'content already lives in .backup — no rotation needed');
  assert.strictEqual(r.action, 'none');
  assert.strictEqual(rotations(dest).length, 0);
});

test('dest differs from BOTH template and .backup → rotation backup, rotated name recorded', () => {
  const d = dir('rotate');
  const src = path.join(d, 'src.md');
  const dest = path.join(d, 'dest.md');
  write(src, 'TEMPLATE v2\n');
  write(dest, 'USER v2 — exists nowhere else\n');
  write(dest + '.backup', 'USER v1\n');

  const r = preserveBeforeOverwrite(dest, src, 'dest.md');
  assert.strictEqual(r.backedUp, 1);
  assert.strictEqual(r.action, 'rotate');
  assert.strictEqual(read(dest + '.backup'), 'USER v1\n', 'the original .backup must be untouched');
  const rot = rotations(dest);
  assert.strictEqual(rot.length, 1, 'exactly one rotation backup, found ' + rot.length);
  assert.strictEqual(read(rot[0]), 'USER v2 — exists nowhere else\n');
  assert.ok(
    /^dest\.md\.backup-\d{8}T\d{6}(-\d+)?$/.test(r.recordName),
    'stats must record the ROTATED name (got ' + r.recordName + ')'
  );
  assert.strictEqual(r.recordName, path.basename(rot[0]));
});

// ─── Rotation naming ────────────────────────────────────────────────────────

test('utcStamp is UTC, second precision', () => {
  assert.strictEqual(utcStamp(new Date(Date.UTC(2026, 7, 30, 10, 11, 12))), '20260830T101112');
  assert.strictEqual(utcStamp(new Date(Date.UTC(2026, 0, 1, 0, 0, 0))), '20260101T000000');
});

test('rotation-name collision appends a numeric suffix', () => {
  const d = dir('collision');
  const dest = path.join(d, 'dest.md');
  write(dest, 'x');
  const stamp = '20260830T101112';

  assert.strictEqual(rotationBackupPath(dest, stamp), dest + '.backup-' + stamp);
  write(dest + '.backup-' + stamp, 'taken');
  assert.strictEqual(rotationBackupPath(dest, stamp), dest + '.backup-' + stamp + '-2');
  write(dest + '.backup-' + stamp + '-2', 'taken');
  assert.strictEqual(rotationBackupPath(dest, stamp), dest + '.backup-' + stamp + '-3');
});

test('two rotations inside the same second both survive', () => {
  const d = dir('same-second');
  const src = path.join(d, 'src.md');
  const dest = path.join(d, 'dest.md');
  write(src, 'TEMPLATE\n');
  write(dest + '.backup', 'USER v1\n');

  write(dest, 'USER v2\n');
  preserveBeforeOverwrite(dest, src, 'dest.md');
  write(dest, 'USER v3\n');
  preserveBeforeOverwrite(dest, src, 'dest.md');

  const bodies = rotations(dest).map(read).sort();
  assert.deepStrictEqual(bodies, ['USER v2\n', 'USER v3\n'], 'both rotations must survive: ' + bodies.join(' | '));
});

// ─── The reviewer's U1/U2 sequence, distilled (backupAndCopy) ───────────────

test('U1/U2 rotation: the second update preserves the post-first-update customization', () => {
  const d = dir('u1u2');
  const src = path.join(d, 'src');
  const proj = path.join(d, 'proj');
  const rule = path.join(proj, '.claude', 'rules', '00-core.md');
  const srcRule = path.join(src, 'rules', '00-core.md');

  // Adopt at "2.0.0": the rule is created, nothing to back up.
  write(srcRule, '# core v1\n');
  const adopt = backupAndCopy(src, path.join(proj, '.claude'), proj);
  assert.strictEqual(adopt.created, 1);
  assert.strictEqual(adopt.backedUp, 0, 'a fresh adoption backs up nothing');

  // Months of customization.
  fs.appendFileSync(rule, '- CUSTOM-A: never migrate staging without ASK\n');

  // U1 — update to "3.1.0". First backup ever: holds v1 + CUSTOM-A.
  write(srcRule, '# core v2\n');
  const u1 = backupAndCopy(src, path.join(proj, '.claude'), proj);
  assert.strictEqual(u1.backedUp, 1);
  assert.deepStrictEqual(u1.backedUpFiles, ['.claude/rules/00-core.md']);
  assert.ok(read(rule + '.backup').includes('CUSTOM-A'));

  // The user reconciles and adds NEW content that exists nowhere else.
  fs.appendFileSync(rule, '- POST-U1 RULE: feature flags via flags.ts only\n');

  // U2 — update to "3.2.0".
  write(srcRule, '# core v3\n');
  const u2 = backupAndCopy(src, path.join(proj, '.claude'), proj);

  assert.ok(read(rule).indexOf('# core v3') === 0, 'live file takes the new template');
  assert.ok(read(rule + '.backup').includes('CUSTOM-A'), '.backup still holds the FIRST customization');
  assert.ok(!read(rule + '.backup').includes('POST-U1'), '.backup must not be clobbered');

  const rot = rotations(rule);
  assert.strictEqual(rot.length, 1, 'U2 must write exactly one rotation backup, found ' + rot.length);
  assert.ok(read(rot[0]).includes('POST-U1 RULE'), 'the post-U1 customization must survive in the rotation backup');
  assert.strictEqual(u2.backedUp, 1);
  assert.deepStrictEqual(
    u2.backedUpFiles,
    ['.claude/rules/' + path.basename(rot[0])],
    'the rotated name must flow into stats (and so into .init-meta)'
  );
});

test('a third update that changes nothing writes no backup at all', () => {
  const d = dir('noop-update');
  const src = path.join(d, 'src');
  const proj = path.join(d, 'proj');
  write(path.join(src, 'rules', '00-core.md'), '# core v1\n');
  backupAndCopy(src, path.join(proj, '.claude'), proj);

  const again = backupAndCopy(src, path.join(proj, '.claude'), proj);
  assert.strictEqual(again.backedUp, 0, 'a dest byte-identical to the template is never backed up');
  assert.deepStrictEqual(again.backedUpFiles, []);
  assert.ok(!fs.existsSync(path.join(proj, '.claude', 'rules', '00-core.md.backup')));
  assert.strictEqual(rotations(path.join(proj, '.claude', 'rules', '00-core.md')).length, 0);
});

// ─── Same semantics for the instruction files (AGENTS.md / CLAUDE.md) ───────

test('copyClaudeMdWithBackup rotates instead of losing the post-U1 AGENTS.md', () => {
  const d = dir('agents-md');
  const src = path.join(d, 'template-AGENTS.md');
  const dest = path.join(d, 'AGENTS.md');

  write(src, '# <Project Name> v1\n');
  write(dest, '# Acme Shop\n- payments/ is ASK-first\n');

  const u1 = copyClaudeMdWithBackup(src, dest, { backupLabel: 'AGENTS.md' });
  assert.strictEqual(u1.backedUp, 1);
  assert.deepStrictEqual(u1.backedUpFiles, ['AGENTS.md']);
  assert.ok(read(dest + '.backup').includes('Acme Shop'));

  // Reconciled by hand, then new team content.
  write(dest, '# Acme Shop\n- payments/ is ASK-first\n- POST-U1 NOTE: nightly job 02:00 UTC\n');

  write(src, '# <Project Name> v2\n');
  const u2 = copyClaudeMdWithBackup(src, dest, { backupLabel: 'AGENTS.md' });

  assert.strictEqual(read(dest), '# <Project Name> v2\n');
  assert.ok(read(dest + '.backup').includes('Acme Shop'), 'the original .backup survives');
  assert.ok(!read(dest + '.backup').includes('POST-U1'));
  const rot = rotations(dest);
  assert.strictEqual(rot.length, 1, 'expected one rotation backup, found ' + rot.length);
  assert.ok(read(rot[0]).includes('POST-U1 NOTE'), 'post-U1 AGENTS.md content must survive');
  assert.strictEqual(u2.backedUp, 1);
  assert.deepStrictEqual(u2.backedUpFiles, [path.basename(rot[0])]);
});

test('copyClaudeMdWithBackup skips the backup when dest already equals the template', () => {
  const d = dir('agents-md-identical');
  const src = path.join(d, 'template-AGENTS.md');
  const dest = path.join(d, 'AGENTS.md');
  write(src, '# <Project Name>\n');
  write(dest, '# <Project Name>\n');

  const delta = copyClaudeMdWithBackup(src, dest, { backupLabel: 'AGENTS.md' });
  assert.strictEqual(delta.backedUp, 0);
  assert.deepStrictEqual(delta.backedUpFiles, []);
  assert.strictEqual(delta.updated, 1, 'the copy still counts as an update');
  assert.ok(!fs.existsSync(dest + '.backup'));
});

// ─── Fail-open ──────────────────────────────────────────────────────────────

test('an unreadable dest is backed up rather than skipped (fail toward preserving)', () => {
  const d = dir('fail-open');
  const src = path.join(d, 'src.md');
  const dest = path.join(d, 'dest.md');
  write(src, 'TEMPLATE\n');
  write(dest, 'USER\n');

  const realRead = fs.readFileSync;
  fs.readFileSync = function (p, enc) {
    if (String(p) === dest) throw new Error('simulated read failure');
    return realRead(p, enc);
  };
  let r;
  try {
    r = preserveBeforeOverwrite(dest, src, 'dest.md');
  } finally {
    fs.readFileSync = realRead;
  }
  assert.strictEqual(r.backedUp, 1, 'a comparison that cannot be made must still back up');
});

// ─── Blocker 3: .init-meta.json must accumulate, not replace ────────────────
// createInitMeta REPLACED the file, so a second update listed only that run's
// backups — the first adoption's AGENTS.md and rules vanished from the list and
// /harness-init step 0 ("for each backedUpFiles entry…") reconciled none of the
// user's content (review F3).

const { createInitMeta } = backupCopy;

function meta(root) {
  return JSON.parse(read(path.join(root, '.claude', '.init-meta.json')));
}

test('init.js and update.js use the shared createInitMeta (no private copies)', () => {
  assert.strictEqual(typeof createInitMeta, 'function', 'backup-copy.js must export createInitMeta');
  ['init.js', 'update.js'].forEach((file) => {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    assert.ok(
      !/function createInitMeta\s*\(/.test(src),
      file + ' must not keep a private createInitMeta — that is how the two drifted'
    );
    const req = src.match(/const \{[^}]*\} = require\('\.\/backup-copy'\);/);
    assert.ok(req && req[0].includes('createInitMeta'), file + ' must import createInitMeta from backup-copy');
  });
});

test('a first run writes the files it backed up, with no firstInstalledVersion', () => {
  const root = dir('meta-first');
  createInitMeta(root, '2.0.0', '3.1.0', ['AGENTS.md', '.claude/rules/00-core.md']);
  const m = meta(root);
  assert.deepStrictEqual(m.backedUpFiles, ['AGENTS.md', '.claude/rules/00-core.md']);
  assert.strictEqual(m.previousVersion, '2.0.0');
  assert.strictEqual(m.newVersion, '3.1.0');
  assert.ok(!('firstInstalledVersion' in m), 'nothing earlier exists to record');
});

test('a second run UNIONS both runs\' files, deduped and order-stable', () => {
  const root = dir('meta-union');
  createInitMeta(root, '2.0.0', '3.1.0', ['AGENTS.md', '.claude/rules/00-core.md']);
  createInitMeta(root, '3.1.0', '3.2.0', [
    '.claude/rules/00-core.md.backup-20260830T101112',
    'AGENTS.md.backup-20260830T101112',
    'AGENTS.md',
  ]);
  const m = meta(root);
  assert.deepStrictEqual(
    m.backedUpFiles,
    [
      'AGENTS.md',
      '.claude/rules/00-core.md',
      '.claude/rules/00-core.md.backup-20260830T101112',
      'AGENTS.md.backup-20260830T101112',
    ],
    'old entries keep their order and come first; each file appears exactly once'
  );
  assert.strictEqual(m.backedUpFiles.filter((f) => f === 'AGENTS.md').length, 1, 'no duplicates');
});

test('the OLDEST record\'s previousVersion is kept as firstInstalledVersion', () => {
  const root = dir('meta-first-version');
  createInitMeta(root, '2.0.0', '3.1.0', ['AGENTS.md']);
  createInitMeta(root, '3.1.0', '3.2.0', ['CLAUDE.md']);
  let m = meta(root);
  assert.strictEqual(m.firstInstalledVersion, '2.0.0', 'the first adoption version must survive');
  assert.strictEqual(m.previousVersion, '3.1.0', 'this run stamps its own versions');
  assert.strictEqual(m.newVersion, '3.2.0');

  createInitMeta(root, '3.2.0', '3.3.0', ['examples/x.md']);
  m = meta(root);
  assert.strictEqual(m.firstInstalledVersion, '2.0.0', 'still the OLDEST, not the previous run');
  assert.strictEqual(m.previousVersion, '3.2.0');
  assert.deepStrictEqual(m.backedUpFiles, ['AGENTS.md', 'CLAUDE.md', 'examples/x.md']);
});

test('an "unknown" previous version is not recorded as firstInstalledVersion', () => {
  const root = dir('meta-unknown');
  createInitMeta(root, null, '3.1.0', ['AGENTS.md']);
  createInitMeta(root, '3.1.0', '3.2.0', ['CLAUDE.md']);
  const m = meta(root);
  assert.ok(!('firstInstalledVersion' in m), 'do not stamp a meaningless "unknown"');
  assert.deepStrictEqual(m.backedUpFiles, ['AGENTS.md', 'CLAUDE.md']);
});

test('a malformed existing .init-meta.json is treated as absent (never crashes)', () => {
  const root = dir('meta-malformed');
  write(path.join(root, '.claude', '.init-meta.json'), '{ not json at all');
  createInitMeta(root, '3.1.0', '3.2.0', ['AGENTS.md']);
  const m = meta(root);
  assert.deepStrictEqual(m.backedUpFiles, ['AGENTS.md']);
  assert.strictEqual(m.previousVersion, '3.1.0');
});

test('an existing meta whose backedUpFiles is not a string array is ignored', () => {
  const root = dir('meta-wrong-shape');
  write(path.join(root, '.claude', '.init-meta.json'), JSON.stringify({ backedUpFiles: { a: 1 }, previousVersion: '2.0.0' }));
  createInitMeta(root, '3.1.0', '3.2.0', ['AGENTS.md', 'AGENTS.md']);
  const m = meta(root);
  assert.deepStrictEqual(m.backedUpFiles, ['AGENTS.md'], 'this run\'s list, itself deduped');
  assert.strictEqual(m.firstInstalledVersion, '2.0.0', 'a readable previousVersion is still salvaged');
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
