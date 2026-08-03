// cli/kb-check.test.js
//
// tools/kb-check.mjs is the /validate + /evolve gate on a project-local knowledge base.
// Driven as a REAL process (it is ESM; require() cannot load it), so the exit CODE — the
// only thing a gate is ever judged by — is what these asserts read.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const KB_CHECK = path.join(__dirname, '..', 'tools', 'kb-check.mjs');
const SCAFFOLD = path.join(__dirname, '..', 'template', '.claude', 'references', 'knowledge-base-scaffold');
const TEST_DIR = path.join(os.tmpdir(), 'kb-check-test-' + crypto.randomUUID());

function run(args) {
  var r = spawnSync(process.execPath, [KB_CHECK].concat(args), { encoding: 'utf-8' });
  var out = (r.stdout || '') + (r.stderr || '');
  // A missing or broken script must fail EVERY assert, not accidentally satisfy the ones
  // that only look for a red exit code.
  if (out.indexOf('Cannot find module') !== -1) return { code: -1, out: out };
  return { code: r.status, out: out };
}

console.log('the shipped scaffold:');
var self = run([SCAFFOLD, '--scaffold', SCAFFOLD]);
assert('the shipped scaffold is GREEN', self.code === 0);
assert('(b) is skipped when the checked dir IS the scaffold', self.out.indexOf('(b) skipped') !== -1);

console.log('(a) Index Law:');
var A = path.join(TEST_DIR, 'a');
fs.mkdirSync(path.join(A, 'research'), { recursive: true });
fs.writeFileSync(path.join(A, '_index.md'), '# kb\n');
var a = run([A, '--scaffold', SCAFFOLD]);
assert('a folder with no _index.md is RED', a.code === 1);
assert('the finding names the folder', a.out.indexOf('(a) no _index.md in research/') !== -1);
fs.writeFileSync(path.join(A, 'research', '_index.md'), '# research\n');
assert('adding the _index.md turns it GREEN', run([A, '--scaffold', SCAFFOLD]).code === 0);

console.log('(b) untouched scaffold placeholders:');
var B = path.join(TEST_DIR, 'b');
fs.cpSync(SCAFFOLD, B, { recursive: true });
var b = run([B, '--scaffold', SCAFFOLD]);
assert('a byte-identical copy of the scaffold is RED', b.code === 1);
assert('the finding names architecture.md', b.out.indexOf('(b) still the shipped placeholder: architecture.md') !== -1);
fs.writeFileSync(path.join(B, 'architecture.md'), '# Architecture\n\nreal content\n');
assert('editing one file clears exactly that finding',
  run([B, '--scaffold', SCAFFOLD]).out.indexOf('placeholder: architecture.md') === -1);

console.log('(c) secret shapes:');
var C = path.join(TEST_DIR, 'c');
fs.mkdirSync(C, { recursive: true });
fs.writeFileSync(path.join(C, '_index.md'), '# kb\n');
fs.writeFileSync(path.join(C, 'resources.md'), '# Resources\n\nDeploy key lives in 1Password — pointer only.\n');
assert('a credentials INDEX (pointers only) is GREEN', run([C, '--scaffold', SCAFFOLD]).code === 0);
fs.writeFileSync(path.join(C, 'resources.md'), '# Resources\n\naws_key: AKIAIOSFODNN7EXAMPLE\n');
var c = run([C, '--scaffold', SCAFFOLD]);
assert('an AWS key shape is RED', c.code === 1);
assert('the finding carries file:line', c.out.indexOf('(c) secret-shaped string: resources.md:3') !== -1);

console.log('missing knowledge base:');
assert('a missing knowledge-base/ is RED, not a silent pass',
  run([path.join(TEST_DIR, 'nope'), '--scaffold', SCAFFOLD]).code === 1);

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
