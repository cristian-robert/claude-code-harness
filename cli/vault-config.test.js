// cli/vault-config.test.js
//
// Tests vault-config parsing and persistence of the `vault` key in
// .claude/harness.json, and its coexistence with the `harness` key.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { parseVaultAnswer, readVaultConfig, writeVaultConfig } = require('./vault-config');
const { writeHarnessTargets } = require('./harness-targets');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const TEST_DIR = path.join(os.tmpdir(), 'vault-config-test-' + crypto.randomUUID());

console.log('parseVaultAnswer:');
var HOME = os.homedir();
assert('absolute path -> existing', JSON.stringify(parseVaultAnswer('/Users/x/Vault')) === JSON.stringify({ mode: 'existing', path: '/Users/x/Vault' }));
assert('trailing slash trimmed', parseVaultAnswer('/Users/x/Vault/').path === '/Users/x/Vault');
assert('~ expands to home', parseVaultAnswer('~/Vault').path === path.join(HOME, 'Vault'));
assert('"s" -> scaffold', JSON.stringify(parseVaultAnswer('s')) === JSON.stringify({ mode: 'scaffold', path: null }));
assert('"scaffold" -> scaffold', parseVaultAnswer('scaffold').mode === 'scaffold');
assert('"skip" -> none', JSON.stringify(parseVaultAnswer('skip')) === JSON.stringify({ mode: 'none', path: null }));
assert('"none" -> none', parseVaultAnswer('none').mode === 'none');
assert('empty -> none', parseVaultAnswer('').mode === 'none');
assert('whitespace trimmed', parseVaultAnswer('  s  ').mode === 'scaffold');
assert('relative path -> null (re-ask)', parseVaultAnswer('some/rel/path') === null);
assert('garbage -> null', parseVaultAnswer('maybe?') === null);

console.log('readVaultConfig:');
var PROJ = path.join(TEST_DIR, 'proj');
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true });
assert('missing harness.json -> null', readVaultConfig(PROJ) === null);
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ stopGate: [] }));
assert('harness.json without vault key -> null', readVaultConfig(PROJ) === null);
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ not json');
assert('malformed harness.json -> null (no throw)', readVaultConfig(PROJ) === null);

console.log('writeVaultConfig preserves other keys:');
fs.writeFileSync(
  path.join(PROJ, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: ['npm test'], workTracking: { backend: 'none' } }, null, 2)
);
writeVaultConfig(PROJ, { mode: 'existing', path: '/v' });
var after = JSON.parse(fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8'));
assert('vault key written', JSON.stringify(after.vault) === JSON.stringify({ mode: 'existing', path: '/v' }));
assert('stopGate preserved', JSON.stringify(after.stopGate) === '["npm test"]');
assert('workTracking preserved', after.workTracking.backend === 'none');
assert('round-trips through readVaultConfig', readVaultConfig(PROJ).path === '/v');

console.log('writeVaultConfig refuses to destroy malformed config:');
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ oops not json');
var threw = false;
try { writeVaultConfig(PROJ, { mode: 'none', path: null }); } catch (e) { threw = true; }
assert('throws on malformed existing harness.json', threw);
assert('malformed file left untouched', fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8') === '{ oops not json');

console.log('coexistence with writeHarnessTargets:');
var CO = path.join(TEST_DIR, 'coexist');
fs.mkdirSync(path.join(CO, '.claude'), { recursive: true });
fs.writeFileSync(path.join(CO, '.claude', 'harness.json'), JSON.stringify({ stopGate: ['x'] }, null, 2));
writeVaultConfig(CO, { mode: 'scaffold', path: null });
writeHarnessTargets(CO, ['claude', 'codex']);
var co = JSON.parse(fs.readFileSync(path.join(CO, '.claude', 'harness.json'), 'utf-8'));
assert('vault survives a later writeHarnessTargets', co.vault.mode === 'scaffold');
assert('harness written alongside vault', JSON.stringify(co.harness) === '["claude","codex"]');
assert('stopGate still preserved through both writes', JSON.stringify(co.stopGate) === '["x"]');

console.log('writeVaultConfig creates harness.json when absent:');
var FRESH = path.join(TEST_DIR, 'fresh');
fs.mkdirSync(path.join(FRESH, '.claude'), { recursive: true });
writeVaultConfig(FRESH, { mode: 'none', path: null });
assert('creates harness.json when absent', readVaultConfig(FRESH).mode === 'none');

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
