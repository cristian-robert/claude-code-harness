#!/usr/bin/env node
'use strict';
// tools/ratchet-greps.mjs: the repo-wide sweep for RETIRED vocabulary. Executable logic lives in a
// tested file (ADR-021), so the four checks get fixtures: a tree carrying each retired term must
// exit 1 and NAME it, a clean tree must print `clean` and exit 0, and the escape hatch
// (`ratchet-ok`) must exempt a deliberate mention without weakening the pattern.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = path.join(REPO, 'tools', 'ratchet-greps.mjs');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(root) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT, '--root', root], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
// A miniature repo: one file per scope entry the tool sweeps.
function makeTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-greps-'));
  fs.mkdirSync(path.join(dir, 'template', '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'cli'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '# clean front page\n');
  fs.writeFileSync(path.join(dir, 'template', '.claude', 'rules', '00-core.md'), '# core\n- routine work stays routine\n');
  fs.writeFileSync(path.join(dir, 'docs', '01.md'), 'Roles are `scout`/`routine`/`build`/`deep`.\n');
  for (const [rel, body] of Object.entries(files || {})) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return dir;
}

console.log('\nratchet-greps: retired vocabulary never survives a rename\n');

test('a clean tree prints clean and exits 0', () => {
  const r = run(makeTree());
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/^clean\s*$/.test(r.out), 'expected exactly `clean`, got: ' + r.out);
});

// One fixture per retired vocabulary — each must FAIL the gate and name the file it hit.
const RETIRED = [
  ['retired "autonomous" key', 'template/.claude/harness.json', '{\n  "autonomous": true\n}\n', /autonomous/i],
  ['retired sibling-model review', 'docs/99.md', 'The reviewer is a sibling model, which defeats sibling review.\n', /sibling/i],
  ['retired three-role list', 'template/.claude/references/x.md', 'Pin a tier: `scout`/`build`/`deep`.\n', /three-role/i],
  ['evolve gate called opt-in', 'cli/thing.js', "// Opt-in evolve->push gate: off unless armed.\n", /opt-?in/i],
];
for (const [label, rel, body, namePattern] of RETIRED) {
  test(`${label} fails the gate and names ${rel}`, () => {
    const r = run(makeTree({ [rel]: body }));
    assert.strictEqual(r.code, 1, 'retired vocabulary must exit 1, got ' + r.code + ': ' + r.out);
    assert.ok(r.out.includes(rel), 'must name ' + rel + ', got: ' + r.out);
    assert.ok(namePattern.test(r.out), 'must name the check, got: ' + r.out);
  });
}

test('all four retired vocabularies are reported in one run', () => {
  const files = {};
  for (const [, rel, body] of RETIRED) files[rel] = body;
  const r = run(makeTree(files));
  assert.strictEqual(r.code, 1, r.out);
  assert.ok(/4 retired-vocabulary hit\(s\)/.test(r.out), 'expected 4 hits, got: ' + r.out);
});

test('a `ratchet-ok` line is a deliberate mention, not a hit', () => {
  const r = run(makeTree({ 'docs/99.md': 'The sibling review inversion was retired. <!-- ratchet-ok -->\n' }));
  assert.strictEqual(r.code, 0, r.out);
});

test('a JS role map with values between the keys is not a three-role list', () => {
  const r = run(makeTree({ 'cli/map.js': "const m = { scout: 'haiku', build: 'opus', deep: 'opus' };\n" }));
  assert.strictEqual(r.code, 0, 'a fixture map must not trip the enumeration check: ' + r.out);
});

test('a four-role enumeration naming routine is current, not stale', () => {
  const r = run(makeTree({ 'docs/02.md': 'Roles: scout|routine|build|deep.\n' }));
  assert.strictEqual(r.code, 0, r.out);
});

test('the sweep is repo-wide — a file in no enumeration is still checked', () => {
  const r = run(makeTree({ 'template/.claude/skills/nobody/SKILL.md': 'tier: scout, build, deep\n' }));
  assert.strictEqual(r.code, 1, 'a file nobody listed must still be swept: ' + r.out);
  assert.ok(r.out.includes('template/.claude/skills/nobody/SKILL.md'), r.out);
});

test('node_modules is skipped', () => {
  const r = run(makeTree({ 'cli/node_modules/dep/index.js': 'var autonomous = { "autonomous": true };\n' }));
  assert.strictEqual(r.code, 0, 'vendored code must not fail the gate: ' + r.out);
});

test('paths outside the swept scope are ignored', () => {
  const r = run(makeTree({ 'reports/old-report.md': 'The `"autonomous": true` key and sibling review.\n' }));
  assert.strictEqual(r.code, 0, 'reports/ is history, not doctrine: ' + r.out);
});

test('the real repo is clean — the gate command it is wired to', () => {
  const r = run(REPO);
  assert.strictEqual(r.code, 0, 'ratchet-greps must be green on this repo:\n' + r.out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
