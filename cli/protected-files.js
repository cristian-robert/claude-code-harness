// Files that need LLM merge during re-init/update (project-specific content to preserve).
// Paths are relative to the PROJECT ROOT. The backup-everything strategy in init/update
// protects every file regardless; these are hints for the merge flow.
var NEEDS_MERGE = [
  'CLAUDE.md',
  '.claude/harness.json',
  '.claude/rules/frontend.md',
  '.claude/rules/backend.md',
  '.claude/settings.local.json',
  '.claude/skills/architecture-map/SKILL.md',
  '.claude/skills/debugging-this-repo/SKILL.md',
];

// Directories with project-populated content — always restore from backup on update.
var NEEDS_RESTORE = [
  'backlog',
  'sprints',
  'plans',
  'reports',
];

// CLI tools to copy into the target project. claude-code-harness ships none —
// merge-settings / file-size-check run via npx from the package, not from the project.
var FRAMEWORK_CLI_FILES = [];

function toProjectRelative(filePath, rootDir) {
  var path = require('path');
  var abs = path.resolve(filePath);
  var root = path.resolve(rootDir);
  return path.relative(root, abs).split(path.sep).join('/');
}

module.exports = {
  NEEDS_MERGE: NEEDS_MERGE,
  NEEDS_RESTORE: NEEDS_RESTORE,
  FRAMEWORK_CLI_FILES: FRAMEWORK_CLI_FILES,
  toProjectRelative: toProjectRelative,
};
