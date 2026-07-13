'use strict';

// Which harness(es) this project is installed for. Persisted in
// .claude/harness.json so `update` re-emits the same payload non-interactively.
//
// Targets are always stored sorted, so ['codex','claude'] and ['claude','codex']
// are the same value on disk and comparisons stay trivial.

const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./harness-config');

// The only harness names readHarnessTargets will trust. Anything else in the
// file's "harness" array means the file isn't something we can act on.
const KNOWN_HARNESS_NAMES = ['claude', 'codex'];

const HARNESS_PROMPT =
  'Which harness will you use in this project?\n' +
  '  1) Claude Code\n' +
  '  2) Codex (CLI / IDE extension)\n' +
  '  3) Both\n' +
  'Choose 1/2/3 (or claude/codex/both): ';

function parseHarnessAnswer(input) {
  if (typeof input !== 'string') return null;
  var a = input.trim().toLowerCase();
  if (a === '1' || a === 'claude' || a === 'claude code') return ['claude'];
  if (a === '2' || a === 'codex') return ['codex'];
  if (a === '3' || a === 'both') return ['claude', 'codex'];
  return null;
}

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

function invalidHarnessError(p, value) {
  return new Error(
    p + ' has an invalid "harness" value: ' + JSON.stringify(value) + '. It must be a ' +
    'non-empty array of ' + KNOWN_HARNESS_NAMES.join(' / ') + ' (e.g. ["claude"], ' +
    '["claude","codex"]). Fix the file by hand, or re-run `init` to choose again — ' +
    'refusing to guess, because guessing rewrites this key and deletes the generated ' +
    'payload of any harness the guess leaves out.'
  );
}

// The recorded harness targets, or null when the project never recorded any.
//
// ABSENT and INVALID are different answers and must not collapse into one. An absent
// `harness` key is a project installed before multi-harness support: null, and the caller
// migrates it to claude-only. That path is a legitimate default and has to keep working.
//
// A PRESENT-but-invalid value is not a default — it is a broken config, and every caller's
// null-handling is destructive when applied to it. `update` reads null as "legacy project",
// OVERWRITES the key with ['claude'], and hands that to cleanupDroppedTargets, which deletes
// .agents/ and .codex/ outright. So a one-character typo (["codx"]) silently deleted the
// user's generated Codex tree and rewrote their config to agree with the deletion. Fail
// LOUDLY instead: the caller aborts with nothing written and nothing deleted.
function readHarnessTargets(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    // Unparseable JSON is not a bad `harness` value — it is a bad FILE, and it is caught
    // upstream where it can be reported properly (update.js validates via
    // harness-config.readHarnessConfig before it touches anything). Reads stay total here.
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!Object.prototype.hasOwnProperty.call(parsed, 'harness')) return null; // legacy project

  if (!Array.isArray(parsed.harness) || parsed.harness.length === 0) {
    throw invalidHarnessError(p, parsed.harness);
  }
  var sorted = parsed.harness.slice().sort();
  for (var i = 0; i < sorted.length; i++) {
    // An unrecognised value means the file isn't something we can act on —
    // downstream code trusts this array and branches on indexOf('codex').
    if (KNOWN_HARNESS_NAMES.indexOf(sorted[i]) === -1) {
      throw invalidHarnessError(p, parsed.harness);
    }
  }
  return sorted;
}

// Merge the harness key into harness.json, preserving every other key —
// harness.json also holds the stop gate and work-tracking config.
//
// Asymmetry with readHarnessTargets is intentional: read degrades to null on
// unparseable JSON (reading must never crash — the caller reports it), but
// write REFUSES on it (throws) rather than risk silently replacing the whole
// file — and with it the user's stop gate — with just `{"harness": [...]}`.
function writeHarnessTargets(projectRoot, targets) {
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
    // A truthy non-object (e.g. a bare array or number) parses without
    // throwing above, but `current.harness = targets` on it either sets a
    // property JSON.stringify silently drops (arrays) or is a no-op/throws
    // depending on strict mode (primitives) -- and null has no keys to merge
    // into. Refuse exactly like the unparseable-JSON case above rather than
    // risk any of those: the write contract is "refuse on malformed input",
    // never "silently lose the file's other keys".
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(
        p + ' exists but does not contain a JSON object, so it cannot be ' +
        'safely updated (it may also hold your stop gate and work-tracking ' +
        'config). Fix the file by hand, then re-run this command.'
      );
    }
    current = parsed;
  }
  var desired = targets.slice().sort();

  // Already recorded? Don't rewrite the file. `update` calls installHarnessConfig (which
  // writes the merged config) and then this — two writes to the same file, back to back,
  // where the second one changes nothing for any project that already has a `harness` key.
  // Every write to this file is a chance to lose it, so the cheapest write is the one that
  // doesn't happen. The refusal checks above still run first: a malformed harness.json
  // throws whether or not the harness key happens to match.
  //
  // The write still HAPPENS for a legacy project (no `harness` key), which is the case the
  // call site exists for — it materializes the assumed target so it isn't re-assumed forever.
  if (Array.isArray(current.harness) &&
      current.harness.length === desired.length &&
      current.harness.every(function (h, i) { return h === desired[i]; })) {
    return;
  }

  current.harness = desired;
  writeJsonAtomic(p, current);
}

module.exports = {
  HARNESS_PROMPT: HARNESS_PROMPT,
  parseHarnessAnswer: parseHarnessAnswer,
  readHarnessTargets: readHarnessTargets,
  writeHarnessTargets: writeHarnessTargets,
};
