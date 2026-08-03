'use strict';

// The two knowledge stores this project uses. Persisted in .claude/harness.json under
// `knowledge`, asked once at `init`:
//
//   "knowledge": {
//     "local":  "knowledge-base",                                  // ALWAYS in the repo, git-tracked
//     "shared": { "mode": "existing"|"none", "path": "/abs"|null }, // the Obsidian vault, evergreen only
//     "migratedAt": null                                            // stamped by the migration (increment 2)
//   }
//
// LOCAL is neither optional nor asked about: project-scoped knowledge lives in the repo,
// and every rule, skill and hook in the payload names `knowledge-base/` literally. Only
// the SHARED store is a question, because not everyone keeps one.
//
// Merge discipline mirrors harness-targets.js: harness.json is shared (it holds the stop
// gate and work-tracking config), so a write preserves every other key and REFUSES
// (throws) rather than overwrite a harness.json it cannot parse.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeJsonAtomic } = require('./harness-config');

const LOCAL_DIR = 'knowledge-base';

const KNOWLEDGE_PROMPT =
  'Project knowledge lives in ./knowledge-base/ (git-tracked, scaffolded by /harness-init).\n' +
  'Do you also keep a SHARED store — an Obsidian vault for evergreen wiki/ + agent-kb/?\n' +
  '  <path>  absolute path to that shared vault (e.g. ~/Dev/The Vault)\n' +
  '  skip    no shared store — local knowledge-base/ only\n' +
  'Shared store (path / skip): ';

function parseKnowledgeAnswer(input) {
  if (typeof input !== 'string') return null;
  var a = input.trim();
  var lower = a.toLowerCase();
  if (a === '' || lower === 'skip' || lower === 'none') return { mode: 'none', sharedPath: null };
  // An absolute path (or ~-rooted) is an existing shared store. Expand ~ and trim a
  // trailing slash so the recorded path is canonical.
  if (a.charAt(0) === '/' || a.slice(0, 2) === '~/') {
    var p = a.slice(0, 2) === '~/' ? path.join(os.homedir(), a.slice(2)) : a;
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return { mode: 'existing', sharedPath: p };
  }
  // Anything else (a relative path, a typo) is unparseable — caller re-asks.
  return null;
}

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

function readKnowledgeConfig(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null; // reads must never crash init/update
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  // Arrays are objects. Returning one breaks the declared return type and a caller's
  // `k.shared.mode` TypeErrors on it — the top level is array-guarded, so this must be too.
  if (!parsed.knowledge || typeof parsed.knowledge !== 'object' || Array.isArray(parsed.knowledge)) return null;
  return parsed.knowledge;
}

// Merge the knowledge key into harness.json, preserving every other key. Refuse to write
// through a harness.json we cannot parse — silently discarding the stop gate is never
// acceptable (parity with harness-targets.writeHarnessTargets).
function writeKnowledgeConfig(projectRoot, config) {
  // Validate the INPUT, not just the file. Passing the whole knowledge object (rather than
  // the {mode, sharedPath} the parser returns) used to write `shared: { path: null }` with
  // no `mode` key at all, and no error — a config no reader can interpret.
  if (!config || (config.mode !== 'existing' && config.mode !== 'none')) {
    throw new Error('writeKnowledgeConfig requires { mode: "existing" | "none", sharedPath }.');
  }
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
  // A migratedAt stamp already on disk survives a re-init: it records that the one-way
  // move out of the shared store already happened, and re-running init must not un-say it.
  var previous = current.knowledge && typeof current.knowledge === 'object' ? current.knowledge : {};
  current.knowledge = {
    local: LOCAL_DIR,
    shared: { mode: config.mode, path: config.sharedPath || null },
    // Preserve-if-PRESENT, not preserve-if-truthy: the contract is "always preserves", and
    // a falsy-but-present stamp is still a stamp that must not be rewritten here.
    migratedAt: Object.prototype.hasOwnProperty.call(previous, 'migratedAt') ? previous.migratedAt : null,
  };
  writeJsonAtomic(p, current);
}

// Stamp the one-way migration. Separate from writeKnowledgeConfig on purpose:
// that function must never let a re-run of `init` un-say a completed migration,
// so it always re-reads migratedAt from disk. This is the ONE writer of the field.
function stampMigratedAt(projectRoot, iso) {
  // The stamp IS the one-way record. An empty or non-string value would silently un-say a
  // completed migration, which is the one thing this field exists to make impossible.
  if (typeof iso !== 'string' || iso === '') {
    throw new Error('stampMigratedAt requires a non-empty ISO timestamp string.');
  }
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) throw new Error(p + ' does not exist — nothing to stamp.');
  var current;
  try { current = JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.'); }
  // Same guard writeKnowledgeConfig has: a `null` or array harness.json must produce the
  // actionable message, not a raw TypeError on `.knowledge`.
  if (current === null || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
  }
  if (!current.knowledge || typeof current.knowledge !== 'object') {
    throw new Error(p + ' has no `knowledge` key — run `init` before stamping a migration.');
  }
  current.knowledge.migratedAt = iso;
  writeJsonAtomic(p, current);
}

module.exports = {
  LOCAL_DIR: LOCAL_DIR,
  KNOWLEDGE_PROMPT: KNOWLEDGE_PROMPT,
  parseKnowledgeAnswer: parseKnowledgeAnswer,
  readKnowledgeConfig: readKnowledgeConfig,
  writeKnowledgeConfig: writeKnowledgeConfig,
  stampMigratedAt: stampMigratedAt,
};
