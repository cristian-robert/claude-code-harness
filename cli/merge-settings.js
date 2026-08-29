#!/usr/bin/env node
'use strict';

// cli/merge-settings.js
//
// Deep-merge a user's team `.claude/settings.json` with the framework's shipped
// version, so adopting/updating PHE keeps the user's hooks + permissions instead
// of clobbering them. Invoked automatically by init.js/update.js via
// reconcileSettingsJson() (user side = settings.json.backup, framework side =
// the just-installed settings.json); also runnable by hand as the
// `merge-settings` subcommand. Replaces the previous "keep user / keep framework
// / manual edit" chooser, which dropped one side or the other and left users
// with broken hook arrays.
//
// Merge rules:
//   - hooks.<lifecycle>: union of inner hooks by (matcher, type, command, args)
//     tuple. args MUST be part of the identity — every harness hook is
//     command:"node" differentiated only by its args (the script path), so
//     keying on command alone would collapse distinct guardrails into one. The
//     FULL inner hook object (args, timeout, statusMessage, …) is carried
//     through. Same tuple → deduped; any difference → both preserved (the
//     runtime runs all matched hooks).
//   - permissions.allow / permissions.deny: union, sorted, deduped.
//   - top-level scalar keys: user value wins (user explicitly chose it).
//   - top-level objects we don't recognise: deep-merge with user winning on
//     leaf scalar conflicts.
//
// Usage:
//   node cli/merge-settings.js --dry-run --user <path> --framework <path>
//   node cli/merge-settings.js --apply   --user <path> --framework <path>
//
// --dry-run prints the merged JSON to stdout (no write).
// --apply writes the merged result to the user path; tmp + rename for atomicity.

const fs = require('fs');
const path = require('path');

// ─── Args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { mode: null, user: null, framework: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.mode = 'dry-run';
    else if (a === '--apply') args.mode = 'apply';
    else if (a === '--user') args.user = argv[++i];
    else if (a === '--framework') args.framework = argv[++i];
    else if (a === '--help' || a === '-h') args.mode = 'help';
  }
  return args;
}

// ─── JSON IO ─────────────────────────────────────────────────────────────────

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf-8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

// ─── Merge ───────────────────────────────────────────────────────────────────

// Hooks shape (per Claude Code settings.json):
//   "hooks": {
//     "PostToolUse": [
//       { "matcher": "TodoWrite|TaskUpdate", "hooks": [ { "type": "command", "command": ".../foo.sh" } ] }
//     ]
//   }
//
// We merge by collecting the inner (matcher, command) tuples. Tuples are
// canonicalised so re-ordering of inner-hooks lists doesn't produce false
// duplicates or false uniques.

function tuplesFromMatcherEntry(entry) {
  // Returns [{ matcher, hook }, ...] for one outer entry. The FULL inner hook
  // object is carried through so args/timeout/statusMessage survive the merge —
  // dropping them turned every hook into a bare `node` that fails on stdin.
  const matcher = entry.matcher || '';
  const inner = Array.isArray(entry.hooks) ? entry.hooks : [];
  return inner.map((h) => ({ matcher, hook: h }));
}

function tupleKey(t) {
  // Identity = matcher + type + command + args. Every harness hook is
  // command:"node" differentiated ONLY by its args (the script path), so args
  // MUST be in the key — omitting it collapses distinct guardrails
  // (guard/post-edit/stop-gate…) on one matcher into a single entry.
  const h = t.hook || {};
  return [
    t.matcher,
    h.type || "command",
    h.command || "",
    JSON.stringify(h.args || []),
  ].join("\u0000");
}

function mergeHooksLifecycle(userArr, fwArr) {
  // Walk user's entries first (user takes precedence; their order wins),
  // then append any framework entries we haven't seen by tuple key.
  const seen = new Set();
  const tuples = [];
  for (const arr of [userArr || [], fwArr || []]) {
    for (const entry of arr) {
      for (const t of tuplesFromMatcherEntry(entry)) {
        const k = tupleKey(t);
        if (!seen.has(k)) {
          seen.add(k);
          tuples.push(t);
        }
      }
    }
  }
  // Re-group by matcher in tuple-encounter order.
  const byMatcher = new Map();
  const matcherOrder = [];
  for (const t of tuples) {
    if (!byMatcher.has(t.matcher)) {
      byMatcher.set(t.matcher, []);
      matcherOrder.push(t.matcher);
    }
    byMatcher.get(t.matcher).push(t.hook); // carry the full inner hook object
  }
  return matcherOrder.map((m) => ({ matcher: m, hooks: byMatcher.get(m) }));
}

function mergeHooks(userHooks, fwHooks) {
  const out = {};
  const lifecycles = new Set([
    ...Object.keys(userHooks || {}),
    ...Object.keys(fwHooks || {}),
  ]);
  for (const lc of lifecycles) {
    out[lc] = mergeHooksLifecycle(
      (userHooks || {})[lc],
      (fwHooks || {})[lc]
    );
  }
  return out;
}

function unionSortedArray(a, b) {
  const set = new Set([...(a || []), ...(b || [])]);
  return [...set].sort();
}

function mergePermissions(userPerm, fwPerm) {
  const out = { ...(fwPerm || {}), ...(userPerm || {}) };
  out.allow = unionSortedArray(
    (userPerm && userPerm.allow) || [],
    (fwPerm && fwPerm.allow) || []
  );
  out.deny = unionSortedArray(
    (userPerm && userPerm.deny) || [],
    (fwPerm && fwPerm.deny) || []
  );
  return out;
}

// User scalar wins; objects merge recursively; arrays are union-sorted-dedup.
function deepMergeUserWins(user, fw) {
  if (Array.isArray(user) || Array.isArray(fw)) {
    return unionSortedArray(user || [], fw || []);
  }
  if (user && typeof user === 'object' && fw && typeof fw === 'object') {
    const out = {};
    const keys = new Set([...Object.keys(user), ...Object.keys(fw)]);
    for (const k of keys) {
      if (k in user && k in fw) out[k] = deepMergeUserWins(user[k], fw[k]);
      else if (k in user) out[k] = user[k];
      else out[k] = fw[k];
    }
    return out;
  }
  return user !== undefined ? user : fw;
}

function mergeSettings(user, fw) {
  // Start with framework defaults, overlay user. Then handle the keys with
  // domain-specific merge semantics.
  const out = deepMergeUserWins(user, fw);
  out.hooks = mergeHooks(user.hooks, fw.hooks);
  out.permissions = mergePermissions(user.permissions, fw.permissions);
  return out;
}

// ─── init/update post-step ───────────────────────────────────────────────────

// Called by init.js/update.js AFTER the payload is copied. If the user had a
// pre-existing team .claude/settings.json, backupAndCopy saved it to
// settings.json.backup and overwrote settings.json with the framework's. Here we
// union the two back together so the user's hooks + permissions survive
// alongside PHE's, deterministically — no LLM, no human step.
//
//   settings.json := mergeSettings(user = <settings.json.backup>,
//                                   framework = <freshly-installed settings.json>)
//
// CRITICAL: only merge a backup that is genuinely the user's PRE-PHE settings,
// never PHE's own previous version. On a fresh install (no user settings), the
// FIRST `update` backs up PHE's OWN file — unioning that into a later version
// would resurrect hooks/permissions the framework intentionally removed (a
// security ratchet reversal, since the union only adds). We therefore merge only
// when:
//   - opts.userBackupJustCreated — init just backed up a pre-existing
//     settings.json (init is PHE's first contact, so anything there is the
//     user's); this also RECORDS a marker, or
//   - that marker already exists — a prior adoption flagged the backup as
//     user-origin, so subsequent updates keep re-unioning it (idempotent, and
//     framework removals still apply because the backup never held PHE's hooks).
// Update passes no flag and relies on the marker only, so a PHE-origin backup is
// never mistaken for user content. Fails safe: a malformed backup leaves the
// framework settings.json intact rather than bricking the install.
function reconcileSettingsJson(projectRoot, opts) {
  opts = opts || {};
  const live = path.join(projectRoot, '.claude', 'settings.json');
  const backup = live + '.backup';
  const marker = path.join(projectRoot, '.claude', '.settings-user-origin');
  if (!fs.existsSync(live) || !fs.existsSync(backup)) return { merged: false };
  const userOrigin = opts.userBackupJustCreated === true || fs.existsSync(marker);
  if (!userOrigin) return { merged: false };
  try {
    const user = readJson(backup);
    const framework = readJson(live);
    const merged = mergeSettings(user, framework);
    writeJsonAtomic(live, merged);
    try {
      fs.writeFileSync(
        marker,
        '# .claude/settings.json.backup holds your pre-PHE settings; init/update re-union it\n# with the framework version. Delete this file AND the .backup once fully migrated.\n'
      );
    } catch (_) { /* marker is best-effort */ }
    return { merged: true };
  } catch (e) {
    return { merged: false, error: e.message };
  }
}

// ─── Plugin keys survive the copy path ───────────────────────────────────────

// Keys in .claude/settings.json that Claude Code itself writes on the user's behalf
// (`claude plugin install --scope project`). backupAndCopy preserves only the FIRST
// backup ever taken, so on re-init/update these keys would be overwritten by the
// template and never re-unioned. init/update bracket the copy with this pair.
const PLUGIN_KEYS = ['enabledPlugins', 'extraKnownMarketplaces'];

function capturePluginKeys(projectRoot) {
  const live = path.join(projectRoot, '.claude', 'settings.json');
  if (!fs.existsSync(live)) return null;
  let parsed;
  try { parsed = readJson(live); } catch (e) { return null; }
  const captured = {};
  let any = false;
  for (const k of PLUGIN_KEYS) {
    if (parsed && parsed[k] && typeof parsed[k] === 'object' && !Array.isArray(parsed[k])) {
      captured[k] = parsed[k];
      any = true;
    }
  }
  return any ? captured : null;
}

function restorePluginKeys(projectRoot, captured) {
  if (!captured) return { restored: false };
  const live = path.join(projectRoot, '.claude', 'settings.json');
  if (!fs.existsSync(live)) return { restored: false };
  let parsed;
  try { parsed = readJson(live); } catch (e) { return { restored: false, error: e.message }; }
  for (const k of PLUGIN_KEYS) {
    if (k in captured) parsed[k] = deepMergeUserWins(captured[k], parsed[k]);
  }
  writeJsonAtomic(live, parsed);
  return { restored: true };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function help() {
  return [
    'Usage: merge-settings.js --dry-run|--apply --user <path> --framework <path>',
    '',
    'Deep-merges a user .claude/settings.json with the framework version.',
    'Hooks arrays are union-merged by (matcher, type, command, args) tuple; user',
    'entries are preserved and framework entries added if not already present.',
    'Permissions arrays are union-merged. Other keys: user value wins on',
    'scalar conflicts.',
    '',
    'Modes:',
    '  --dry-run   Print merged JSON to stdout. No file is written.',
    '  --apply     Write merged JSON atomically to the --user path.',
  ].join('\n');
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'help' || !args.mode) {
    console.log(help());
    process.exit(args.mode === 'help' ? 0 : 2);
  }
  if (!args.user || !args.framework) {
    console.error('error: --user and --framework are required');
    console.error(help());
    process.exit(2);
  }

  let user, fw;
  try {
    user = readJson(args.user);
  } catch (e) {
    console.error('error: failed to parse user JSON at ' + args.user + ': ' + e.message);
    process.exit(1);
  }
  try {
    fw = readJson(args.framework);
  } catch (e) {
    console.error('error: failed to parse framework JSON at ' + args.framework + ': ' + e.message);
    process.exit(1);
  }

  const merged = mergeSettings(user, fw);

  if (args.mode === 'dry-run') {
    process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
    process.exit(0);
  }

  // --apply
  writeJsonAtomic(args.user, merged);
  console.log('merged → ' + args.user);
}

module.exports = {
  mergeSettings,
  mergeHooks,
  mergePermissions,
  deepMergeUserWins,
  reconcileSettingsJson,
  capturePluginKeys,
  restorePluginKeys,
};
