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
// harness.json is user config holding the stop gate; a torn write can destroy it. Reuse
// the ONE atomic writer (temp + fsync + rename) rather than a second bare writeFileSync.
// Safe one-way edge: harness-config depends only on fs/path/crypto, never on this module.
const { writeJsonAtomic } = require('./harness-config');

// Implementer roles, weakest to strongest. `review` is deliberately NOT here — it is
// derived from who implemented (see reviewerRoleFor).
const ROLES = ['scout', 'build', 'deep'];

const HARNESSES = ['claude', 'codex'];

// Verified 2026-07-12 against openai/codex models.json + the installed codex-cli 0.144.0,
// and the Anthropic model reference. Claude values are ALIASES on purpose: Claude Code
// floats `opus`/`sonnet`/`haiku` to the newest family member, so they never need a bump.
// Codex has no alias mechanism, so its IDs are pinned and DO need /models to refresh them.
//
// `efforts` records the reasoning levels each model ID supports (models.json ->
// supported_reasoning_levels); luna is the ONE 5.6 model without `ultra`. It lives HERE, in
// the map, and not in a constant inside cli/emit-codex.js, because a ceiling is a property of
// the model ID — so it churns on exactly the same schedule as the ID, and must be refreshable
// by whoever refreshes the ID. `/models` runs in the ADOPTER's project, which contains
// .claude/ and no cli/: a ceiling table in package source is a table they cannot reach.
// Keyed by ID rather than by role for the same reason — swap deep from sol to a new model and
// its ceiling travels with it, instead of being silently inherited from the model it replaced.
// Codex-only: Claude's aliases float, so there is no stable ID to key a ceiling to.
const DEFAULT_MODELS = {
  checkedAt: '2026-07-12',
  staleDays: 30,
  claude: { scout: 'haiku', build: 'sonnet', deep: 'opus' },
  codex: { scout: 'gpt-5.6-luna', build: 'gpt-5.6-terra', deep: 'gpt-5.6-sol' },
  efforts: {
    'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-5.6-terra': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  },
};

// THE RULE: the reviewer is the SIBLING of whoever implemented, same harness.
// deep wrote it -> build reviews it. build wrote it -> deep reviews it.
// Different weights catch different bugs; a model does not find the bug it just wrote.
//
// scout never implements. If a plan somehow pins it on an implementation task we fail
// SAFE (deep reviews) rather than fail cheap — a scout-grade reviewer is not a reviewer.
//
// Anything that is not a role is a BUG at the call site, and must not be absorbed: a
// bare `else return 'deep'` answered undefined, null, 'review' and 42 with a plausible
// role, so a typo'd tier in a plan silently got a reviewer and nobody ever learned.
function reviewerRoleFor(implementerRole) {
  if (implementerRole === 'deep') return 'build';
  if (implementerRole === 'build') return 'deep';
  if (implementerRole === 'scout') return 'deep'; // scout never implements — fail safe
  throw new Error(
    'unknown implementer role: ' + JSON.stringify(implementerRole) +
    ' (expected one of ' + ROLES.join(', ') + '). ' +
    '`review` is not a role — the reviewer is DERIVED from the implementer.'
  );
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

// The reasoning levels a model ID supports, or null when the map records none for it.
//
// null is a real, expected answer, not an error: `/models` can refresh an ID to a model that
// shipped after this package was cut, and the map is hand-editable. Callers must handle "we
// do not know this model's ceilings" WITHOUT refusing to work — see the effort guard in
// emit-codex.js. Every malformed shape (missing `efforts`, a non-array entry, an empty array)
// degrades to null for the same reason readModels does: a bad map must not crash init/update.
function supportedEfforts(models, modelId) {
  var efforts = models && models.efforts;
  if (!efforts || typeof efforts !== 'object' || Array.isArray(efforts)) return null;
  var levels = efforts[modelId];
  if (!Array.isArray(levels) || levels.length === 0) return null;
  // Elements must be plain effort STRINGS. The Codex catalog's supported_reasoning_levels
  // are OBJECTS, and /models points the maintainer there, so `[{effort:"low"},...]` pasted
  // verbatim is the realistic bad input. A non-string element sails past the length check,
  // then never matches the pinned effort string at emit's indexOf — bricking a KNOWN model.
  // Degrade to null: emit warns it cannot validate and proceeds, which is the right "we do
  // not understand this ceiling" behaviour, not a hard failure.
  for (var i = 0; i < levels.length; i++) {
    if (typeof levels[i] !== 'string') return null;
  }
  return levels;
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
  writeJsonAtomic(p, current);
}

// Unknown, missing, or unparseable checkedAt is STALE. A map whose freshness we cannot
// establish is exactly the map that needs re-checking — never silently call it fresh.
// A far-future checkedAt is bogus (typo, hand-edit) and must read STALE. But a
// SMALL negative age is the normal case, not an anomaly: `checkedAt` is a bare
// date, which Date.parse reads as midnight UTC, while /models writes the user's
// LOCAL date. East of UTC those disagree — at 00:16 in UTC+3, a map checked
// "today" parses ~3h in the future. A bare `age < 0` therefore declares a
// just-verified map stale, and nags on every session forever. Tolerate one day
// (covers every real zone, ±14h, plus clock drift); anything beyond that is a
// date nobody plausibly typed by accident.
var SKEW_MS = 24 * 60 * 60 * 1000;

// `staleDays` is optional in harness.json, so a missing maxDays defaults to 30 —
// spelled EXACTLY as session-start.mjs spells it, because the parity test drives both
// and an undefined maxDays otherwise compares against NaN, which is false for every
// operator: a decade-old map would read FRESH here while the hook warned.
function isStale(checkedAt, maxDays, now) {
  if (typeof checkedAt !== 'string') return true;
  var days = typeof maxDays === 'number' ? maxDays : 30;
  var t = Date.parse(checkedAt);
  if (isNaN(t)) return true;
  var ref = (now instanceof Date ? now : new Date()).getTime();
  var age = ref - t;
  if (age < -SKEW_MS) return true; // implausibly future — cannot be trusted as fresh
  return age > days * 24 * 60 * 60 * 1000;
}

module.exports = {
  ROLES: ROLES,
  HARNESSES: HARNESSES,
  DEFAULT_MODELS: DEFAULT_MODELS,
  reviewerRoleFor: reviewerRoleFor,
  resolveModel: resolveModel,
  resolveReviewer: resolveReviewer,
  supportedEfforts: supportedEfforts,
  readModels: readModels,
  writeModels: writeModels,
  isStale: isStale,
};
