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
  // perfect-harness-engineering installs NO CLI tools into consumer projects —
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

const TEMPLATE = path.join(__dirname, '..', 'template');
const readTemplate = (...p) => fs.readFileSync(path.join(TEMPLATE, ...p), 'utf-8');
const HARNESS_INIT = path.join('.claude', 'skills', 'harness-init', 'SKILL.md');

// /harness-init step 4 makes `npx <pkg> file-size-check` a MANDATORY gate. If the
// skill names a package that is not this package's bin, that gate can never pass —
// it 404s at the registry. The name shipped as `claude-code-harness` while the bin
// was `perfect-harness-engineering`, so every install hit E404 on a required check.
test('harness-init names an npx package + subcommand the CLI actually provides', () => {
  const skill = readTemplate(HARNESS_INIT);
  // Anchor on the backtick: the skill also mentions bare `npx` in prose and inside
  // the context7 MCP JSON blob, and neither is the verification command.
  const m = /`npx ([a-z0-9@/-]+) ([a-z-]+)`/.exec(skill);
  assert.ok(m, 'harness-init must name an `npx <pkg> <subcommand>` verification command');
  const [, pkg, subcommand] = m;

  const rawBin = require('../package.json').bin;
  // npm allows the single-bin string form; normalize before asserting.
  const bin = typeof rawBin === 'string' ? { [require('../package.json').name]: rawBin } : rawBin;
  assert.ok(
    Object.prototype.hasOwnProperty.call(bin, pkg),
    'skill says `npx ' + pkg + '` but package.json bin exposes: ' + Object.keys(bin).join(', ')
  );

  const index = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf-8');
  assert.ok(
    index.includes("case '" + subcommand + "'"),
    'cli/index.js does not implement the `' + subcommand + '` subcommand the skill requires'
  );

  // And it must actually run: `file-size-check` shells out to tools/context-ledger.mjs,
  // which must be packed or npx installs a broken CLI. Accept the file or its dir.
  const files = require('../package.json').files;
  const packs = (rel) => files.some((f) => f === rel || rel.startsWith(f.replace(/\/?$/, '/')));
  assert.ok(
    packs('tools/context-ledger.mjs'),
    'tools/context-ledger.mjs is not covered by package.json files[]: ' + files.join(', ')
  );
});

// The placeholder gate. The pattern must be a GRAMMAR, not an enumeration: the shipped
// alternation caught 20 of 69 tokens and let <file>, <incident>, <root cause>, <env-var>
// survive into the two knowledge skills the agent consults before placing code or
// debugging. Pinned as a LITERAL — the skill and this test must be edited together.
const GATE_PATTERN = /<[A-Za-z][^<>]*>/;
const GATE_ALLOW = ['a', 'n', 'id', 'div', 'slug', 'tool', 'button', 'dialog'];
const GATE_CMD =
  "grep -rnoE '<[A-Za-z][^<>]*>' AGENTS.md .claude/rules/ .claude/skills/architecture-map/ " +
  '.claude/skills/debugging-this-repo/ \\| grep -vE ' +
  "'<(" + GATE_ALLOW.join('\\|') + ")>$'";

const isPlaceholder = (t) => GATE_PATTERN.test(t) && !GATE_ALLOW.includes(t.slice(1, -1));

test('harness-init step 4 ships exactly the pinned placeholder gate', () => {
  assert.ok(
    readTemplate(HARNESS_INIT).includes(GATE_CMD),
    'harness-init step 4 no longer contains the pinned gate command:\n  ' + GATE_CMD
  );
});

test('the placeholder gate catches every placeholder the pristine templates ship', () => {
  const pristine = ['AGENTS.md', path.join('.claude', 'skills', 'architecture-map', 'SKILL.md'),
    path.join('.claude', 'skills', 'debugging-this-repo', 'SKILL.md')];
  const tokens = pristine.flatMap((f) => readTemplate(f).match(/<[A-Za-z][^<>]*>/g) || []);

  const uncaught = [...new Set(tokens)].filter(
    (t) => !isPlaceholder(t) && !GATE_ALLOW.includes(t.slice(1, -1))
  );
  assert.strictEqual(uncaught.length, 0, 'gate misses placeholders: ' + uncaught.join(', '));

  // The exact shapes the old enumeration missed — pinned so a narrower pattern fails here.
  const regression = ['<file>', '<incident>', '<shared-dir>', '<root cause>', '<env-var>',
    '<file:line>', '<exact error text>'];
  const absent = regression.filter((t) => !tokens.includes(t));
  assert.strictEqual(absent.length, 0, 'regression tokens no longer in templates: ' + absent.join(', '));
  assert.ok(regression.every(isPlaceholder), 'a regression token is not caught by the gate');
});

test('every gate allowlist entry is earned by a real token in the templates', () => {
  // Over-match guard. Path notation survives /harness-init in AGENTS.md; the HTML tags
  // are real prose in rules/frontend.md. An allowlist entry with no such use would be
  // silently hiding a placeholder instead of exempting notation.
  const claudeMd = readTemplate('AGENTS.md');
  const frontend = readTemplate('.claude', 'rules', 'frontend.md');
  for (const t of ['<id>', '<slug>', '<n>', '<tool>']) {
    assert.ok(claudeMd.includes(t), 'allowlisted ' + t + ' is unused in template/AGENTS.md — drop it');
  }
  for (const t of ['<a>', '<div>', '<button>', '<dialog>']) {
    assert.ok(frontend.includes(t), 'allowlisted ' + t + ' is unused in rules/frontend.md — drop it');
  }
});

// cli/init.js falls back to a GitHub tarball of the default branch, which contains only
// COMMITTED files. An untracked payload file therefore installs fine from npm and is
// missing from a git-sourced install — the same git/npm divergence that produced the
// `claude-code-harness` 404.
test('the whole template/ payload is committed (the tarball install path ships only tracked files)', () => {
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'template/'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf-8',
  }).trim();
  assert.strictEqual(untracked, '', 'untracked files under template/:\n  ' + untracked.split('\n').join('\n  '));
});

test('the eslint flat-config fragment ships with the payload', () => {
  assert.ok(
    fs.existsSync(path.join(TEMPLATE, '.claude', 'tooling', 'eslint.harness.mjs')),
    'harness-init tells operators to wire .claude/tooling/eslint.harness.mjs before arming a lint gate'
  );
});

// ─── Minor 2: harness.json crash window ─────────────────────────────────────
// backupAndCopy(.claude/) SKIPS harness.json (it is user config); installHarnessConfig
// then installs-or-merges it, and writeHarnessTargets records the resolved targets. If
// anything throws in the gap before the targets are recorded (EACCES in the instruction
// copy, a settings-merge failure, ...), the project could be left with a harness.json
// that has no `harness` key -- the next `update` then prints "No harness recorded --
// assuming Claude Code" and silently drops Codex. Fix: installHarnessConfig +
// writeHarnessTargets run IMMEDIATELY after backupAndCopy, before anything else that can
// throw. Pinned structurally (source-order) below, since faking a mid-flight filesystem
// failure inside a full init/update run is impractical.

test('update.js records harness targets immediately after the .claude/ copy, before anything else can throw', () => {
  const src = fs.readFileSync(path.join(__dirname, 'update.js'), 'utf-8');
  const backupCopyIdx = src.indexOf("backupAndCopy(\n      path.join(sourceDir, 'template', '.claude')");
  const writeIdx = src.indexOf('writeHarnessTargets(projectRoot, targets)');
  const instructionFilesIdx = src.indexOf("var instructionFiles = ['AGENTS.md']");
  assert.ok(backupCopyIdx !== -1, 'the .claude/ backupAndCopy call was not found where expected');
  assert.ok(writeIdx !== -1, 'writeHarnessTargets(projectRoot, targets) call not found');
  assert.ok(instructionFilesIdx !== -1, 'the instruction-file copy block was not found where expected');
  assert.ok(
    backupCopyIdx < writeIdx && writeIdx < instructionFilesIdx,
    'writeHarnessTargets must run between the .claude/ backupAndCopy and the instruction-file copy — found backupAndCopy@' +
      backupCopyIdx + ', writeHarnessTargets@' + writeIdx + ', instructionFiles@' + instructionFilesIdx
  );
  // Exactly one call site — a stray second call (the old late-write left in
  // by mistake) would silently re-widen the crash window it closes.
  const callCount = src.split('writeHarnessTargets(projectRoot, targets)').length - 1;
  assert.strictEqual(callCount, 1, 'writeHarnessTargets(projectRoot, targets) must be called exactly once, found ' + callCount);
});

test('init.js records harness targets immediately after the .claude/ copy, before anything else can throw', () => {
  const src = fs.readFileSync(path.join(__dirname, 'init.js'), 'utf-8');
  const backupCopyIdx = src.indexOf("backupAndCopy(\n    path.join(sourceDir, 'template', '.claude')");
  const writeIdx = src.indexOf('writeHarnessTargets(targetDir, targets)');
  const instructionFilesIdx = src.indexOf("var instructionFiles = [{ name: 'AGENTS.md' }]");
  assert.ok(backupCopyIdx !== -1, 'the .claude/ backupAndCopy call was not found where expected');
  assert.ok(writeIdx !== -1, 'writeHarnessTargets(targetDir, targets) call not found');
  assert.ok(instructionFilesIdx !== -1, 'the instruction-file copy block was not found where expected');
  assert.ok(
    backupCopyIdx < writeIdx && writeIdx < instructionFilesIdx,
    'writeHarnessTargets must run between the .claude/ backupAndCopy and the instruction-file copy — found backupAndCopy@' +
      backupCopyIdx + ', writeHarnessTargets@' + writeIdx + ', instructionFiles@' + instructionFilesIdx
  );
  const callCount = src.split('writeHarnessTargets(targetDir, targets)').length - 1;
  assert.strictEqual(callCount, 1, 'writeHarnessTargets(targetDir, targets) must be called exactly once, found ' + callCount);
});

// Dynamic companion: exercise the ACTUAL update sequence — backupAndCopy (skips
// harness.json) → installHarnessConfig (merge) → writeHarnessTargets — against an
// EXISTING user harness.json, and prove both halves of the invariant: the user's
// config survives the copy AND the harness key is recorded. The old version called
// only backupAndCopy + writeHarnessTargets and passed vacuously (writeHarnessTargets
// creates the file), never touching the installHarnessConfig merge that now carries
// the risk. This version fails if the merge ever drops a user key or the copy clobbers.
test('the real update sequence records targets AND preserves the user\'s existing harness.json config', () => {
  const dir = path.join(TMP, 'harness-crash-window');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });

  delete require.cache[require.resolve('./update.js')];
  delete require.cache[require.resolve('./harness-targets.js')];
  delete require.cache[require.resolve('./harness-config.js')];
  const { backupAndCopy } = require('./update.js');
  const { writeHarnessTargets, readHarnessTargets } = require('./harness-targets.js');
  const { installHarnessConfig } = require('./harness-config.js');

  // A user who has configured a stop gate and refreshed their model map.
  fs.writeFileSync(
    path.join(dir, '.claude', 'harness.json'),
    JSON.stringify({ stopGate: ['npm test'], models: { checkedAt: '2030-01-01' } })
  );

  const repoRoot = path.join(__dirname, '..');
  backupAndCopy(path.join(repoRoot, 'template', '.claude'), path.join(dir, '.claude'), dir);
  installHarnessConfig(dir, path.join(repoRoot, 'template', '.claude', 'harness.json'));
  writeHarnessTargets(dir, ['claude', 'codex']);

  const after = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'harness.json'), 'utf-8'));
  assert.deepStrictEqual(readHarnessTargets(dir), ['claude', 'codex'], 'the recorded targets must be present');
  assert.deepStrictEqual(after.stopGate, ['npm test'], 'the user stop gate must survive the copy+merge');
  assert.strictEqual(after.models.checkedAt, '2030-01-01', 'the user model refresh must survive the copy+merge');
});

// Cleanup
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch (_) {}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
