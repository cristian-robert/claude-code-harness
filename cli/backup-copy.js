'use strict';

// Shared backup-then-copy machinery for init.js and update.js. Both had a
// byte-identical private copy of `backupAndCopy`; the first-backup-wins bug
// below therefore had to be fixed twice, so it lives here once instead.
//
// Backup semantics (upgrade-path review, F1 — "the second update permanently
// destroys everything added after the first"):
//
//   dest == incoming template            -> nothing changes, no backup
//   dest differs, no <file>.backup       -> write <file>.backup   (first adoption)
//   dest differs from template AND from  -> write a ROTATION backup
//     the existing <file>.backup            <file>.backup-<YYYYMMDDTHHMMSS>
//   dest differs from template but is    -> nothing (already preserved)
//     byte-identical to <file>.backup
//
// The rotation case is the fix: before it, a dest holding content that existed
// nowhere else (everything the user re-added after the first update) was
// overwritten with no backup, because `.backup` already existed.
//
// The identical-to-template skip keeps `.init-meta.json` meaningful: without it
// every update "backed up" the payload's own files (19 of them at 3.1.0) as if
// they were user content, and /harness-init then reconciled PHE files instead
// of the user's.
//
// Fail-open applies to DECISIONS only: every comparison and existence probe here
// is wrapped, and failure always falls toward TAKING a backup — a file we cannot
// read is never assumed to be safe somewhere else.
//
// The two backup WRITES (fs.copyFileSync into .backup / into the rotation name)
// are deliberately NOT wrapped. If the backup cannot be written, the overwrite it
// exists to protect must not happen either, so the error propagates and the
// caller aborts the run with nothing clobbered. Aborting is the fail-SAFE choice
// for data; swallowing the error would overwrite the live file unprotected —
// exactly the loss this module was written to stop.

const fs = require('fs');
const path = require('path');
const { toProjectRelative } = require('./protected-files');

// Byte-comparison that never throws. Unreadable/missing -> "different", so the
// caller backs up rather than assuming the content is safe somewhere else.
function sameContent(a, b) {
  try {
    var sa = fs.statSync(a);
    var sb = fs.statSync(b);
    if (!sa.isFile() || !sb.isFile()) return false;
    if (sa.size !== sb.size) return false;
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch (e) {
    return false;
  }
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

// UTC, second precision: 20260830T101112. Sorts lexicographically by age and
// carries no locale or timezone ambiguity into a filename.
function utcStamp(date) {
  var d = date || new Date();
  return (
    String(d.getUTCFullYear()) +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds())
  );
}

// <file>.backup-<stamp>, with a numeric suffix if that exact name is taken
// (two rotations inside the same second, or a re-run after a clock reset).
function rotationBackupPath(destPath, stamp) {
  var base = destPath + '.backup-' + stamp;
  try {
    if (!fs.existsSync(base)) return base;
    for (var n = 2; n < 1000; n++) {
      var candidate = base + '-' + n;
      if (!fs.existsSync(candidate)) return candidate;
    }
  } catch (e) {
    // existsSync failing is not a reason to abandon the backup — fall through
    // to a name that cannot collide with the ones above.
  }
  return base + '-' + Date.now();
}

// Preserve whatever is at destPath before srcPath is copied over it.
// Returns { backedUp: 0|1, action: 'none'|'first'|'rotate', backupPath, recordName }.
// recordName is what the caller records in stats.backedUpFiles: the dest's own
// project-relative name for a first backup (unchanged behavior, and what
// /harness-init step 0 reconciles), the ROTATED file's name for a rotation —
// the rotated copy is the only place that content now lives.
function preserveBeforeOverwrite(destPath, srcPath, label) {
  var result = { backedUp: 0, action: 'none', backupPath: null, recordName: null };

  // Nothing is about to change.
  if (sameContent(destPath, srcPath)) return result;

  var backupPath = destPath + '.backup';
  var backupExists = false;
  try {
    backupExists = fs.existsSync(backupPath);
  } catch (e) {
    backupExists = false;
  }

  if (!backupExists) {
    fs.copyFileSync(destPath, backupPath);
    result.backedUp = 1;
    result.action = 'first';
    result.backupPath = backupPath;
    result.recordName = label;
    return result;
  }

  // A .backup already holds an earlier copy of this file. Rotate only when the
  // live file differs from that too — otherwise its content is already saved.
  if (sameContent(destPath, backupPath)) return result;

  var rotated = rotationBackupPath(destPath, utcStamp());
  fs.copyFileSync(destPath, rotated);
  result.backedUp = 1;
  result.action = 'rotate';
  result.backupPath = rotated;
  // label + '.backup-<stamp>' — the rotated path relative to the same root the
  // label is relative to.
  result.recordName = label + rotated.slice(destPath.length);
  return result;
}

// Back up every existing file that is about to change, then copy source over it.
// Returns { created, updated, backedUp, backedUpFiles[] }.
function backupAndCopy(sourceDir, targetDir, projectRoot) {
  var stats = { created: 0, updated: 0, backedUp: 0, backedUpFiles: [] };

  function copy(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    var entries = fs.readdirSync(src, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var srcPath = path.join(src, entry.name);
      var destPath = path.join(dest, entry.name);

      // Refuse to follow symlinks. A malicious or accidental symlink in the
      // source tree (e.g. inside an extracted tarball) could otherwise cause us
      // to traverse into /etc, $HOME, or other directories outside the intended
      // scope. Dirent.isSymbolicLink() reports the link itself without
      // following it — no extra lstat needed.
      if (entry.isSymbolicLink()) {
        continue;
      }

      // Never ship/overwrite personal machine-local settings. Team settings live
      // in .claude/settings.json; settings.local.json is the consumer's.
      if (entry.name === 'settings.local.json') {
        continue;
      }

      // harness.json is USER CONFIG, not template content — it holds the stop
      // gate, the protected base branch, work tracking and the model map.
      // Copying the template over it is what destroyed all three (see
      // harness-config.js); installHarnessConfig installs-or-merges it right
      // after this copy, so the user's file is never even briefly wiped.
      if (entry.name === 'harness.json') {
        continue;
      }

      if (entry.isDirectory()) {
        copy(srcPath, destPath);
      } else if (entry.isFile()) {
        var destExists = fs.existsSync(destPath);

        if (destExists) {
          var preserved = preserveBeforeOverwrite(
            destPath,
            srcPath,
            toProjectRelative(destPath, projectRoot)
          );
          if (preserved.backedUp) {
            stats.backedUp++;
            stats.backedUpFiles.push(preserved.recordName);
          }
        }

        var destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(srcPath, destPath);

        if (destExists) {
          stats.updated++;
        } else {
          stats.created++;
        }
      }
      // Skip special files (sockets, devices, FIFOs) silently.
    }
  }

  copy(sourceDir, targetDir);
  return stats;
}

// ─── .init-meta.json ─────────────────────────────────────────────────────────

// Read an existing .init-meta.json. Any failure — missing, unreadable,
// unparseable, or the wrong shape — is reported as "no record", never thrown:
// a corrupt breadcrumb file must not abort an update.
function readInitMeta(metaPath) {
  try {
    var parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function isMeaningfulVersion(v) {
  return typeof v === 'string' && v !== '' && v !== 'unknown';
}

// Write the breadcrumb /harness-init step 0 walks ("for each backedUpFiles
// entry, reconcile it back into the live file").
//
// backedUpFiles ACCUMULATES across runs. It used to be replaced, so a second
// update listed only that run's backups — the first adoption's AGENTS.md and
// rules dropped out of the list, and the reconcile that would have recovered
// the user's content never looked at them again (review F3).
//
// previousVersion/newVersion are always this run's. The first adoption's
// previousVersion is preserved separately as firstInstalledVersion, so the
// whole upgrade span stays visible instead of collapsing to the last hop.
function createInitMeta(targetDir, previousVersion, newVersion, backedUpFiles) {
  var metaDir = path.join(targetDir, '.claude');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  var metaPath = path.join(metaDir, '.init-meta.json');
  var existing = readInitMeta(metaPath);

  var union = [];
  var seen = Object.create(null);
  function add(list) {
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (typeof entry !== 'string' || seen[entry]) continue;
      seen[entry] = true;
      union.push(entry);
    }
  }
  if (existing) add(existing.backedUpFiles);
  add(backedUpFiles);

  var meta = {
    timestamp: new Date().toISOString(),
    previousVersion: previousVersion || 'unknown',
    newVersion: newVersion || 'unknown',
    backedUpFiles: union,
  };

  // The OLDEST record wins: an earlier run's firstInstalledVersion if it already
  // carried one, otherwise that run's previousVersion.
  if (existing) {
    var first = isMeaningfulVersion(existing.firstInstalledVersion)
      ? existing.firstInstalledVersion
      : existing.previousVersion;
    if (isMeaningfulVersion(first)) meta.firstInstalledVersion = first;
  }

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

module.exports = {
  backupAndCopy: backupAndCopy,
  preserveBeforeOverwrite: preserveBeforeOverwrite,
  rotationBackupPath: rotationBackupPath,
  utcStamp: utcStamp,
  sameContent: sameContent,
  createInitMeta: createInitMeta,
};
