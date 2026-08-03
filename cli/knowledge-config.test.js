// cli/knowledge-config.test.js
//
// Tests knowledge-config parsing and persistence of the `knowledge` key in
// .claude/harness.json, and its coexistence with the `harness` key.
//
// The LOCAL store is not a question: every project gets `knowledge-base/`. Only the
// SHARED store (an Obsidian vault holding evergreen wiki/ + agent-kb/) is asked about,
// which is why parseKnowledgeAnswer returns {mode, sharedPath} and never a local path.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { parseKnowledgeAnswer, readKnowledgeConfig, writeKnowledgeConfig, stampMigratedAt } = require('./knowledge-config');
const { writeHarnessTargets } = require('./harness-targets');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const TEST_DIR = path.join(os.tmpdir(), 'knowledge-config-test-' + crypto.randomUUID());

console.log('parseKnowledgeAnswer:');
var HOME = os.homedir();
assert('absolute path -> existing', JSON.stringify(parseKnowledgeAnswer('/Users/x/Vault')) === JSON.stringify({ mode: 'existing', sharedPath: '/Users/x/Vault' }));
assert('trailing slash trimmed', parseKnowledgeAnswer('/Users/x/Vault/').sharedPath === '/Users/x/Vault');
assert('~ expands to home', parseKnowledgeAnswer('~/Vault').sharedPath === path.join(HOME, 'Vault'));
assert('"skip" -> none', JSON.stringify(parseKnowledgeAnswer('skip')) === JSON.stringify({ mode: 'none', sharedPath: null }));
assert('"none" -> none', parseKnowledgeAnswer('none').mode === 'none');
assert('"SKIP" (any case) -> none', parseKnowledgeAnswer('SKIP').mode === 'none');
assert('empty -> none', parseKnowledgeAnswer('').mode === 'none');
assert('whitespace trimmed', parseKnowledgeAnswer('  skip  ').mode === 'none');
assert('relative path -> null (re-ask)', parseKnowledgeAnswer('some/rel/path') === null);
assert('garbage -> null', parseKnowledgeAnswer('maybe?') === null);
assert('non-string -> null', parseKnowledgeAnswer(undefined) === null);

console.log('readKnowledgeConfig:');
var PROJ = path.join(TEST_DIR, 'proj');
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true });
assert('missing harness.json -> null', readKnowledgeConfig(PROJ) === null);
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ stopGate: [] }));
assert('harness.json without knowledge key -> null', readKnowledgeConfig(PROJ) === null);
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ not json');
assert('malformed harness.json -> null (no throw)', readKnowledgeConfig(PROJ) === null);

console.log('writeKnowledgeConfig preserves other keys:');
fs.writeFileSync(
  path.join(PROJ, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: ['npm test'], workTracking: { backend: 'none' } }, null, 2)
);
writeKnowledgeConfig(PROJ, { mode: 'existing', sharedPath: '/v' });
var after = JSON.parse(fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8'));
assert('knowledge key written in the fixed shape', JSON.stringify(after.knowledge) === JSON.stringify({ local: 'knowledge-base', shared: { mode: 'existing', path: '/v' }, migratedAt: null }));
assert('stopGate preserved', JSON.stringify(after.stopGate) === '["npm test"]');
assert('workTracking preserved', after.workTracking.backend === 'none');
assert('round-trips through readKnowledgeConfig', readKnowledgeConfig(PROJ).shared.path === '/v');

console.log('writeKnowledgeConfig refuses to destroy malformed config:');
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ oops not json');
var threw = false;
try { writeKnowledgeConfig(PROJ, { mode: 'none', sharedPath: null }); } catch (e) { threw = true; }
assert('throws on malformed existing harness.json', threw);
assert('malformed file left untouched', fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8') === '{ oops not json');

console.log('coexistence with writeHarnessTargets:');
var CO = path.join(TEST_DIR, 'coexist');
fs.mkdirSync(path.join(CO, '.claude'), { recursive: true });
fs.writeFileSync(path.join(CO, '.claude', 'harness.json'), JSON.stringify({ stopGate: ['x'] }, null, 2));
writeKnowledgeConfig(CO, { mode: 'none', sharedPath: null });
writeHarnessTargets(CO, ['claude', 'codex']);
var co = JSON.parse(fs.readFileSync(path.join(CO, '.claude', 'harness.json'), 'utf-8'));
assert('knowledge survives a later writeHarnessTargets', co.knowledge.shared.mode === 'none');
assert('harness written alongside knowledge', JSON.stringify(co.harness) === '["claude","codex"]');
assert('stopGate still preserved through both writes', JSON.stringify(co.stopGate) === '["x"]');

console.log('writeKnowledgeConfig creates harness.json when absent:');
var FRESH = path.join(TEST_DIR, 'fresh');
fs.mkdirSync(path.join(FRESH, '.claude'), { recursive: true });
writeKnowledgeConfig(FRESH, { mode: 'none', sharedPath: null });
assert('creates harness.json when absent', readKnowledgeConfig(FRESH).local === 'knowledge-base');

console.log('stampMigratedAt:');
writeKnowledgeConfig(FRESH, { mode: 'existing', sharedPath: '/v' });
stampMigratedAt(FRESH, '2026-08-03T00:00:00Z');
assert('stampMigratedAt sets migratedAt', readKnowledgeConfig(FRESH).migratedAt === '2026-08-03T00:00:00Z');
assert('a later writeKnowledgeConfig preserves the stamp',
  (writeKnowledgeConfig(FRESH, { mode: 'none', sharedPath: null }), readKnowledgeConfig(FRESH).migratedAt) === '2026-08-03T00:00:00Z');

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
