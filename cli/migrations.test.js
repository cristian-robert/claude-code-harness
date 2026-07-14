// cli/migrations.test.js
//
// Tests the renamed-skill migration: an update across the /plan -> /plan-work,
// /review -> /review-branch rename must retire the OLD skill dirs (additive
// backupAndCopy cannot), without touching user skills or losing user edits.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { migrateRenamedSkills, RENAMED_SKILLS } = require('./migrations');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

function freshProj() {
  var dir = path.join(os.tmpdir(), 'migrations-test-' + crypto.randomUUID());
  fs.mkdirSync(path.join(dir, '.claude', 'skills'), { recursive: true });
  return dir;
}
function writeSkill(proj, name, body) {
  var dir = path.join(proj, '.claude', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body);
}
function skillMd(proj, name) {
  return path.join(proj, '.claude', 'skills', name, 'SKILL.md');
}

console.log('migrateRenamedSkills:');

// Old + new both present (the post-rename update) -> old retired, edits kept as backup.
(function () {
  var proj = freshProj();
  writeSkill(proj, 'plan', '---\nname: plan\n---\n# /plan\nUSER-EDIT-MARKER\n');
  writeSkill(proj, 'plan-work', '---\nname: plan-work\n---\n# /plan-work\n');
  writeSkill(proj, 'review', '---\nname: review\n---\n# /review\n');
  writeSkill(proj, 'review-branch', '---\nname: review-branch\n---\n# /review-branch\n');
  writeSkill(proj, 'my-own-skill', '---\nname: my-own-skill\n---\n# mine\n');

  var res = migrateRenamedSkills(proj);
  assert('both renames reported', res.migrated.length === 2);
  assert('old plan SKILL.md removed', !fs.existsSync(skillMd(proj, 'plan')));
  assert('old review SKILL.md removed', !fs.existsSync(skillMd(proj, 'review')));
  assert('user edits preserved in backup',
    fs.readFileSync(skillMd(proj, 'plan') + '.backup', 'utf-8').indexOf('USER-EDIT-MARKER') !== -1);
  assert('new plan-work untouched',
    fs.readFileSync(skillMd(proj, 'plan-work'), 'utf-8').indexOf('name: plan-work') !== -1);
  assert('unrelated user skill untouched', fs.existsSync(skillMd(proj, 'my-own-skill')));
  fs.rmSync(proj, { recursive: true, force: true });
})();

// Old payload (new skill absent) -> no-op: a 2.x CLI against a pre-rename
// payload must not delete the only plan skill the project has.
(function () {
  var proj = freshProj();
  writeSkill(proj, 'plan', '---\nname: plan\n---\n# /plan\n');
  var res = migrateRenamedSkills(proj);
  assert('pre-rename payload: nothing migrated', res.migrated.length === 0);
  assert('pre-rename payload: old plan skill intact', fs.existsSync(skillMd(proj, 'plan')));
  fs.rmSync(proj, { recursive: true, force: true });
})();

// Idempotent: a second run must not overwrite the preserved original.
(function () {
  var proj = freshProj();
  writeSkill(proj, 'plan', '---\nname: plan\n---\nORIGINAL\n');
  writeSkill(proj, 'plan-work', '---\nname: plan-work\n---\n# /plan-work\n');
  migrateRenamedSkills(proj);
  // Simulate the old file reappearing (e.g. restored by hand) with different content.
  writeSkill(proj, 'plan', '---\nname: plan\n---\nRESTORED-LATER\n');
  var res2 = migrateRenamedSkills(proj);
  assert('second run still retires the old file', !fs.existsSync(skillMd(proj, 'plan')));
  assert('second run keeps the FIRST backup (preserve-original rule)',
    fs.readFileSync(skillMd(proj, 'plan') + '.backup', 'utf-8').indexOf('ORIGINAL') !== -1);
  assert('second run reports the retirement', res2.migrated.indexOf('plan') !== -1);
  fs.rmSync(proj, { recursive: true, force: true });
})();

// Clean project (fresh init, no old dirs) -> silent no-op.
(function () {
  var proj = freshProj();
  writeSkill(proj, 'plan-work', '---\nname: plan-work\n---\n# /plan-work\n');
  writeSkill(proj, 'review-branch', '---\nname: review-branch\n---\n# /review-branch\n');
  var res = migrateRenamedSkills(proj);
  assert('fresh project: nothing migrated, no messages', res.migrated.length === 0 && res.messages.length === 0);
  fs.rmSync(proj, { recursive: true, force: true });
})();

// The table itself: every entry's target must exist in the shipped template —
// a rename recorded here but not shipped would make the migration delete-only.
(function () {
  var templateSkills = path.join(__dirname, '..', 'template', '.claude', 'skills');
  for (var i = 0; i < RENAMED_SKILLS.length; i++) {
    var e = RENAMED_SKILLS[i];
    assert('template ships ' + e.to + '/SKILL.md',
      fs.existsSync(path.join(templateSkills, e.to, 'SKILL.md')));
    assert('template no longer ships ' + e.from + '/SKILL.md',
      !fs.existsSync(path.join(templateSkills, e.from, 'SKILL.md')));
  }
})();

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
