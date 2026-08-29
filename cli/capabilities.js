'use strict';
// Dynamic capabilities resolver — spec: docs/design/2026-08-29-dynamic-capabilities.md.
// Everything here fails OPEN (ADR-006): no claude binary, no network, no marketplace —
// init still completes; the outcome is recorded, never thrown.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { writeJsonAtomic } = require('./harness-config');
const { deepMergeUserWins } = require('./merge-settings');

// PATH scan in Node — never `command -v`/`which` (ADR-007: shell checks fail open
// on Windows). PATHEXT makes `claude` match claude.CMD on win32.
function findOnPath(bin, env) {
  env = env || process.env;
  var dirs = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  var exts = process.platform === 'win32'
    ? String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (var i = 0; i < dirs.length; i++) {
    for (var j = 0; j < exts.length; j++) {
      var p = path.join(dirs[i], bin + exts[j]);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        if (fs.statSync(p).isFile()) return p;
      } catch (e) { /* keep scanning */ }
    }
  }
  return null;
}

// null = no binary. {ok,out,err} otherwise — callers classify, never see a throw.
// .cmd/.bat need shell:true on win32; safe ONLY because every caller passes fixed
// literals from the repo-owner-trusted manifest (same trust class as stopGate).
function runClaude(args) {
  var bin = findOnPath('claude');
  if (!bin) return null;
  var opts = { encoding: 'utf-8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] };
  if (/\.(cmd|bat)$/i.test(bin)) opts.shell = true;
  try {
    var out = execFileSync(bin, args, opts);
    return { ok: true, out: String(out), err: '' };
  } catch (e) {
    return { ok: false, out: String(e.stdout || ''), err: String(e.stderr || e.message || '') };
  }
}

function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// id -> {value, scope} across the three documented settings files.
// Later files win: user < project < local (matches the documented precedence).
function readEnabledPlugins(projectRoot) {
  var files = [
    { p: path.join(claudeConfigDir(), 'settings.json'), scope: 'user' },
    { p: path.join(projectRoot, '.claude', 'settings.json'), scope: 'project' },
    { p: path.join(projectRoot, '.claude', 'settings.local.json'), scope: 'local' },
  ];
  var out = {};
  for (var i = 0; i < files.length; i++) {
    try {
      var parsed = JSON.parse(fs.readFileSync(files[i].p, 'utf-8'));
      var ep = parsed && parsed.enabledPlugins;
      if (ep && typeof ep === 'object' && !Array.isArray(ep)) {
        for (var id in ep) out[id] = { value: ep[id], scope: files[i].scope };
      }
    } catch (e) { /* absent/unparseable file contributes nothing */ }
  }
  return out;
}

function readState(projectRoot) {
  var state = { claude: null, plugins: [], pluginNames: {}, marketplaces: [], catalog: {}, enabledIn: {} };
  var v = runClaude(['--version']);
  if (v === null || !v.ok) { state.enabledIn = readEnabledPlugins(projectRoot); return state; }
  state.claude = v.out.trim();
  var list = runClaude(['plugin', 'list', '--json']);
  if (list && list.ok) {
    try {
      // Parseable-but-not-an-array (null, an object wrapper) must degrade to
      // the documented empty array, never leak a foreign shape downstream.
      var parsedList = JSON.parse(list.out);
      if (Array.isArray(parsedList)) state.plugins = parsedList;
      for (var i = 0; i < state.plugins.length; i++) {
        var entry = state.plugins[i];
        if (!entry || typeof entry !== 'object') continue; // junk element
        var name = String(entry.id || '').split('@')[0];
        if (!name) continue;
        // Bare-name index: an ENABLED copy from any marketplace counts as
        // present (spec, Components 2), so it wins over a disabled copy
        // regardless of list order; among equals the first entry is kept.
        var prev = state.pluginNames[name];
        if (!prev || (prev.enabled === false && entry.enabled !== false)) {
          state.pluginNames[name] = entry;
        }
      }
    } catch (e) { /* unparseable → treated as empty */ }
  }
  var mkts = runClaude(['plugin', 'marketplace', 'list', '--json']);
  if (mkts && mkts.ok) {
    try {
      var parsedMkts = JSON.parse(mkts.out);
      if (Array.isArray(parsedMkts)) state.marketplaces = parsedMkts; // same guard: null would throw below
    } catch (e) { /* unparseable → treated as empty */ }
  }
  for (var m = 0; m < state.marketplaces.length; m++) {
    var mkt = state.marketplaces[m];
    if (!mkt || typeof mkt !== 'object') continue; // junk element
    var loc = mkt.installLocation;
    if (!loc) continue;
    try {
      var catFile = path.join(loc, '.claude-plugin', 'marketplace.json');
      var cat = JSON.parse(fs.readFileSync(catFile, 'utf-8'));
      var plugins = Array.isArray(cat.plugins) ? cat.plugins : [];
      for (var pI = 0; pI < plugins.length; pI++) {
        state.catalog[plugins[pI].name + '@' + mkt.name] = plugins[pI];
      }
    } catch (e) { /* catalog unreadable → no provenance shown, still installable */ }
  }
  state.enabledIn = readEnabledPlugins(projectRoot);
  return state;
}

module.exports = {
  findOnPath: findOnPath,
  runClaude: runClaude,
  claudeConfigDir: claudeConfigDir,
  readEnabledPlugins: readEnabledPlugins,
  readState: readState,
};
