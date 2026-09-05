#!/usr/bin/env node
'use strict';
// .claude/tooling/run-check.mjs: run ONE gate command, keep the whole output on disk,
// print only the exit line and a tail. /validate runs every gate command through it so a
// failing suite's thousands of lines never enter the context window (analysis 2026-09-05, 2.3).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync, spawn } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'template', '.claude', 'tooling', 'run-check.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'run-check-'));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd: TMP, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
const noisy = 'node -e "for (let i = 1; i <= 100; i++) console.log(\'line \' + i); process.exit(3)"';

console.log('\nrun-check: gate output stays on disk\n');

test('a failing command: exit code passes through, tail is 40 lines, log holds everything', () => {
  const r = run(['unit', '--', noisy]);
  assert.strictEqual(r.code, 3, 'exit code must be the command\'s');
  const lines = r.out.trimEnd().split('\n');
  assert.ok(/^exit=3 · log=\.claude\/state\/checks\/unit\.log · 100 lines$/.test(lines[0]), 'header line, got: ' + lines[0]);
  assert.strictEqual(lines.length, 41, 'header + 40 tail lines, got ' + lines.length);
  assert.strictEqual(lines[1], 'line 61');
  assert.strictEqual(lines[40], 'line 100');
  const log = fs.readFileSync(path.join(TMP, '.claude', 'state', 'checks', 'unit.log'), 'utf-8');
  assert.strictEqual(log.trimEnd().split('\n').length, 100, 'log must keep the full output');
});

test('a passing command exits 0 and honors --tail', () => {
  const r = run(['lint', '--tail', '2', '--', 'node -e "console.log(\'a\'); console.log(\'b\'); console.log(\'c\')"']);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.out.trimEnd().split('\n').slice(1), ['b', 'c']);
});

test('stderr is captured into the log too', () => {
  run(['err', '--', 'node -e "console.error(\'boom\'); process.exit(1)"']);
  assert.ok(fs.readFileSync(path.join(TMP, '.claude', 'state', 'checks', 'err.log'), 'utf-8').includes('boom'));
});

test('a label is sanitized to a safe filename', () => {
  run(['npm test/../x', '--', 'node -e "0"']);
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'state', 'checks', 'npm-test-x.log')), 'label not sanitized');
});

test('a wedged command is killed after --timeout-sec and reports exit 124', () => {
  const r = run(['slow', '--timeout-sec', '1', '--', 'node -e "setTimeout(() => {}, 5000)"']);
  assert.strictEqual(r.code, 124, 'a timeout is exit 124');
  const header = r.out.trimEnd().split('\n')[0];
  assert.ok(/^exit=124 · log=\.claude\/state\/checks\/slow\.log · \d+ lines · timed out after 1s$/.test(header), 'header names the timeout, got: ' + header);
});

test('a command the shell cannot find still exits non-zero and writes a log', () => {
  const r = run(['missing', '--', 'definitely-not-a-command-xyz']);
  assert.notStrictEqual(r.code, 0, 'a missing command must not report success');
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'state', 'checks', 'missing.log')), 'log must exist');
});

test('a child killed by a signal is reported as a signal death, not a timeout', () => {
  const r = run(['segv', '--', 'node -e "process.kill(process.pid, \'SIGSEGV\')"']);
  assert.strictEqual(r.code, 1, 'a signal death is exit 1, not 124');
  const header = r.out.trimEnd().split('\n')[0];
  assert.ok(/killed by SIGSEGV/.test(header), 'header names the signal, got: ' + header);
  assert.ok(!/timed out/.test(header), 'a signal death must not claim a timeout, got: ' + header);
});

test('output written before an outer kill survives on disk', () => {
  const child = spawn('node', [SCRIPT, 'outer', '--', 'node -e "console.log(\'early\'); setTimeout(() => {}, 10000)"'], { cwd: TMP, stdio: 'ignore' });
  sleep(2000);
  child.kill('SIGKILL');
  sleep(500);
  const log = fs.readFileSync(path.join(TMP, '.claude', 'state', 'checks', 'outer.log'), 'utf-8');
  assert.ok(log.includes('early'), 'partial output must survive the runner being killed, got: ' + JSON.stringify(log));
});

test('missing -- separator is a usage error, exit 64', () => {
  const r = run(['nolabel']);
  assert.strictEqual(r.code, 64);
  assert.ok(/usage/.test(r.out));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
