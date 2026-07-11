// cli/harness-targets.test.js
//
// Tests harness-target parsing and persistence in .claude/harness.json.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  parseHarnessAnswer,
  readHarnessTargets,
  writeHarnessTargets,
} = require('./harness-targets');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const TEST_DIR = path.join(os.tmpdir(), 'harness-targets-test-' + crypto.randomUUID());

console.log('parseHarnessAnswer:');
assert('"1" -> claude', JSON.stringify(parseHarnessAnswer('1')) === '["claude"]');
assert('"2" -> codex', JSON.stringify(parseHarnessAnswer('2')) === '["codex"]');
assert('"3" -> both', JSON.stringify(parseHarnessAnswer('3')) === '["claude","codex"]');
assert('"claude" -> claude', JSON.stringify(parseHarnessAnswer('claude')) === '["claude"]');
assert('"Codex" (case-insensitive) -> codex', JSON.stringify(parseHarnessAnswer('Codex')) === '["codex"]');
assert('"both" -> both', JSON.stringify(parseHarnessAnswer('both')) === '["claude","codex"]');
assert('"  both  " (whitespace) -> both', JSON.stringify(parseHarnessAnswer('  both  ')) === '["claude","codex"]');
assert('empty -> null', parseHarnessAnswer('') === null);
assert('garbage -> null', parseHarnessAnswer('emacs') === null);
assert('always sorted', JSON.stringify(parseHarnessAnswer('both')) === '["claude","codex"]');

console.log('readHarnessTargets:');
fs.mkdirSync(path.join(TEST_DIR, 'proj', '.claude'), { recursive: true });
var PROJ = path.join(TEST_DIR, 'proj');
assert('missing harness.json -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ stopGate: [] }));
assert('harness.json without harness key -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ not json');
assert('malformed harness.json -> null (no throw)', readHarnessTargets(PROJ) === null);

console.log('writeHarnessTargets:');
// Preserving other keys is the whole point — harness.json holds the stop gate.
fs.writeFileSync(
  path.join(PROJ, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: ['npm test'], workTracking: { backend: 'none' } }, null, 2)
);
writeHarnessTargets(PROJ, ['claude', 'codex']);
var after = JSON.parse(fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8'));
assert('harness key written', JSON.stringify(after.harness) === '["claude","codex"]');
assert('stopGate preserved', JSON.stringify(after.stopGate) === '["npm test"]');
assert('workTracking preserved', after.workTracking.backend === 'none');
assert('round-trips through readHarnessTargets', JSON.stringify(readHarnessTargets(PROJ)) === '["claude","codex"]');

// Writing when harness.json does not exist yet must create it, not crash.
var FRESH = path.join(TEST_DIR, 'fresh');
fs.mkdirSync(path.join(FRESH, '.claude'), { recursive: true });
writeHarnessTargets(FRESH, ['codex']);
assert('creates harness.json when absent', JSON.stringify(readHarnessTargets(FRESH)) === '["codex"]');

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
