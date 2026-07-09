'use strict';

// Shared helper for copying CLAUDE.md from a framework source into a project
// root with backup + rollback semantics.
//
// If an existing CLAUDE.md is present at `destPath`:
//   - Creates `<destPath>.backup` only if one doesn't already exist (so we
//     never clobber a pre-existing user backup).
//   - Copies `sourcePath` -> `destPath`.
//   - On copy failure, if we created the backup on THIS run, restores it and
//     removes the fresh backup so the user's state is unchanged, then rethrows
//     the original copy error.
//
// If no existing CLAUDE.md: simple copy, records as created.
//
// Returns a delta: { created, updated, backedUp, backedUpFiles } so callers
// can merge into their stats object.

const fs = require('fs');

function copyClaudeMdWithBackup(sourcePath, destPath, options) {
  var opts = options || {};
  var backupLabel = opts.backupLabel || 'CLAUDE.md';
  var delta = { created: 0, updated: 0, backedUp: 0, backedUpFiles: [] };

  if (!fs.existsSync(sourcePath)) {
    return delta;
  }

  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(sourcePath, destPath);
    delta.created = 1;
    return delta;
  }

  var backupPath = destPath + '.backup';
  var createdBackupThisRun = false;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(destPath, backupPath);
    createdBackupThisRun = true;
  }

  try {
    fs.copyFileSync(sourcePath, destPath);
    if (createdBackupThisRun) {
      delta.backedUp = 1;
      delta.backedUpFiles.push(backupLabel);
    }
    delta.updated = 1;
    return delta;
  } catch (copyErr) {
    // Rollback: if we created the backup on this run, restore it and
    // discard the backup file so the user's state is unchanged.
    if (createdBackupThisRun) {
      try {
        fs.copyFileSync(backupPath, destPath);
        fs.unlinkSync(backupPath);
      } catch (rollbackErr) {
        // Best-effort rollback; surface the original error anyway.
      }
    }
    throw copyErr;
  }
}

module.exports = {
  copyClaudeMdWithBackup: copyClaudeMdWithBackup,
};
