#!/usr/bin/env node
'use strict';
// .claude/tooling/plan-anchors.mjs: a plan cites files by path + a grep-able phrase, never by a
// bare line number — coordinates rot, semantics hold (analysis 2026-09-05, 4.4: two plans cited
// the autonomous-mode reference by line range and both ranges had moved).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'template', '.claude', 'tooling', 'plan-anchors.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-anchors-'));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd: TMP, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
fs.mkdirSync(path.join(TMP, 'src'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'src', 'a.js'), 'const x = 1;\nfunction alpha() {}\nexport { alpha };\n');
const rawPlan = (body) => { const p = path.join(TMP, 'raw-plan.md'); fs.writeFileSync(p, body); return p; };
const plan = (ctx) => { const p = path.join(TMP, 'p-plan.md'); fs.writeFileSync(p, '# P\n\n## Context\n' + ctx + '\n## Tasks\n- Read first: not parsed here\n'); return p; };

console.log('\nplan-anchors: coordinates rot, phrases hold\n');

test('every anchor found → ok lines with the live line number, exit 0', () => {
  const r = run([plan('- Read first: `src/a.js:2` · "function alpha()" — why\n- Pattern to follow: `src/a.js` · "export { alpha }" — what')]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('ok    src/a.js:2 "function alpha()"'), r.out);
  assert.ok(r.out.includes('ok    src/a.js:3 "export { alpha }"'), r.out);
  assert.ok(r.out.includes('anchors: 2 ok, 0 missing, 0 unparsed'), r.out);
});

test('a phrase that moved out of the file is a MISS, exit 1', () => {
  const r = run([plan('- Read first: `src/a.js:2` · "function beta()" — why')]);
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.includes('MISS  src/a.js "function beta()"'), r.out);
  assert.ok(r.out.includes('anchors: 0 ok, 1 missing, 0 unparsed'), r.out);
});

test('a missing file is a MISS that says so', () => {
  const r = run([plan('- Read first: `src/gone.js` · "anything" — why')]);
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.includes('MISS  src/gone.js — file not found'), r.out);
});

test('a Read first line with no parsable anchor is an error, not a silent pass', () => {
  const r = run([plan('- Read first: src/a.js:2 — the old bare-line form')]);
  assert.strictEqual(r.code, 1);
  assert.ok(/no anchors found/.test(r.out), r.out);
});

test('a plan with no Read first line at all passes with zero anchors', () => {
  const r = run([plan('- Library versions: none')]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('anchors: 0 ok, 0 missing, 0 unparsed'), r.out);
});

test('--root resolves paths against another directory', () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-anchors-root-'));
  fs.writeFileSync(path.join(other, 'b.md'), 'needle here\n');
  const r = run([plan('- Read first: `b.md` · "needle here" — why'), '--root', other]);
  assert.strictEqual(r.code, 0, r.out);
});

test('a plan with no ## Context heading fails loudly instead of checking nothing', () => {
  const r = run([rawPlan('# P\n\n### Context\n- Read first: `src/a.js:2` · "function alpha()" — why\n')]);
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.includes('no ## Context section'), r.out);
});

test('a malformed citation beside a good one is UNPARSED, not silently skipped', () => {
  const r = run([plan('- Read first:\n  - `src/a.js:2` · "function alpha()" — why\n  - `src/a.js` — no phrase, the old bare form')]);
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.includes('ok    src/a.js:2 "function alpha()"'), r.out);
  assert.ok(r.out.includes('UNPARSED  6: - `src/a.js` — no phrase, the old bare form'), r.out);
  assert.ok(r.out.includes('anchors: 1 ok, 0 missing, 1 unparsed'), r.out);
});

test('a non-citation line carrying backticked paths is never examined', () => {
  const r = run([plan('- Knowledge to load first: LOCAL: `knowledge-base/architecture.md`, `knowledge-base/decisions.md`\n- Read first: `src/a.js:2` · "function alpha()" — why')]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(!/UNPARSED/.test(r.out), r.out);
  assert.ok(r.out.includes('anchors: 1 ok, 0 missing, 0 unparsed'), r.out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
