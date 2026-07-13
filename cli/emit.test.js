#!/usr/bin/env node
'use strict';

// cli/emit.test.js
//
// Tests the `emit` subcommand (F3): re-derives .agents//.codex/ from the
// CURRENT .claude/ tree only -- no download, no payload copy, no backup, no
// prompt. Exists because init/update's Codex snapshot goes stale the moment
// /harness-init (or any later hand-edit) touches .claude/, and `update` is
// not a safe substitute (it reverts .claude/ before it re-emits).

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

var INDEX = path.join(__dirname, 'index.js');

function freshProj() {
  var proj = path.join(os.tmpdir(), 'emit-cmd-test-' + crypto.randomUUID());
  fs.mkdirSync(path.join(proj, '.claude', 'skills', 'plan'), { recursive: true });
  fs.writeFileSync(
    path.join(proj, '.claude', 'skills', 'plan', 'SKILL.md'),
    '---\nname: plan\ndescription: "x"\n---\n\nBody.\n'
  );
  return proj;
}

console.log('cli emit subcommand:');

// No .claude/ at all -> error, non-zero exit.
(function () {
  var dir = path.join(os.tmpdir(), 'emit-cmd-test-noclaude-' + crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  var status = 0;
  try {
    execFileSync('node', [INDEX, 'emit'], { cwd: dir, stdio: 'pipe' });
  } catch (e) {
    status = e.status;
  }
  assert('emit exits non-zero with no .claude/ directory', status !== 0);
  fs.rmSync(dir, { recursive: true, force: true });
})();

// .claude/ exists but harness.json has no codex target -> exit 0, no
// .agents//.codex written, nothing else happens.
(function () {
  var proj = freshProj();
  fs.writeFileSync(path.join(proj, '.claude', 'harness.json'), JSON.stringify({ harness: ['claude'] }));
  var out = execFileSync('node', [INDEX, 'emit'], { cwd: proj, encoding: 'utf-8' });
  assert('emit says codex is not a target', /not a harness target/i.test(out));
  assert('emit does not create .agents/ when codex is not a target', !fs.existsSync(path.join(proj, '.agents')));
  assert('emit does not create .codex/ when codex is not a target', !fs.existsSync(path.join(proj, '.codex')));
  fs.rmSync(proj, { recursive: true, force: true });
})();

// No harness.json at all (pre-multi-harness project) -> same as "not a
// target" (readHarnessTargets degrades to null, emit treats that as absent).
(function () {
  var proj = freshProj();
  var out = execFileSync('node', [INDEX, 'emit'], { cwd: proj, encoding: 'utf-8' });
  assert('emit with no harness.json says codex is not a target', /not a harness target/i.test(out));
  assert('emit does not create .agents/ with no harness.json', !fs.existsSync(path.join(proj, '.agents')));
  fs.rmSync(proj, { recursive: true, force: true });
})();

// codex IS a target -> emits, reports counts, no prompt/hang (execFileSync
// would hit the default 2-minute timeout on a hung readline prompt).
(function () {
  var proj = freshProj();
  fs.writeFileSync(path.join(proj, '.claude', 'harness.json'), JSON.stringify({ harness: ['codex'] }));
  var out = execFileSync('node', [INDEX, 'emit'], { cwd: proj, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert('emit reports skills emitted', /1 skills? ->/.test(out));
  assert('.agents/skills/plan/SKILL.md written', fs.existsSync(path.join(proj, '.agents', 'skills', 'plan', 'SKILL.md')));
  fs.rmSync(proj, { recursive: true, force: true });
})();

// Hand-edit a canonical skill, then emit -- the edit reaches .agents/ with
// nothing else touched (no backup, no download, no payload copy).
(function () {
  var proj = freshProj();
  fs.writeFileSync(path.join(proj, '.claude', 'harness.json'), JSON.stringify({ harness: ['codex'] }));
  execFileSync('node', [INDEX, 'emit'], { cwd: proj, stdio: 'pipe' });
  fs.writeFileSync(
    path.join(proj, '.claude', 'skills', 'plan', 'SKILL.md'),
    '---\nname: plan\ndescription: "x"\n---\n\nHAND-EDITED BODY.\n'
  );
  execFileSync('node', [INDEX, 'emit'], { cwd: proj, stdio: 'pipe' });
  var emitted = fs.readFileSync(path.join(proj, '.agents', 'skills', 'plan', 'SKILL.md'), 'utf-8');
  assert('a hand-edit to a canonical skill reaches .agents/ via emit', emitted.indexOf('HAND-EDITED BODY.') !== -1);
  assert('emit left no .backup file behind (no backup semantics)',
    !fs.existsSync(path.join(proj, '.claude', 'skills', 'plan', 'SKILL.md.backup')));
  fs.rmSync(proj, { recursive: true, force: true });
})();

// --help lists emit and is harness-neutral about harness-init.
(function () {
  var out = execFileSync('node', [INDEX, '--help'], { encoding: 'utf-8' });
  assert('--help lists the emit subcommand', /\bemit\b/.test(out));
  assert('--help names both /harness-init and $harness-init', out.indexOf('/harness-init') !== -1 && out.indexOf('$harness-init') !== -1);
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
