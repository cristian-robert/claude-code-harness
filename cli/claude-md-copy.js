'use strict';

// Shared helper for copying CLAUDE.md from a framework source into a project
// root with backup + rollback semantics.
//
// If an existing CLAUDE.md is present at `destPath`:
//   - Preserves the existing content via preserveBeforeOverwrite (shared with
//     backupAndCopy): `<destPath>.backup` on first adoption, a rotation backup
//     `<destPath>.backup-<UTC stamp>` when the live file differs from BOTH the
//     incoming template and the existing `.backup` — i.e. when it holds content
//     that exists nowhere else. Nothing at all when the live file already
//     equals the template or the existing backup.
//   - Copies `sourcePath` -> `destPath`.
//   - On copy failure, if we wrote a backup on THIS run, restores from it and
//     removes it so the user's state is unchanged, then rethrows the original
//     copy error.
//
// If no existing CLAUDE.md: simple copy, records as created.
//
// Returns a delta: { created, updated, backedUp, backedUpFiles } so callers
// can merge into their stats object.

const fs = require('fs');
const { preserveBeforeOverwrite } = require('./backup-copy');

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

  var preserved = preserveBeforeOverwrite(destPath, sourcePath, backupLabel);

  try {
    fs.copyFileSync(sourcePath, destPath);
    if (preserved.backedUp) {
      delta.backedUp = 1;
      // The rotated name when we rotated, the label itself on first adoption —
      // always the file the content actually lives in now.
      delta.backedUpFiles.push(preserved.recordName);
    }
    delta.updated = 1;
    return delta;
  } catch (copyErr) {
    // Rollback: if we wrote a backup on this run, restore from it and discard
    // it so the user's state is unchanged.
    if (preserved.backedUp) {
      try {
        fs.copyFileSync(preserved.backupPath, destPath);
        fs.unlinkSync(preserved.backupPath);
      } catch (rollbackErr) {
        // Best-effort rollback; surface the original error anyway.
      }
    }
    throw copyErr;
  }
}

// F2: remove the CLAUDE.md shim when Claude Code drops out of the harness
// targets (e.g. init(both) re-run as init(codex)). CLAUDE.md is always a
// generated `@AGENTS.md` import shim -- never project content of its own --
// so removal is safe. Same symlink guard as any other generated-tree removal
// (F1/F2): refuse rather than unlink through a symlink.
function removeClaudeMdShim(projectRoot) {
  var path = require('path');
  var p = path.join(projectRoot, 'CLAUDE.md');
  var st;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    return false; // does not exist -- nothing to remove
  }
  if (st.isSymbolicLink()) {
    throw new Error(
      p + ' is a symlink -- perfect-harness-engineering will not remove it ' +
      'automatically. Remove it by hand if it is no longer needed.'
    );
  }
  fs.unlinkSync(p);
  return true;
}

module.exports = {
  copyClaudeMdWithBackup: copyClaudeMdWithBackup,
  removeClaudeMdShim: removeClaudeMdShim,
};
