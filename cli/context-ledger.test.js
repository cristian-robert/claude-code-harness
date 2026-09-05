#!/usr/bin/env node
'use strict';
// tools/context-ledger.mjs: the always-loaded tax, plus (2026-09-05, analysis 3.1/6.4) skill
// bodies measured in tokens — a 100-line skill can be 4k tokens and is cut at 5k after
// compaction — and docs/ measured at all, so the 130-line rule stops being decorative.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'tools', 'context-ledger.mjs');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
function project(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'big'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'quiet'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# A\nline two\nline three\n');
  fs.writeFileSync(path.join(dir, '.claude', 'rules', 'always.md'), '# always\n- rule\n');
  fs.writeFileSync(path.join(dir, '.claude', 'rules', 'scoped.md'), '---\npaths:\n  - "src/**"\n---\n# scoped\n');
  // 200 words per line: the token thresholds must trip WITHOUT the 100/120 line caps tripping first.
  const bigBody = Array.from({ length: Math.max(1, Math.round(opts.bigWords / 200)) }, () => Array.from({ length: 200 }, (_, i) => 'w' + i).join(' ')).join('\n');
  fs.writeFileSync(path.join(dir, '.claude', 'skills', 'big', 'SKILL.md'), '---\nname: big\ndescription: "d"\ndisable-model-invocation: true\n---\n' + bigBody + '\n');
  fs.writeFileSync(path.join(dir, '.claude', 'skills', 'quiet', 'SKILL.md'), '---\nname: quiet\ndescription: "always listed"\n---\nshort body\n');
  if (opts.docs) {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    for (const [name, n] of Object.entries(opts.docs)) fs.writeFileSync(path.join(dir, 'docs', name), Array.from({ length: n }, (_, i) => 'l' + i).join('\n') + '\n');
  }
  return dir;
}

console.log('\ncontext-ledger: measured, not estimated\n');

test('unscoped rules count, paths-scoped rules do not, disabled skills cost nothing always-loaded', () => {
  const r = run([project({ bigWords: 100 })]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('.claude/rules/always.md'), r.out);
  assert.ok(!/^\.claude\/rules\/scoped\.md/m.test(r.out), 'scoped rule must not be a row');
  assert.ok(r.out.includes('.claude/skills/quiet/SKILL.md (frontmatter)'), r.out);
  assert.ok(!r.out.includes('.claude/skills/big/SKILL.md (frontmatter)'), 'disabled skill must not be an always-loaded row');
});

test('skill bodies get their own table in tokens, disabled skills included, not added to TOTAL', () => {
  const r = run([project({ bigWords: 100 })]);
  assert.ok(/Skill bodies/.test(r.out), r.out);
  assert.ok(/^\.claude\/skills\/big\/SKILL\.md\s+\d+\s+\d+/m.test(r.out), 'big body row with lines and tokens');
  const total = Number((r.out.match(/^TOTAL\s+(\d+)/m) || [])[1]);
  assert.ok(total > 0 && total < 100, 'TOTAL stays the always-loaded tax only, got ' + total);
});

test('a skill body over 5000 est. tokens is a hard violation, exit 1', () => {
  const r = run([project({ bigWords: 4000 })]); // 4000 words × 1.33 ≈ 5320 tokens
  assert.strictEqual(r.code, 1, r.out);
  assert.ok(/HARD .*skills\/big.*tokens/.test(r.out), r.out);
});

test('a skill body between 4000 and 5000 est. tokens is a soft warn, exit 0', () => {
  const r = run([project({ bigWords: 3200 })]); // ≈ 4256 tokens
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/WARN .*skills\/big.*tokens/.test(r.out), r.out);
});

test('--docs lists every doc with its line count; 130 passes, 131 is a hard violation', () => {
  const ok = run([project({ bigWords: 100, docs: { 'a.md': 130 } }), '--docs', 'docs']);
  assert.strictEqual(ok.code, 0, ok.out);
  assert.ok(/^docs\/a\.md\s+130/m.test(ok.out), ok.out);
  const over = run([project({ bigWords: 100, docs: { 'a.md': 130, 'b.md': 131 } }), '--docs', 'docs']);
  assert.strictEqual(over.code, 1, over.out);
  assert.ok(/HARD docs\/b\.md: 131 lines > 130/.test(over.out), over.out);
});

test('--docs on a missing directory is a hard violation, never a silent pass', () => {
  const r = run([project({ bigWords: 100 }), '--docs', 'nope']);
  assert.strictEqual(r.code, 1, r.out);
  assert.ok(/HARD .*nope/.test(r.out), r.out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
