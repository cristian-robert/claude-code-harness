'use strict';

// Which harness(es) this project is installed for. Persisted in
// .claude/harness.json so `update` re-emits the same payload non-interactively.
//
// Targets are always stored sorted, so ['codex','claude'] and ['claude','codex']
// are the same value on disk and comparisons stay trivial.

const fs = require('fs');
const path = require('path');

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

function readHarnessTargets(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    // A malformed harness.json must not crash init/update — the caller falls
    // back to asking (init) or to claude-only (update).
    return null;
  }
  if (!parsed || !Array.isArray(parsed.harness) || parsed.harness.length === 0) return null;
  var sorted = parsed.harness.slice().sort();
  for (var i = 0; i < sorted.length; i++) {
    // An unrecognised value means the file isn't something we can act on —
    // downstream code trusts this array and branches on indexOf('codex').
    if (KNOWN_HARNESS_NAMES.indexOf(sorted[i]) === -1) return null;
  }
  return sorted;
}

// Merge the harness key into harness.json, preserving every other key —
// harness.json also holds the stop gate and work-tracking config.
//
// Asymmetry with readHarnessTargets is intentional: read degrades to null on
// malformed JSON (reading must never crash), but write REFUSES on malformed
// JSON (throws) rather than risk silently replacing the whole file — and with
// it the user's stop gate — with just `{"harness": [...]}`.
function writeHarnessTargets(projectRoot, targets) {
  var p = harnessJsonPath(projectRoot);
  var current = {};
  if (fs.existsSync(p)) {
    try {
      current = JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
    } catch (e) {
      throw new Error(
        p + ' exists but is not valid JSON, so it cannot be safely updated ' +
        '(it may also hold your stop gate and work-tracking config). ' +
        'Fix the file by hand, then re-run this command.'
      );
    }
  }
  current.harness = targets.slice().sort();
  var dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(current, null, 2) + '\n');
}

module.exports = {
  HARNESS_PROMPT: HARNESS_PROMPT,
  parseHarnessAnswer: parseHarnessAnswer,
  readHarnessTargets: readHarnessTargets,
  writeHarnessTargets: writeHarnessTargets,
};
