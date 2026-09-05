#!/usr/bin/env node
'use strict';
// .claude/tooling/memory-delta.mjs: auto-memory `feedback` entries are corrections the team never
// got. /evolve diffs MEMORY.md against the copy taken at its last run (analysis 2026-09-05, 4.2).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'template', '.claude', 'tooling', 'memory-delta.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-delta-'));
const MEM = path.join(TMP, 'MEMORY.md');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args, env) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd: TMP, encoding: 'utf-8', env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

console.log('\nmemory-delta: corrections saved to memory reach /evolve\n');

test('no auto-memory file → says so, exit 0', () => {
  const r = run(['diff'], { PHE_MEMORY_FILE: path.join(TMP, 'absent.md') });
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/no auto-memory file at .*absent\.md/.test(r.out), r.out);
});

test('diff before any snapshot → asks for one, exit 0', () => {
  fs.writeFileSync(MEM, '- [A](a.md) — first\n');
  const r = run(['diff'], { PHE_MEMORY_FILE: MEM });
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/no snapshot yet/.test(r.out), r.out);
});

test('snapshot then a new line → the diff prints exactly that line', () => {
  assert.strictEqual(run(['snapshot'], { PHE_MEMORY_FILE: MEM }).code, 0);
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'state', 'evolve-memory.md')));
  fs.appendFileSync(MEM, '- [B](b.md) — a correction\n');
  const r = run(['diff'], { PHE_MEMORY_FILE: MEM });
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('+ - [B](b.md) — a correction'), r.out);
  assert.ok(!r.out.includes('+ - [A]'), 'unchanged lines are not printed');
});

test('nothing new → says so', () => {
  run(['snapshot'], { PHE_MEMORY_FILE: MEM });
  const r = run(['diff'], { PHE_MEMORY_FILE: MEM });
  assert.ok(/no new MEMORY\.md lines/.test(r.out), r.out);
});

test('the default path is derived from the root with slashes turned into dashes', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const encoded = TMP.replace(/[\\/]/g, '-');
  const dir = path.join(cfg, 'projects', encoded, 'memory'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), '- [C](c.md) — via config dir\n');
  const r = run(['snapshot', '--root', TMP], { CLAUDE_CONFIG_DIR: cfg, PHE_MEMORY_FILE: '' });
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(fs.readFileSync(path.join(TMP, '.claude', 'state', 'evolve-memory.md'), 'utf-8'), '- [C](c.md) — via config dir\n');
});

test('an unknown subcommand is a usage error, exit 64', () => {
  assert.strictEqual(run(['bogus'], { PHE_MEMORY_FILE: MEM }).code, 64);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
