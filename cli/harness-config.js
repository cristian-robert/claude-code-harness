'use strict';

// .claude/harness.json is USER CONFIG, not template content — the same way a .env is.
// It holds the stop gate, the protected base branch, work tracking, the model map. The
// template ships DEFAULTS, which are what a brand-new install should get; on an update
// the user's file WINS and the template contributes only keys the user does not have yet.
//
// Why this is inverted from every other file in the payload: `update` used to copy the
// template's harness.json over the user's and then restore a HARDCODED list of keys it
// remembered (harness, vault, models — each added reactively after someone noticed it
// breaking). That architecture fails OPEN. Every key nobody remembered was silently reset
// to the shipped default:
//
//   stopGate    — .claude/hooks/stop-gate.mjs runs these commands. Reset to [], the gate is
//                 DISARMED, and an empty array is indistinguishable from "never configured",
//                 so nothing warns.
//   baseBranch  — .claude/hooks/guard.mjs protects this branch from direct commits. Reset to
//                 null, the guard silently falls back to main/master and commits straight to
//                 a project's `develop` become allowed.
//   ...plus workTracking, requireEvolveBeforePush, autonomous and the two gate timeouts.
//
// Inverting it fails CLOSED: a key the user has is never touched, and the next key the
// template introduces still arrives with its default instead of needing a fourth band-aid.

const fs = require('fs');
const path = require('path');

// The ONE key the template owns. $comment is pure documentation — it explains what each key
// means and which hook reads it — so it must track the SHIPPED version or a long-lived
// project ends up reading stale docs about its own config. Every other key is the user's.
const TEMPLATE_OWNED_KEYS = ['$comment'];

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

// Parse a harness.json that must be a JSON object, THROWING on anything else. Writes to this
// file have always refused rather than clobber an unparseable one (harness-targets.js,
// vault-config.js, model-tiers.js); reading it as the base of the merge inherits that
// discipline. Silently replacing a file that may hold the user's stop gate would disarm the
// gate without a word.
function parseHarnessObject(p) {
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    throw new Error(
      p + ' is not valid JSON, so it cannot be safely updated (it holds your stop gate, ' +
      'protected base branch, and work-tracking config). Fix the file by hand, then re-run ' +
      'this command — refusing to overwrite it.'
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      p + ' does not contain a JSON object, so it cannot be safely updated (it holds your ' +
      'stop gate, protected base branch, and work-tracking config). Fix the file by hand, ' +
      'then re-run this command — refusing to overwrite it.'
    );
  }
  return parsed;
}

// The user's config, or null when the project has none (a brand-new install). Throws on a
// malformed file — callers run this BEFORE touching disk so the run dies with nothing lost.
function readHarnessConfig(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  return parseHarnessObject(p);
}

// The user's object is the base. The template adds ONLY the top-level keys the user lacks —
// a newly-introduced key arrives with its shipped default — plus TEMPLATE_OWNED_KEYS.
//
// Top-level only, deliberately: a deep merge would resurrect nested defaults the user removed
// on purpose (a dropped codex tier, a pruned workTracking field). A new NESTED key is the
// one thing this does not deliver; `/models` and `/harness-init` rewrite those wholesale.
function mergeHarnessConfig(userConfig, templateConfig) {
  var merged = {};
  var k;
  for (k in userConfig) {
    if (Object.prototype.hasOwnProperty.call(userConfig, k)) merged[k] = userConfig[k];
  }
  for (k in templateConfig) {
    if (!Object.prototype.hasOwnProperty.call(templateConfig, k)) continue;
    if (!Object.prototype.hasOwnProperty.call(merged, k) || TEMPLATE_OWNED_KEYS.indexOf(k) !== -1) {
      merged[k] = templateConfig[k];
    }
  }
  return merged;
}

// Install harness.json for an install/update: a project without one gets the template's file
// verbatim; a project with one keeps ITS file, gaining only the template keys it lacks.
// Returns { created, updated } so the caller's file counts stay honest.
function installHarnessConfig(projectRoot, templateHarnessPath) {
  var p = harnessJsonPath(projectRoot);
  var userConfig = readHarnessConfig(projectRoot); // throws on malformed — never clobber
  var dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (userConfig === null) {
    fs.copyFileSync(templateHarnessPath, p);
    return { created: 1, updated: 0 };
  }

  var merged = mergeHarnessConfig(userConfig, parseHarnessObject(templateHarnessPath));
  fs.writeFileSync(p, JSON.stringify(merged, null, 2) + '\n');
  return { created: 0, updated: 1 };
}

module.exports = {
  TEMPLATE_OWNED_KEYS: TEMPLATE_OWNED_KEYS,
  harnessJsonPath: harnessJsonPath,
  readHarnessConfig: readHarnessConfig,
  mergeHarnessConfig: mergeHarnessConfig,
  installHarnessConfig: installHarnessConfig,
};
