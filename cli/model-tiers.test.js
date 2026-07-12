// cli/model-tiers.test.js
//
// Tests the role->model resolver and the reviewer-is-the-sibling rule.

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  DEFAULT_MODELS, readModels, writeModels,
  resolveModel, resolveReviewer, reviewerRoleFor, isStale,
} = require('./model-tiers');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}
function threw(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

// --- the reviewer inversion: the rule this whole phase exists to encode ---
assert('deep-written code is reviewed by build', reviewerRoleFor('deep') === 'build');
assert('build-written code is reviewed by deep', reviewerRoleFor('build') === 'deep');
assert('scout never implements — its reviewer fails SAFE, to deep', reviewerRoleFor('scout') === 'deep');

assert('opus-written code is reviewed by sonnet',
  resolveReviewer(DEFAULT_MODELS, 'claude', 'deep') === 'sonnet');
assert('sol-written code is reviewed by terra',
  resolveReviewer(DEFAULT_MODELS, 'codex', 'deep') === 'gpt-5.6-terra');
assert('sonnet-written code is reviewed by opus',
  resolveReviewer(DEFAULT_MODELS, 'claude', 'build') === 'opus');
assert('terra-written code is reviewed by sol',
  resolveReviewer(DEFAULT_MODELS, 'codex', 'build') === 'gpt-5.6-sol');

// The invariant behind the rule: a reviewer is NEVER the model that wrote the code.
assert('reviewer never equals the implementer, claude',
  resolveReviewer(DEFAULT_MODELS, 'claude', 'deep') !== resolveModel(DEFAULT_MODELS, 'claude', 'deep'));
assert('reviewer never equals the implementer, codex',
  resolveReviewer(DEFAULT_MODELS, 'codex', 'build') !== resolveModel(DEFAULT_MODELS, 'codex', 'build'));

// --- resolution ---
assert('scout resolves to haiku on claude', resolveModel(DEFAULT_MODELS, 'claude', 'scout') === 'haiku');
assert('deep resolves to sol on codex', resolveModel(DEFAULT_MODELS, 'codex', 'deep') === 'gpt-5.6-sol');
assert('an unknown role throws rather than silently picking a model',
  /unknown role/i.test(String(threw(function () { resolveModel(DEFAULT_MODELS, 'claude', 'reviewer'); }))));
assert('an unknown harness throws',
  /unknown harness/i.test(String(threw(function () { resolveModel(DEFAULT_MODELS, 'gemini', 'deep'); }))));

// --- staleness ---
var NOW = new Date('2026-07-12T00:00:00Z');
assert('a checkedAt older than maxDays is stale', isStale('2026-06-01', 30, NOW) === true);
assert('a fresh checkedAt is not stale', isStale('2026-07-01', 30, NOW) === false);
assert('a missing checkedAt is stale (never checked = needs checking)', isStale(undefined, 30, NOW) === true);
assert('an unparseable checkedAt is stale, never silently OK', isStale('not-a-date', 30, NOW) === true);
assert('a future-dated checkedAt is stale, not fresh (clock skew / typo / hand-edit)',
  isStale('2099-01-01', 30, NOW) === true);

// REGRESSION (real bug, shipped and caught): `checkedAt` is a bare date, which
// Date.parse reads as midnight UTC, but /models writes the user's LOCAL date. East of
// UTC those disagree — at 00:16 in UTC+3 a map checked TODAY parses ~3h in the FUTURE.
// A bare `age < 0 => stale` therefore nagged the user who had just re-verified the map,
// on every single session. Tolerate a day of skew; still reject implausible futures.
var d = new Date();
var localToday = d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');
assert("a map checked TODAY (user's LOCAL date) is NOT stale, in any timezone",
  isStale(localToday, 30, new Date()) === false);
assert('a date one day ahead is tolerated as clock/timezone skew, not stale',
  isStale('2026-07-13', 30, new Date('2026-07-12T21:16:00Z')) === false);
assert('a date far in the future is still STALE (a typo is not skew)',
  isStale('2026-09-01', 30, new Date('2026-07-12T21:16:00Z')) === true);

// --- the shared-file contract (harness.json also holds the stop gate) ---
var TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'phe-models-'));

var keep = path.join(TEST_DIR, 'keep');
fs.mkdirSync(path.join(keep, '.claude'), { recursive: true });
fs.writeFileSync(path.join(keep, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: ['npm test'], vault: { mode: 'none' }, harness: ['claude'] }));
writeModels(keep, DEFAULT_MODELS);
var after = JSON.parse(fs.readFileSync(path.join(keep, '.claude', 'harness.json'), 'utf-8'));
assert('writeModels preserves the stop gate', JSON.stringify(after.stopGate) === '["npm test"]');
assert('writeModels preserves vault', after.vault && after.vault.mode === 'none');
assert('writeModels preserves harness targets', JSON.stringify(after.harness) === '["claude"]');
assert('writeModels writes the map', after.models.claude.deep === 'opus');

var bad = path.join(TEST_DIR, 'bad');
fs.mkdirSync(path.join(bad, '.claude'), { recursive: true });
fs.writeFileSync(path.join(bad, '.claude', 'harness.json'), '{ not json');
assert('writeModels REFUSES to write through a malformed harness.json',
  threw(function () { writeModels(bad, DEFAULT_MODELS); }) instanceof Error);
assert('readModels degrades to null on malformed harness.json (never crashes init)',
  readModels(bad) === null);

var arrayShape = path.join(TEST_DIR, 'array-shape');
fs.mkdirSync(path.join(arrayShape, '.claude'), { recursive: true });
fs.writeFileSync(path.join(arrayShape, '.claude', 'harness.json'), '[1,2,3]');
assert('writeModels REFUSES to write through a harness.json that parses to a bare array',
  threw(function () { writeModels(arrayShape, DEFAULT_MODELS); }) instanceof Error);

var numberShape = path.join(TEST_DIR, 'number-shape');
fs.mkdirSync(path.join(numberShape, '.claude'), { recursive: true });
fs.writeFileSync(path.join(numberShape, '.claude', 'harness.json'), '42');
assert('writeModels REFUSES to write through a harness.json that parses to a bare number',
  threw(function () { writeModels(numberShape, DEFAULT_MODELS); }) instanceof Error);

var nullShape = path.join(TEST_DIR, 'null-shape');
fs.mkdirSync(path.join(nullShape, '.claude'), { recursive: true });
fs.writeFileSync(path.join(nullShape, '.claude', 'harness.json'), 'null');
assert('writeModels REFUSES to write through a harness.json that parses to JSON null',
  threw(function () { writeModels(nullShape, DEFAULT_MODELS); }) instanceof Error);

fs.rmSync(TEST_DIR, { recursive: true, force: true });

// Drift guard: the SHIPPED map and the resolver's DEFAULT_MODELS must never diverge.
// Without this, editing one and not the other ships a map the resolver disagrees with.
var shipped = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'template', '.claude', 'harness.json'), 'utf-8'));
assert('the shipped template harness.json models === DEFAULT_MODELS',
  JSON.stringify(shipped.models) === JSON.stringify(DEFAULT_MODELS));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
