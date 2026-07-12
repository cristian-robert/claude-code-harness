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

function threw(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

console.log('readHarnessTargets:');
fs.mkdirSync(path.join(TEST_DIR, 'proj', '.claude'), { recursive: true });
var PROJ = path.join(TEST_DIR, 'proj');
var PROJ_HARNESS = path.join(PROJ, '.claude', 'harness.json');
assert('missing harness.json -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(PROJ_HARNESS, JSON.stringify({ stopGate: [] }));
assert('harness.json without harness key -> null (legacy project)', readHarnessTargets(PROJ) === null);

fs.writeFileSync(PROJ_HARNESS, '{ not json');
assert('malformed harness.json -> null (no throw)', readHarnessTargets(PROJ) === null);

// Finding 3: unrecognised harness names must not round-trip as if they were valid —
// downstream code (init.js/update.js) branches on these values with indexOf('codex').
fs.writeFileSync(PROJ_HARNESS, JSON.stringify({ harness: ['foo'] }));
assert('unknown harness name -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(PROJ_HARNESS, JSON.stringify({ harness: ['claude', 'bogus'] }));
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

// Minor 3: a truthy NON-object (e.g. a bare array) parses without throwing,
// but `current.harness = targets` on an array sets a property JSON.stringify
// silently drops -- the array round-trips unchanged, the harness choice is
// lost, and "Setup complete!" prints as if nothing went wrong. The module's
// stated contract is "the write REFUSES on malformed input" -- today it
// silently succeeds and loses data. Write must refuse here exactly like the
// unparseable-JSON case.
var ARRAYJSON = path.join(TEST_DIR, 'arrayjson');
fs.mkdirSync(path.join(ARRAYJSON, '.claude'), { recursive: true });
var arrayJsonPath = path.join(ARRAYJSON, '.claude', 'harness.json');
var arrayJsonContent = JSON.stringify([1, 2]);
fs.writeFileSync(arrayJsonPath, arrayJsonContent);
var arrayThrown = null;
try {
  writeHarnessTargets(ARRAYJSON, ['claude']);
} catch (e) {
  arrayThrown = e;
}
assert('write throws on a truthy non-object (array) existing harness.json', arrayThrown instanceof Error);
assert(
  'array-case error message names the file',
  !!arrayThrown && arrayThrown.message.indexOf(arrayJsonPath) !== -1
);
assert(
  'write does not modify the array-holding file',
  fs.readFileSync(arrayJsonPath, 'utf-8') === arrayJsonContent
);

// A bare JSON scalar (number/string/bool) is the same class of bug —
// typeof !== 'object' catches it in one check alongside the array case.
var SCALARJSON = path.join(TEST_DIR, 'scalarjson');
fs.mkdirSync(path.join(SCALARJSON, '.claude'), { recursive: true });
var scalarJsonPath = path.join(SCALARJSON, '.claude', 'harness.json');
fs.writeFileSync(scalarJsonPath, '42');
var scalarThrown = null;
try {
  writeHarnessTargets(SCALARJSON, ['claude']);
} catch (e) {
  scalarThrown = e;
}
assert('write throws on a bare JSON scalar (number) existing harness.json', scalarThrown instanceof Error);

// null is also not a mergeable object -- refuse rather than silently
// substitute an empty object and proceed.
var NULLJSON = path.join(TEST_DIR, 'nulljson');
fs.mkdirSync(path.join(NULLJSON, '.claude'), { recursive: true });
var nullJsonPath = path.join(NULLJSON, '.claude', 'harness.json');
fs.writeFileSync(nullJsonPath, 'null');
var nullThrown = null;
try {
  writeHarnessTargets(NULLJSON, ['claude']);
} catch (e) {
  nullThrown = e;
}
assert('write throws on a JSON null existing harness.json', nullThrown instanceof Error);

// `update` writes harness.json twice back to back (installHarnessConfig merges the template's
// new keys in, then this re-records the targets). The second write changes nothing for any
// project that already has a `harness` key, and every write to this file is a chance to lose
// it. Byte-identical content proves the file was not rewritten at all -- a rewrite would
// re-indent this deliberately-compact JSON.
console.log('writeHarnessTargets skips a write that would change nothing:');
var NOOP = path.join(TEST_DIR, 'noop');
fs.mkdirSync(path.join(NOOP, '.claude'), { recursive: true });
var noopPath = path.join(NOOP, '.claude', 'harness.json');
var noopRaw = '{"harness":["claude","codex"],"stopGate":["npm test"]}';
fs.writeFileSync(noopPath, noopRaw);
writeHarnessTargets(NOOP, ['codex', 'claude']); // same targets, unsorted
assert('already-recorded targets: file left byte-identical', fs.readFileSync(noopPath, 'utf-8') === noopRaw);

// ...but a legacy project (no `harness` key) is exactly the case the call site exists for:
// the assumed target must be MATERIALIZED, or it is re-assumed on every future run.
var LEGACY = path.join(TEST_DIR, 'legacy');
fs.mkdirSync(path.join(LEGACY, '.claude'), { recursive: true });
var legacyPath = path.join(LEGACY, '.claude', 'harness.json');
fs.writeFileSync(legacyPath, JSON.stringify({ stopGate: ['npm test'] }, null, 2));
writeHarnessTargets(LEGACY, ['claude']);
assert('legacy project: harness key is written', JSON.stringify(readHarnessTargets(LEGACY)) === '["claude"]');
assert(
  'legacy project: stopGate survives the write',
  JSON.stringify(JSON.parse(fs.readFileSync(legacyPath, 'utf-8')).stopGate) === '["npm test"]'
);

// ─── Atomicity: a write that fails partway must not destroy harness.json ─────
//
// A bare fs.writeFileSync opens with O_TRUNC -- it EMPTIES the file, THEN writes. If the
// write fails in that gap (disk full, I/O error, a crash), the user is left with an empty
// harness.json: no stopGate (the gate is disarmed) and no baseBranch (the guard falls back
// to main). `update` no longer backs this file up (it is user config, not template content),
// so there is nothing to recover from.
//
// The injector below models that failure HONESTLY: truncate the file, then throw -- which is
// exactly what a real writeFileSync does when the write half fails. Against a non-atomic
// writer it lands on harness.json and destroys it. Against an atomic one it lands on the
// temp file and harness.json is never opened for writing at all.
console.log('writeHarnessTargets is atomic (a failed write leaves the original intact):');

var realWriteFileSync = fs.writeFileSync;
var realRenameSync = fs.renameSync;

function withFailingWrite(match, fn) {
  fs.writeFileSync = function (target) {
    if (typeof target === 'string' && match.test(target)) {
      realWriteFileSync.call(fs, target, ''); // O_TRUNC succeeded...
      throw new Error('ENOSPC: simulated disk-full writing ' + target); // ...the write did not
    }
    return realWriteFileSync.apply(fs, arguments);
  };
  try {
    return threw(fn);
  } finally {
    fs.writeFileSync = realWriteFileSync;
  }
}

var GOOD_CONFIG = {
  stopGate: ['npm test', 'npm run lint'],
  baseBranch: 'develop',
  harness: ['claude'],
};

function freshConfigProject(name) {
  var dir = path.join(TEST_DIR, name);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  realWriteFileSync.call(fs, path.join(dir, '.claude', 'harness.json'),
    JSON.stringify(GOOD_CONFIG, null, 2) + '\n');
  return dir;
}

// Asserts the file survived: still there, still parseable, stop gate and protected branch
// unchanged. "Parseable" matters as much as the values -- an empty file parses as nothing,
// and stop-gate.mjs reading it as {} is a DISARMED gate.
function assertConfigIntact(label, dir) {
  var p = path.join(dir, '.claude', 'harness.json');
  var raw = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
  assert(label + ': harness.json still exists', raw !== null);
  var parsedAfter = null;
  try { parsedAfter = JSON.parse(raw); } catch (e) { /* stays null -> fails below */ }
  assert(label + ': harness.json is still parseable JSON', parsedAfter !== null);
  assert(
    label + ': stopGate is unchanged',
    !!parsedAfter && JSON.stringify(parsedAfter.stopGate) === JSON.stringify(GOOD_CONFIG.stopGate)
  );
  assert(
    label + ': baseBranch is unchanged',
    !!parsedAfter && parsedAfter.baseBranch === 'develop'
  );
  // A crashed write must not litter .claude/ with half-written temp files.
  var strays = fs.readdirSync(path.join(dir, '.claude')).filter(function (f) {
    return f !== 'harness.json';
  });
  assert(label + ': no temp file left behind', strays.length === 0);
}

var FAILW = freshConfigProject('failed-write');
var writeErr = withFailingWrite(/harness\.json/, function () {
  writeHarnessTargets(FAILW, ['claude', 'codex']);
});
assert('a failed write propagates (never reported as success)', writeErr instanceof Error);
assertConfigIntact('failed write', FAILW);

// The rename is the publish step. If IT fails, the original must still be the original --
// and the temp file must not be left behind.
var FAILR = freshConfigProject('failed-rename');
fs.renameSync = function () { throw new Error('EIO: simulated rename failure'); };
var renameErr = threw(function () { writeHarnessTargets(FAILR, ['claude', 'codex']); });
fs.renameSync = realRenameSync;
assert('a failed rename propagates (never reported as success)', renameErr instanceof Error);
assertConfigIntact('failed rename', FAILR);

// The same injector against a SUCCEEDING write: the new targets land, the other keys survive.
// (Guards the atomic path itself -- an implementation that "never writes" would pass every
// destruction test above and be useless.)
var OK = freshConfigProject('atomic-ok');
writeHarnessTargets(OK, ['claude', 'codex']);
var okAfter = JSON.parse(fs.readFileSync(path.join(OK, '.claude', 'harness.json'), 'utf-8'));
assert('a successful atomic write records the targets', JSON.stringify(okAfter.harness) === '["claude","codex"]');
assert('a successful atomic write preserves stopGate', JSON.stringify(okAfter.stopGate) === JSON.stringify(GOOD_CONFIG.stopGate));
assert('a successful atomic write leaves no temp file',
  fs.readdirSync(path.join(OK, '.claude')).length === 1);

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
