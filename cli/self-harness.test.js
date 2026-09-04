#!/usr/bin/env node
'use strict';
// tools/self-harness.mjs: the framework repo runs under its own payload. Sync copies
// template/.claude -> <root>/.claude through the CLI's own backupAndCopy; --check fails on
// drift so the root stop gate forces a re-sync after every template edit. Two skills are
// project content (filled per project) and are copied once, never re-synced.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = path.join(REPO, 'tools', 'self-harness.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'self-harness-'));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args, cwd) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
// A miniature template: one hook, one rule, one pipeline skill, one adapted skill, settings.
function makeTemplate(dir) {
  fs.mkdirSync(path.join(dir, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'rules'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'validate'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'architecture-map'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hooks', 'guard.mjs'), 'console.log("v1")\n');
  fs.writeFileSync(path.join(dir, 'rules', '00-core.md'), '# core v1\n');
  fs.writeFileSync(path.join(dir, 'skills', 'validate', 'SKILL.md'), '---\nname: validate\n---\nv1\n');
  fs.writeFileSync(path.join(dir, 'skills', 'architecture-map', 'SKILL.md'), '---\nname: architecture-map\n---\n<placeholder>\n');
  fs.writeFileSync(path.join(dir, 'settings.json'), '{"hooks":{}}\n');
  fs.writeFileSync(path.join(dir, 'settings.local.json'), '{"personal":true}\n');
  fs.writeFileSync(path.join(dir, 'harness.json'), JSON.stringify({ $comment: 'shipped', stopGate: [], baseBranch: null }) + '\n');
}

console.log('\nself-harness: root runs the payload\n');

const tpl = path.join(TMP, 'template', '.claude');
makeTemplate(tpl);
const root = path.join(TMP, 'root');
fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
fs.writeFileSync(path.join(root, '.claude', 'harness.json'), JSON.stringify({ stopGate: ['node x.mjs'], harness: ['claude'] }) + '\n');
const args = ['--root', root, '--template', tpl];

test('fresh sync copies the payload and keeps the root harness.json keys', () => {
  const r = run(args, root);
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude', 'hooks', 'guard.mjs'), 'utf-8'), 'console.log("v1")\n');
  assert.ok(fs.existsSync(path.join(root, '.claude', 'skills', 'architecture-map', 'SKILL.md')), 'adapted skill copied on first sync');
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'settings.local.json')), 'settings.local.json never shipped');
  const h = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'harness.json'), 'utf-8'));
  assert.deepStrictEqual(h.stopGate, ['node x.mjs'], 'root stopGate overwritten');
  assert.strictEqual(h.$comment, 'shipped', 'template $comment not merged in');
  assert.deepStrictEqual(h.harness, ['claude']);
});

test('--check passes right after a sync', () => {
  const r = run(args.concat('--check'), root);
  assert.strictEqual(r.code, 0, r.out);
});

test('--check fails and names the file when the template moves on', () => {
  fs.writeFileSync(path.join(tpl, 'hooks', 'guard.mjs'), 'console.log("v2")\n');
  const r = run(args.concat('--check'), root);
  assert.strictEqual(r.code, 1, 'drift must exit 1');
  assert.ok(/differs\s+hooks\/guard\.mjs/.test(r.out), 'must name hooks/guard.mjs, got: ' + r.out);
});

test('re-sync heals the drift and leaves the adapted skill alone', () => {
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'architecture-map', 'SKILL.md'), '---\nname: architecture-map\n---\nfilled for THIS repo\n');
  const r = run(args, root);
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude', 'hooks', 'guard.mjs'), 'utf-8'), 'console.log("v2")\n');
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude', 'skills', 'architecture-map', 'SKILL.md'), 'utf-8'), '---\nname: architecture-map\n---\nfilled for THIS repo\n', 'adapted skill was re-synced');
  assert.strictEqual(run(args.concat('--check'), root).code, 0, '--check red after a sync');
});

test('--check reports a file the root lacks as missing', () => {
  fs.unlinkSync(path.join(root, '.claude', 'rules', '00-core.md'));
  const r = run(args.concat('--check'), root);
  assert.strictEqual(r.code, 1);
  assert.ok(/missing\s+rules\/00-core\.md/.test(r.out), r.out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
