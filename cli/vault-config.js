'use strict';

// The Obsidian vault this project uses for architecture & knowledge. Persisted
// in .claude/harness.json under `vault`, asked once at `init`. /harness-init
// reads this to scaffold/wire the vault and point the architect agent at it.
//
// Merge discipline mirrors harness-targets.js: harness.json is shared (it holds
// the stop gate and work-tracking config), so a write preserves every other key
// and REFUSES (throws) rather than overwrite a harness.json it cannot parse.

const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT_PROMPT =
  'Do you use an Obsidian vault for architecture & knowledge?\n' +
  '  <path>  absolute path to your general vault (e.g. ~/Dev/The Vault)\n' +
  '  s       scaffold a new vault later (during /harness-init)\n' +
  '  skip    no vault\n' +
  'Vault (path / s / skip): ';

function parseVaultAnswer(input) {
  if (typeof input !== 'string') return null;
  var a = input.trim();
  var lower = a.toLowerCase();
  if (a === '' || lower === 'skip' || lower === 'none') return { mode: 'none', path: null };
  if (lower === 's' || lower === 'scaffold') return { mode: 'scaffold', path: null };
  // An absolute path (or ~-rooted) is an existing vault. Expand ~ and trim a
  // trailing slash so the recorded path is canonical.
  if (a.charAt(0) === '/' || a.slice(0, 2) === '~/') {
    var p = a.slice(0, 2) === '~/' ? path.join(os.homedir(), a.slice(2)) : a;
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return { mode: 'existing', path: p };
  }
  // Anything else (a relative path, a typo) is unparseable — caller re-asks.
  return null;
}

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

function readVaultConfig(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null; // reads must never crash init/update
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!parsed.vault || typeof parsed.vault !== 'object') return null;
  return parsed.vault;
}

// Merge the vault key into harness.json, preserving every other key. Refuse to
// write through a harness.json we cannot parse — silently discarding the stop
// gate is never acceptable (parity with harness-targets.writeHarnessTargets).
function writeVaultConfig(projectRoot, config) {
  var p = harnessJsonPath(projectRoot);
  var current = {};
  if (fs.existsSync(p)) {
    var raw = fs.readFileSync(p, 'utf-8');
    try {
      current = JSON.parse(raw);
    } catch (e) {
      throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.');
    }
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
    }
  }
  current.vault = { mode: config.mode, path: config.path || null };
  var dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(current, null, 2) + '\n');
}

module.exports = {
  VAULT_PROMPT: VAULT_PROMPT,
  parseVaultAnswer: parseVaultAnswer,
  readVaultConfig: readVaultConfig,
  writeVaultConfig: writeVaultConfig,
};
