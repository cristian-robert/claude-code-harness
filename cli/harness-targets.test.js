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

console.log('readHarnessTargets:');
fs.mkdirSync(path.join(TEST_DIR, 'proj', '.claude'), { recursive: true });
var PROJ = path.join(TEST_DIR, 'proj');
assert('missing harness.json -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ stopGate: [] }));
assert('harness.json without harness key -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ not json');
assert('malformed harness.json -> null (no throw)', readHarnessTargets(PROJ) === null);

// Finding 3: unrecognised harness names must not round-trip as if they were valid —
// downstream code (init.js/update.js) branches on these values with indexOf('codex').
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ harness: ['foo'] }));
assert('unknown harness name -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ harness: ['claude', 'bogus'] }));
assert('mixed known/unknown harness names -> null', readHarnessTargets(PROJ) === null);

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

// Finding 2: exercise ordering through the actual persistence layer (not a
// hardcoded-literal re-check of parseHarnessAnswer, which can never fail).
writeHarnessTargets(PROJ, ['codex', 'claude']);
assert('sorts unsorted input on write', JSON.stringify(readHarnessTargets(PROJ)) === '["claude","codex"]');

// Finding 1 (CRITICAL): an existing-but-unparseable harness.json must never be
// silently replaced — that would destroy stopGate/workTracking. Write must
// refuse (throw) rather than clobber. Contrast with readHarnessTargets above,
// which degrades to null on the same malformed input: read degrades, write refuses.
var BADJSON = path.join(TEST_DIR, 'badjson');
fs.mkdirSync(path.join(BADJSON, '.claude'), { recursive: true });
var badJsonPath = path.join(BADJSON, '.claude', 'harness.json');
fs.writeFileSync(badJsonPath, '{ not json');
var thrownError = null;
try {
  writeHarnessTargets(BADJSON, ['claude']);
} catch (e) {
  thrownError = e;
}
assert('write throws on unparseable existing harness.json', thrownError instanceof Error);
assert(
  'error message names the file',
  !!thrownError && thrownError.message.indexOf(badJsonPath) !== -1
);
assert(
  'write does not modify the unparseable file',
  fs.readFileSync(badJsonPath, 'utf-8') === '{ not json'
);

// Writing when harness.json does not exist yet must create it, not crash.
var FRESH = path.join(TEST_DIR, 'fresh');
fs.mkdirSync(path.join(FRESH, '.claude'), { recursive: true });
writeHarnessTargets(FRESH, ['codex']);
assert('creates harness.json when absent', JSON.stringify(readHarnessTargets(FRESH)) === '["codex"]');

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
