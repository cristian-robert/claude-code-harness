const fs = require('fs');
const path = require('path');

// Framework paths RENAMED between releases. backupAndCopy is additive — it never
// removes a file the template stopped shipping — so without this table a project
// updated across the rename keeps BOTH skills: the old `plan` dir would go on
// silently shadowing Claude Code's native /plan command, which is the exact bug
// the rename exists to fix (ADR-011).
//
// Applied AFTER the payload copy, and only when the renamed-to skill actually
// arrived (`to`'s SKILL.md exists): running a new CLI against an old payload
// (GitHub main not yet merged, local fallback) must be a no-op, not a deletion.
var RENAMED_SKILLS = [
  { from: 'plan', to: 'plan-work' },        // 2.0.0 — /plan collided with the native plan-mode command
  { from: 'review', to: 'review-branch' },  // 2.0.0 — /review collided with the bundled review skill
];

// Neutralize, don't delete: the old SKILL.md becomes SKILL.md.backup (same
// "preserve the original once" rule as backupAndCopy — an existing backup is
// never overwritten), and a dir without SKILL.md registers no skill. Any other
// files the user added to the old dir stay where they are, inert.
function migrateRenamedSkills(projectRoot) {
  var result = { migrated: [], messages: [] };
  var skillsRoot = path.join(projectRoot, '.claude', 'skills');

  for (var i = 0; i < RENAMED_SKILLS.length; i++) {
    var entry = RENAMED_SKILLS[i];
    var oldSkillMd = path.join(skillsRoot, entry.from, 'SKILL.md');
    var newSkillMd = path.join(skillsRoot, entry.to, 'SKILL.md');

    if (!fs.existsSync(oldSkillMd)) continue;      // nothing to migrate
    if (fs.existsSync(newSkillMd) === false) continue; // payload predates the rename — leave the old skill alone

    var backupPath = oldSkillMd + '.backup';
    try {
      if (fs.existsSync(backupPath)) {
        // Original already preserved by an earlier run — just remove the live file.
        fs.rmSync(oldSkillMd);
      } else {
        fs.renameSync(oldSkillMd, backupPath);
      }
      result.migrated.push(entry.from);
      result.messages.push(
        'Skill renamed: /' + entry.from + ' -> /' + entry.to +
        ' (old .claude/skills/' + entry.from + '/SKILL.md kept as SKILL.md.backup)'
      );
    } catch (e) {
      result.messages.push(
        'Could not retire old skill .claude/skills/' + entry.from + '/SKILL.md (' + e.message +
        ') — remove it by hand or /' + entry.from + ' will shadow a Claude Code built-in.'
      );
    }
  }

  return result;
}

module.exports = {
  RENAMED_SKILLS: RENAMED_SKILLS,
  migrateRenamedSkills: migrateRenamedSkills,
};
