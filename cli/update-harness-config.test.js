#!/usr/bin/env node
'use strict';

// cli/update-harness-config.test.js
//
// .claude/harness.json is USER CONFIG. `update` must never destroy it.
//
// The defect this pins: update copied the template's harness.json over the user's, then
// restored a HARDCODED list of keys it remembered (harness, vault, models — each added
// reactively after someone noticed it breaking). Every other key was silently reset to the
// shipped default, including the two that make the harness a harness:
//
//   stopGate    — stop-gate.mjs runs these commands. Reset to [], the gate is DISARMED, and
//                 an empty array is indistinguishable from "never configured": nothing warns.
//   baseBranch  — guard.mjs protects this branch from direct commits. Reset to null, the guard
//                 falls back to main/master and commits straight to `develop` become allowed.
//
// The contract has two halves and this suite pins BOTH — a naive "just don't touch the file"
// fix passes the first and breaks the second:
//   1. every key the user HAS survives an update untouched;
//   2. every key the user LACKS is added with the template's default.
// Plus: a malformed harness.json fails LOUDLY rather than being silently replaced.
//
// TRAP: `update` shells out to curl for the published package. Without shadowing curl this
// suite would exercise the PUBLISHED package instead of the working tree and pass falsely.
// The shim below exits non-zero, forcing the local-fallback path; every CLI run asserts it
// actually took that path.

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'cli', 'index.js');
const TEMPLATE_HARNESS = path.join(REPO_ROOT, 'template', '.claude', 'harness.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'update-harness-config-'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.error('  FAIL  ' + name);
    console.error('        ' + e.message.split('\n')[0]);
    failed++;
    process.exitCode = 1;
  }
}

// ─── curl shim: force the local-fallback path (see TRAP above) ──────────────

const SHIM = path.join(TMP, 'shim');
fs.mkdirSync(SHIM, { recursive: true });
fs.writeFileSync(path.join(SHIM, 'curl'), '#!/bin/sh\nexit 1\n');
fs.chmodSync(path.join(SHIM, 'curl'), 0o755);
const ENV = Object.assign({}, process.env, {
  PATH: SHIM + path.delimiter + process.env.PATH,
});

function runCli(args, cwd, input, extraEnv) {
  return execFileSync('node', [CLI].concat(args), {
    cwd: cwd,
    env: extraEnv ? Object.assign({}, ENV, extraEnv) : ENV,
    encoding: 'utf-8',
    input: input || '',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// Runs the CLI expecting it to FAIL. Returns { status, output } instead of throwing, so a
// test can assert on the exit code and the message.
function runCliExpectingFailure(args, cwd, input, extraEnv) {
  try {
    var out = runCli(args, cwd, input, extraEnv);
    return { status: 0, output: out };
  } catch (e) {
    return { status: e.status, output: (e.stdout || '') + (e.stderr || '') };
  }
}

// Proves the run used THIS working tree, not whatever is published to npm.
function assertLocalFallback(out) {
  assert.ok(
    out.includes('Using local package as fallback'),
    'run did not take the local-fallback path — the curl shim is not shadowing curl, so this ' +
      'would be testing the PUBLISHED package. Output:\n' + out
  );
}

const HARNESS_REL = path.join('.claude', 'harness.json');
const readHarness = (proj) => JSON.parse(fs.readFileSync(path.join(proj, HARNESS_REL), 'utf-8'));
const writeHarness = (proj, obj) =>
  fs.writeFileSync(path.join(proj, HARNESS_REL), JSON.stringify(obj, null, 2) + '\n');

// A fresh install. `.git` is pre-created so init skips its git-init question; init asks the
// harness question then the vault question, so both answers are piped.
function installProject(name) {
  const proj = path.join(TMP, name);
  fs.mkdirSync(path.join(proj, '.git'), { recursive: true });
  assertLocalFallback(runCli(['init'], proj, 'both\nskip\n'));
  return proj;
}

// Every user-owned key, each at a NON-default value, so a key silently reverting to the
// template's default is unmissable.
const USER_CONFIG = {
  stopGate: ['npm test', 'npm run lint'],
  requireEvolveBeforePush: true,
  baseBranch: 'develop',
  autonomous: true,
  stopGateTimeoutSec: 99,
  stopGateTotalSec: 199,
  workTracking: { backend: 'github', method: 'scrum', wipLimit: 5 },
  harness: ['claude', 'codex'],
  vault: { mode: 'existing', path: '/tmp/my-vault' },
  // A map as `/models` would leave it after a refresh: new checkedAt, tightened staleDays,
  // re-pointed roles. The codex IDs stay real ones — emit-codex validates each agent's
  // pinned effort against the model's reasoning levels, so a made-up ID fails the emit for
  // a reason that has nothing to do with this test.
  models: {
    checkedAt: '2026-07-13',
    staleDays: 14,
    claude: { scout: 'sonnet', build: 'opus', deep: 'opus' },
    codex: { scout: 'gpt-5.6-terra', build: 'gpt-5.6-sol', deep: 'gpt-5.6-sol' },
  },
};

console.log('\nupdate: harness.json is user config\n');

// ─── Half 1: every key the user set survives ────────────────────────────────

const survives = installProject('survives');
writeHarness(survives, Object.assign({ $comment: 'stale docs from an old release' }, USER_CONFIG));
const survivesOut = runCli(['update'], survives, '');
assertLocalFallback(survivesOut);
const after = readHarness(survives);

Object.keys(USER_CONFIG).forEach((key) => {
  test('update preserves user `' + key + '`', () => {
    assert.deepStrictEqual(after[key], USER_CONFIG[key]);
  });
});

test('$comment tracks the template (the one template-owned key)', () => {
  const shipped = JSON.parse(fs.readFileSync(TEMPLATE_HARNESS, 'utf-8')).$comment;
  assert.strictEqual(after.$comment, shipped);
});

// ─── Half 2: a key the user LACKS arrives with the template default ─────────
// The half a naive "never touch the file" fix would break.

test('update ADDS template keys the user does not have', () => {
  const adds = installProject('adds');
  const shipped = JSON.parse(fs.readFileSync(TEMPLATE_HARNESS, 'utf-8'));

  const trimmed = Object.assign({}, USER_CONFIG);
  delete trimmed.autonomous;
  delete trimmed.stopGateTotalSec;
  writeHarness(adds, trimmed);

  assertLocalFallback(runCli(['update'], adds, ''));
  const merged = readHarness(adds);

  assert.deepStrictEqual(merged.autonomous, shipped.autonomous, 'missing `autonomous` not restored');
  assert.deepStrictEqual(
    merged.stopGateTotalSec,
    shipped.stopGateTotalSec,
    'missing `stopGateTotalSec` not restored'
  );
  // ...without collateral damage to the keys that WERE there.
  assert.deepStrictEqual(merged.stopGate, USER_CONFIG.stopGate, 'adding a key clobbered stopGate');
  assert.deepStrictEqual(merged.baseBranch, USER_CONFIG.baseBranch, 'adding a key clobbered baseBranch');
});

// ─── A malformed harness.json fails LOUDLY, never silently replaced ─────────

test('update FAILS LOUDLY on a malformed harness.json and leaves it untouched', () => {
  const broken = installProject('broken');
  const brokenPath = path.join(broken, HARNESS_REL);
  const raw = '{ "stopGate": ["npm test"],, }\n'; // trailing comma — not JSON
  fs.writeFileSync(brokenPath, raw);

  let status = 0;
  let stderr = '';
  try {
    runCli(['update'], broken, '');
  } catch (e) {
    status = e.status;
    stderr = (e.stderr || '') + (e.stdout || '');
  }

  assert.notStrictEqual(status, 0, 'update must exit non-zero on a malformed harness.json');
  assert.ok(
    /harness\.json/.test(stderr) && /valid JSON|by hand/.test(stderr),
    'the failure must name harness.json and tell the user to fix it by hand, got: ' + stderr
  );
  assert.strictEqual(
    fs.readFileSync(brokenPath, 'utf-8'),
    raw,
    'a harness.json we cannot parse must be left EXACTLY as it was — it may hold the stop gate'
  );
});

// ─── A write that dies partway must not take harness.json with it ────────────
//
// harness.json is no longer backed up by update (it is user config, not template content),
// and it was still being written with a bare fs.writeFileSync -- which opens with O_TRUNC:
// it EMPTIES the file, then writes. Die in that gap and the user has an empty harness.json:
// no stopGate (the gate is disarmed), no baseBranch (the guard falls back to main), and no
// .backup to recover from.
//
// Simulated INSIDE a real `update` run, via a --require preload that models the failure
// faithfully: the truncation succeeds, the write does not. A non-atomic writer lands that on
// harness.json and destroys it; an atomic one lands it on a temp file and never opens
// harness.json for writing at all.
test('a mid-write failure during `update` leaves harness.json intact (atomic write)', () => {
  const crash = installProject('crash');
  writeHarness(crash, USER_CONFIG);
  const harnessPath = path.join(crash, HARNESS_REL);
  const before = fs.readFileSync(harnessPath, 'utf-8');

  const preload = path.join(TMP, 'fail-harness-write.js');
  fs.writeFileSync(
    preload,
    "const fs = require('fs');\n" +
      'const realWriteFileSync = fs.writeFileSync;\n' +
      'fs.writeFileSync = function (target) {\n' +
      "  if (typeof target === 'string' && /harness\\.json/.test(target)) {\n" +
      "    realWriteFileSync.call(fs, target, '');\n" + // O_TRUNC succeeded...
      "    throw new Error('ENOSPC: simulated disk-full writing ' + target);\n" + // ...write did not
      '  }\n' +
      '  return realWriteFileSync.apply(fs, arguments);\n' +
      '};\n'
  );

  const run = runCliExpectingFailure(['update'], crash, '', {
    NODE_OPTIONS: '--require ' + preload,
  });

  assert.notStrictEqual(run.status, 0, 'a failed write must never be reported as a successful update');

  const raw = fs.readFileSync(harnessPath, 'utf-8');
  assert.notStrictEqual(raw.trim(), '', 'harness.json was TRUNCATED — the stop gate is gone');

  let after;
  try {
    after = JSON.parse(raw);
  } catch (e) {
    throw new Error('harness.json is no longer parseable after a failed write: ' + JSON.stringify(raw));
  }
  assert.deepStrictEqual(after.stopGate, USER_CONFIG.stopGate, 'stopGate did not survive the failed write');
  assert.deepStrictEqual(after.baseBranch, USER_CONFIG.baseBranch, 'baseBranch did not survive the failed write');
  assert.strictEqual(raw, before, 'harness.json must be byte-for-byte what it was');

  // A crashed write must not leave a half-written temp file behind in .claude/.
  const strays = fs
    .readdirSync(path.join(crash, '.claude'))
    .filter((f) => /harness\.json\./.test(f));
  assert.deepStrictEqual(strays, [], 'a failed write left temp files behind: ' + strays.join(', '));
});

try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch (_) {}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
