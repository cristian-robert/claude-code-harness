'use strict';

// The ONE file that names a model. Everything else — plans, rules, skills, dispatch
// prose, agent frontmatter — pins a ROLE, and this resolves it per harness.
//
// Why roles: model IDs churn (the gpt-5.6 Sol/Terra/Luna family landed 2026-07-09,
// two days before the design that needed it). A role survives the churn; an ID does not.
//
// Merge discipline mirrors harness-targets.js: harness.json is SHARED (stop gate,
// vault, work tracking), so a write preserves every other key and REFUSES (throws)
// rather than write through a harness.json it cannot parse.

const fs = require('fs');
const path = require('path');

// Implementer roles, weakest to strongest. `review` is deliberately NOT here — it is
// derived from who implemented (see reviewerRoleFor).
const ROLES = ['scout', 'build', 'deep'];

const HARNESSES = ['claude', 'codex'];

// Verified 2026-07-12 against openai/codex models.json + the installed codex-cli 0.144.0,
// and the Anthropic model reference. Claude values are ALIASES on purpose: Claude Code
// floats `opus`/`sonnet`/`haiku` to the newest family member, so they never need a bump.
// Codex has no alias mechanism, so its IDs are pinned and DO need /models to refresh them.
const DEFAULT_MODELS = {
  checkedAt: '2026-07-12',
  staleDays: 30,
  claude: { scout: 'haiku', build: 'sonnet', deep: 'opus' },
  codex: { scout: 'gpt-5.6-luna', build: 'gpt-5.6-terra', deep: 'gpt-5.6-sol' },
};

// THE RULE: the reviewer is the SIBLING of whoever implemented, same harness.
// deep wrote it -> build reviews it. build wrote it -> deep reviews it.
// Different weights catch different bugs; a model does not find the bug it just wrote.
//
// scout never implements. If a plan somehow pins it on an implementation task we fail
// SAFE (deep reviews) rather than fail cheap — a scout-grade reviewer is not a reviewer.
function reviewerRoleFor(implementerRole) {
  if (implementerRole === 'deep') return 'build';
  return 'deep'; // build -> deep; scout -> deep (fail safe)
}

function assertKnown(models, harness, role) {
  if (HARNESSES.indexOf(harness) === -1) {
    throw new Error('unknown harness: ' + harness + ' (expected one of ' + HARNESSES.join(', ') + ')');
  }
  if (ROLES.indexOf(role) === -1) {
    throw new Error(
      'unknown role: ' + role + ' (expected one of ' + ROLES.join(', ') + '). ' +
      '`review` is not a role — it is derived from the implementer via resolveReviewer().'
    );
  }
  if (!models || !models[harness] || !models[harness][role]) {
    throw new Error('no model mapped for ' + harness + '/' + role + ' in harness.json -> models');
  }
}

function resolveModel(models, harness, role) {
  assertKnown(models, harness, role);
  return models[harness][role];
}

function resolveReviewer(models, harness, implementerRole) {
  return resolveModel(models, harness, reviewerRoleFor(implementerRole));
}

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

// Reads must never crash init/update: degrade to null on anything unparseable.
function readModels(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!parsed.models || typeof parsed.models !== 'object' || Array.isArray(parsed.models)) return null;
  return parsed.models;
}

// Writes REFUSE on malformed input — silently replacing a harness.json that also holds
// the user's stop gate would be strictly worse than failing loudly.
function writeModels(projectRoot, models) {
  var p = harnessJsonPath(projectRoot);
  var current = {};
  if (fs.existsSync(p)) {
    var parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      throw new Error(
        p + ' exists but is not valid JSON, so it cannot be safely updated ' +
        '(it may also hold your stop gate and work-tracking config). ' +
        'Fix the file by hand, then re-run this command.'
      );
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(
        p + ' exists but does not contain a JSON object, so it cannot be safely ' +
        'updated. Fix the file by hand, then re-run this command.'
      );
    }
    current = parsed;
  }
  current.models = models;
  var dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(current, null, 2) + '\n');
}

// Unknown, missing, or unparseable checkedAt is STALE. A map whose freshness we cannot
// establish is exactly the map that needs re-checking — never silently call it fresh.
function isStale(checkedAt, maxDays, now) {
  if (typeof checkedAt !== 'string') return true;
  var t = Date.parse(checkedAt);
  if (isNaN(t)) return true;
  var ref = (now instanceof Date ? now : new Date()).getTime();
  return (ref - t) > maxDays * 24 * 60 * 60 * 1000;
}

module.exports = {
  ROLES: ROLES,
  HARNESSES: HARNESSES,
  DEFAULT_MODELS: DEFAULT_MODELS,
  reviewerRoleFor: reviewerRoleFor,
  resolveModel: resolveModel,
  resolveReviewer: resolveReviewer,
  readModels: readModels,
  writeModels: writeModels,
  isStale: isStale,
};
