// cli/model-tiers.test.js
//
// Tests the role->model resolver and the reviewer-is-the-sibling rule.

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  DEFAULT_MODELS, readModels, writeModels,
  resolveModel, resolveReviewer, reviewerRoleFor, isStale, supportedEfforts,
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

// Anything that is not an implementer role is a BUG at the call site, not a role to
// fail safe on. The shipped `if deep -> build; else deep` swallowed undefined, null,
// 'review', 'garbage' and 42 alike, handing back a plausible-looking 'deep' for each —
// so a plan that pinned a typo'd tier reviewed happily and nobody ever knew.
var GARBAGE_ROLES = [undefined, null, '', 'review', 'reviewer', 'garbage', 42, {}];
for (var gi = 0; gi < GARBAGE_ROLES.length; gi++) {
  (function (bad) {
    var err = threw(function () { reviewerRoleFor(bad); });
    assert('reviewerRoleFor(' + JSON.stringify(bad === undefined ? 'undefined' : bad) + ') THROWS rather than silently answering deep',
      err instanceof Error && /scout, build, deep/.test(err.message));
  })(GARBAGE_ROLES[gi]);
}
assert('the throw names the offending value',
  /garbage/.test(String(threw(function () { reviewerRoleFor('garbage'); }))));
assert('resolveReviewer inherits the validation (a bad implementer role never resolves)',
  threw(function () { resolveReviewer(DEFAULT_MODELS, 'claude', 'review'); }) instanceof Error);

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

// --- effort ceilings ---
// The levels a model supports churn WITH the model ID, so they live in the map beside the IDs
// (harness.json -> models.efforts) and not in a constant inside cli/, which an adopter's
// project does not contain. /models refreshes both halves in the same accepted change.
assert('the shipped map records luna WITHOUT ultra (the one 5.6 model that lacks it)',
  supportedEfforts(DEFAULT_MODELS, 'gpt-5.6-luna').indexOf('ultra') === -1);
assert('the shipped map records sol WITH ultra',
  supportedEfforts(DEFAULT_MODELS, 'gpt-5.6-sol').indexOf('ultra') !== -1);
assert('the shipped map records terra WITH ultra',
  supportedEfforts(DEFAULT_MODELS, 'gpt-5.6-terra').indexOf('ultra') !== -1);

// A ceiling with NON-STRING elements must degrade to null, not sail through. The Codex
// catalog lists supported_reasoning_levels as OBJECTS, and /models points the maintainer
// there — so [{effort:"low"},...] pasted verbatim is the realistic bad input. If it reached
// emit as a "known ceiling", the pinned effort string would never match at indexOf and a
// KNOWN model would brick. null means emit warns and proceeds instead.
assert('a ceiling of objects (catalog levels pasted verbatim) degrades to null',
  supportedEfforts({ efforts: { 'gpt-x': [{ effort: 'low' }, { effort: 'high' }] } }, 'gpt-x') === null);
assert('a ceiling with a numeric element degrades to null',
  supportedEfforts({ efforts: { 'gpt-x': ['low', 123] } }, 'gpt-x') === null);
assert('an all-strings ceiling is honored',
  JSON.stringify(supportedEfforts({ efforts: { 'gpt-x': ['low', 'high'] } }, 'gpt-x')) === '["low","high"]');
assert('every codex role in the shipped map has recorded ceilings',
  ['scout', 'build', 'deep'].every(function (r) {
    return supportedEfforts(DEFAULT_MODELS, DEFAULT_MODELS.codex[r]) !== null;
  }));

// null means "we have no ceilings for this model" — a REAL, expected answer, not an error.
// /models can refresh an ID to a model that postdates this package; callers must handle the
// unknown without refusing to work (emit warns and proceeds). Every malformed shape degrades
// to the same null, for the same reason readModels degrades: harness.json is hand-editable
// and a bad map must never crash init/update.
assert('a model with no recorded ceilings resolves to null, not a throw',
  supportedEfforts(DEFAULT_MODELS, 'gpt-5.7-nova') === null);
assert('a map with no efforts key at all resolves to null',
  supportedEfforts({ codex: { deep: 'x' } }, 'x') === null);
assert('a non-array ceilings entry resolves to null (never a crash)',
  supportedEfforts({ efforts: { x: 'low,medium' } }, 'x') === null);
assert('an empty ceilings array resolves to null (an empty list vouches for nothing)',
  supportedEfforts({ efforts: { x: [] } }, 'x') === null);
assert('an efforts key that is an array resolves to null', supportedEfforts({ efforts: [] }, 'x') === null);
assert('a null map resolves to null', supportedEfforts(null, 'x') === null);

// --- staleness ---
var NOW = new Date('2026-07-12T00:00:00Z');
assert('a checkedAt older than maxDays is stale', isStale('2026-06-01', 30, NOW) === true);
assert('a fresh checkedAt is not stale', isStale('2026-07-01', 30, NOW) === false);
assert('a missing checkedAt is stale (never checked = needs checking)', isStale(undefined, 30, NOW) === true);
assert('an unparseable checkedAt is stale, never silently OK', isStale('not-a-date', 30, NOW) === true);
assert('a future-dated checkedAt is stale, not fresh (clock skew / typo / hand-edit)',
  isStale('2099-01-01', 30, NOW) === true);

// `staleDays` is OPTIONAL in harness.json — the hook defaults a missing one to 30, so the
// resolver must too. Without the default, maxDays is undefined, the comparison is against
// NaN, and every comparison is false: an ancient map reads FRESH and the two disagree.
assert('a missing staleDays defaults to 30: an old map is still stale',
  isStale('2020-01-01', undefined, NOW) === true);
assert('a missing staleDays defaults to 30: a recent map is still fresh',
  isStale('2026-07-01', undefined, NOW) === false);

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


// ─── PARITY: the hook and the resolver must agree on staleness ────────────────
// The staleness rule lives TWICE by packaging necessity: .claude/hooks/*.mjs ships
// into adopter repos and must stay dependency-free, while cli/ does not ship at all.
// So the hook cannot import this module. Nothing mechanically kept the two in sync —
// if the 30-day default or the skew tolerance ever moves in one, it silently diverges
// in the other, and the harness starts nagging (or staying silent) at the wrong time.
//
// This is a BEHAVIOURAL parity test, not a source-text comparison: it drives the real
// hook and asserts its warn/silent decision matches isStale() on the same input.
var cp = require('child_process');
var HOOK = path.join(__dirname, '..', 'template', '.claude', 'hooks', 'session-start.mjs');

function hookSaysStale(checkedAt, staleDays) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phe-parity-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'harness.json'), JSON.stringify({
    stopGate: [], models: { checkedAt: checkedAt, staleDays: staleDays, claude: { deep: 'opus' } },
  }));
  var out = cp.execFileSync('node', [HOOK], {
    input: JSON.stringify({ session_id: 'p', cwd: dir, hook_event_name: 'SessionStart', source: 'startup' }),
    encoding: 'utf-8',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  try { return /Model map is stale/.test(JSON.parse(out).hookSpecificOutput.additionalContext); }
  catch (e) { return false; }
}

var d2 = new Date();
var today = d2.getFullYear() + '-' + String(d2.getMonth() + 1).padStart(2, '0') + '-' +
  String(d2.getDate()).padStart(2, '0');
var PARITY = [
  [today, 30],          // checked today, LOCAL date — the timezone bug that shipped
  ['2020-01-01', 30],   // long stale
  ['2099-01-01', 30],   // implausibly future -> stale
  ['2026-01-01', 3650], // old, but a huge staleDays window -> fresh
  // staleDays is OPTIONAL: JSON.stringify drops `undefined`, so the hook reads a config
  // with NO staleDays key — its real-world default path, and the one place the two had
  // already diverged (hook defaults to 30; isStale compared against NaN and said fresh).
  ['2020-01-01', undefined], // no staleDays, long stale -> both must warn
  [today, undefined],        // no staleDays, checked today -> both must stay silent
];
for (var pi = 0; pi < PARITY.length; pi++) {
  var ca = PARITY[pi][0], sd = PARITY[pi][1];
  assert('hook and resolver agree on staleness for (' + ca + ', ' + (sd === undefined ? 'no staleDays' : sd + 'd') + ')',
    hookSaysStale(ca, sd) === isStale(ca, sd, new Date()));
}
// Parity alone can be satisfied by BOTH being wrong. Pin the direction too.
assert('a 2020 map with no staleDays is STALE in the hook (not silently fresh)',
  hookSaysStale('2020-01-01', undefined) === true);

// ─── `update` MUST NOT DESTROY A /models REFRESH ──────────────────────────────
// harness.json is SHARED, and `update` overwrites it wholesale with the template's copy
// before restoring the keys it knows about. It knew about `harness` and `vault` — and not
// `models`, so every `npx phe update` silently reverted the user's refreshed model IDs,
// checkedAt and staleDays to the package defaults. The map then read "fresh" (the shipped
// checkedAt) while pointing at whatever IDs the package was cut with: the exact retired-ID
// dispatch the /models refresh exists to prevent, reintroduced by the upgrade path.
//
// Drives the REAL CLI end-to-end (nothing else proves the copy/restore ordering).
var REFRESHED = {
  checkedAt: '2030-01-01',
  staleDays: 7,
  claude: { scout: 'haiku', build: 'sonnet', deep: 'opus' },
  codex: { scout: 'gpt-5.6-luna', build: 'gpt-5.6-terra', deep: 'gpt-9-refreshed' },
};

var UP = fs.mkdtempSync(path.join(os.tmpdir(), 'phe-update-'));
fs.mkdirSync(path.join(UP, '.claude'), { recursive: true });
fs.writeFileSync(path.join(UP, '.claude', 'harness.json'), JSON.stringify({
  stopGate: ['npm test'],
  harness: ['claude'],
  models: REFRESHED,
}, null, 2) + '\n');

// `update` fetches the PUBLISHED tarball first. Shadow curl with a failing stub so it
// takes the local-fallback path — otherwise this asserts against whatever is on npm,
// not against the working tree, and would pass on a branch that never fixed anything.
var SHADOW = fs.mkdtempSync(path.join(os.tmpdir(), 'phe-shadow-bin-'));
fs.writeFileSync(path.join(SHADOW, 'curl'), '#!/bin/sh\nexit 1\n');
fs.chmodSync(path.join(SHADOW, 'curl'), 0o755);

var updateOut = '';
try {
  updateOut = cp.execFileSync('node', [path.join(__dirname, 'index.js'), 'update'], {
    cwd: UP,
    env: Object.assign({}, process.env, { PATH: SHADOW + path.delimiter + process.env.PATH }),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  updateOut = String((e.stdout || '') + (e.stderr || ''));
}

assert('update ran against THIS working tree (local fallback, not the published package)',
  /local package as fallback/.test(updateOut));

var afterUpdate = readModels(UP);
assert('update preserves the refreshed model id (the /models refresh is not reverted)',
  afterUpdate !== null && afterUpdate.codex && afterUpdate.codex.deep === 'gpt-9-refreshed');
assert('update preserves checkedAt (a reverted date reads FRESH while pointing at stale IDs)',
  afterUpdate !== null && afterUpdate.checkedAt === '2030-01-01');
assert('update preserves staleDays', afterUpdate !== null && afterUpdate.staleDays === 7);

// The restore must not cost the keys update already preserved. (stopGate is NOT asserted
// here: update never restored it either — the template's empty gate wins and /harness-init
// reconciles it from harness.json.backup. That is a separate gap, tracked outside this fix;
// pinning today's behaviour for it here would freeze the bug in place as if intended.)
var afterCfg = JSON.parse(fs.readFileSync(path.join(UP, '.claude', 'harness.json'), 'utf-8'));
assert('update still preserves the harness targets alongside the restored map',
  JSON.stringify(afterCfg.harness) === '["claude"]');

fs.rmSync(UP, { recursive: true, force: true });

// A project that never had a `models` key must not have one invented for it by the
// restore — it gets the template's shipped map from the copy, like any other payload file.
var UP2 = fs.mkdtempSync(path.join(os.tmpdir(), 'phe-update-nomodels-'));
fs.mkdirSync(path.join(UP2, '.claude'), { recursive: true });
fs.writeFileSync(path.join(UP2, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: [], harness: ['claude'] }, null, 2) + '\n');
try {
  cp.execFileSync('node', [path.join(__dirname, 'index.js'), 'update'], {
    cwd: UP2,
    env: Object.assign({}, process.env, { PATH: SHADOW + path.delimiter + process.env.PATH }),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) { /* asserted on the file below, not the exit code */ }
var pre = readModels(UP2);
assert('a pre-models project gets the SHIPPED default map, not a resurrected empty one',
  pre !== null && JSON.stringify(pre) === JSON.stringify(DEFAULT_MODELS));
fs.rmSync(UP2, { recursive: true, force: true });
fs.rmSync(SHADOW, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
