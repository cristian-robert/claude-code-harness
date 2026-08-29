'use strict';
// Dynamic capabilities resolver — spec: docs/design/2026-08-29-dynamic-capabilities.md.
// Everything here fails OPEN (ADR-006): no claude binary, no network, no marketplace —
// init still completes; the outcome is recorded, never thrown.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { writeJsonAtomic } = require('./harness-config');
const { deepMergeUserWins, restorePluginKeys } = require('./merge-settings');

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

var TIER_RANK = { required: 3, recommended: 2, optional: 1 };

function whenMatches(cap, stack, files) {
  if (!cap.when) return true; // required/optional rows usually carry no `when`
  var stacks = cap.when.stack || [];
  for (var i = 0; i < stacks.length; i++) if (stack.indexOf(stacks[i]) !== -1) return true;
  var fl = cap.when.files || [];
  for (var j = 0; j < fl.length; j++) if (files.indexOf(fl[j]) !== -1) return true;
  return false;
}

function planCapabilities(opts) {
  var out = { present: [], disabledByUser: [], install: [], needsMarketplace: [], declined: [], reoffer: [], blocked: [], manual: [] };
  var caps = (opts.manifest && opts.manifest.capabilities) || [];
  var decisions = opts.decisions || {};
  var registered = {};
  for (var m = 0; m < (opts.state.marketplaces || []).length; m++) registered[opts.state.marketplaces[m].name] = true;

  for (var i = 0; i < caps.length; i++) {
    var cap = caps[i];
    if (opts.tiers.indexOf(cap.tier) === -1) continue;
    if (cap.tier === 'recommended' && !whenMatches(cap, opts.stack || [], opts.files || [])) continue;

    var name = String(cap.id).split('@')[0];
    var mkt = String(cap.id).split('@')[1] || null;
    var catalogEntry = opts.state.catalog[cap.id] || {};
    var entry = {
      id: cap.id, tier: cap.tier, why: cap.why, class: cap.class || 'plugin',
      requiresBinary: cap.requiresBinary || null,
      binaryMissing: !!(cap.requiresBinary && opts.binaries && opts.binaries[cap.requiresBinary] === null),
      source: catalogEntry.source || null, sha: catalogEntry.sha || (catalogEntry.source && catalogEntry.source.sha) || null,
      marketplace: mkt,
    };

    // Order matters: recorded blocks beat everything; declines beat state reads.
    var blockedRec = decisions.unavailable && decisions.unavailable[cap.id];
    if (blockedRec && String(blockedRec.reason || '').indexOf('blocked') === 0) { out.blocked.push(entry); continue; }
    var declinedRec = decisions.declined && decisions.declined[cap.id];
    if (declinedRec) {
      if (TIER_RANK[cap.tier] > (TIER_RANK[declinedRec.tier] || 0)) out.reoffer.push(entry);
      else out.declined.push(entry);
      continue;
    }
    if (cap.class === 'global-agent' || cap.provision === 'manual' || opts.state.claude === null) { out.manual.push(entry); continue; }

    var installed = opts.state.pluginNames[name]; // bare-name match: any marketplace, --plugin-dir copies included
    if (installed && installed.enabled !== false) { out.present.push(entry); continue; }
    if (installed && installed.enabled === false) { out.disabledByUser.push(entry); continue; }
    var userDisabled = opts.state.enabledIn[cap.id];
    if (userDisabled && userDisabled.value === false && (userDisabled.scope === 'user' || userDisabled.scope === 'local')) {
      entry.overridesUserDisable = true;
      out.disabledByUser.push(entry); continue;
    }
    if (mkt && !registered[mkt]) { out.needsMarketplace.push(entry); continue; }
    out.install.push(entry);
  }
  return out;
}

// ── apply — the thin shell (spec: "apply() [thin shell]") ────────────────

// Pure text → reason. Order mirrors the spec's failure table: a policy setting
// name beats network text beats "not found"; anything else degrades to the
// first non-empty line (wording drift becomes a report line, never a crash).
function classifyFailure(err) {
  try {
    var text = String(err == null ? '' : err);
    var blocked = text.match(/(strictKnownMarketplaces|blockedMarketplaces|disableCommandPluginSources|managed settings)/i);
    if (blocked) return 'blocked: ' + blocked[1];
    if (/ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|fetch failed|getaddrinfo/i.test(text)) return 'network';
    if (/not found/i.test(text)) return 'not-found';
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line) return line.slice(0, 120);
    }
    return 'unknown';
  } catch (e) { return 'unknown'; } // a hostile toString still gets a reason
}

var DECISION_STATES = ['accepted', 'declined', 'unavailable'];

// Merge capability decisions into harness.json, preserving every other key.
// The ONE deliberate throw in this module: harness.json holds the stop gate, so
// an unparseable file REFUSES rather than overwrites (writeKnowledgeConfig parity).
function writeCapabilityDecisions(projectRoot, patch) {
  var p = path.join(projectRoot, '.claude', 'harness.json');
  var current = {};
  if (fs.existsSync(p)) {
    try { current = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.'); }
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
    }
  }
  var caps = current.capabilities && typeof current.capabilities === 'object' && !Array.isArray(current.capabilities)
    ? current.capabilities : {};
  DECISION_STATES.forEach(function (k) {
    if (!patch[k]) return;
    var prev = caps[k] && typeof caps[k] === 'object' && !Array.isArray(caps[k]) ? caps[k] : {};
    caps[k] = Object.assign({}, prev, patch[k]);
  });
  // One id, one decision state: a new accept evicts a stale decline/unavailable,
  // and vice versa. Exception: the SAME patch co-naming an id in two states is
  // deliberate — sha-drift records unavailable ALONGSIDE the accept (spec,
  // locked decision 4: provenance, not a pin).
  DECISION_STATES.forEach(function (k) {
    if (!patch[k]) return;
    Object.keys(patch[k]).forEach(function (id) {
      DECISION_STATES.forEach(function (other) {
        if (other === k) return;
        if (patch[other] && Object.prototype.hasOwnProperty.call(patch[other], id)) return;
        if (caps[other] && typeof caps[other] === 'object') delete caps[other][id];
      });
    });
  });
  ['scope', 'resolvedAt', 'manifestVersion'].forEach(function (k) {
    if (patch[k] !== undefined) caps[k] = patch[k];
  });
  current.capabilities = caps;
  writeJsonAtomic(p, current);
}

// `claude plugin marketplace add` argument for a manifest marketplace:
// github source → owner/repo shorthand, anything else → its url.
function marketplaceAddSpec(manifest, mktName) {
  var m = manifest && manifest.marketplaces && manifest.marketplaces[mktName];
  var src = m && m.source;
  if (!src) return null;
  if (src.source === 'github' && src.repo) return src.repo;
  return src.url || null;
}

// Post-install provenance re-read (spec, locked decision 4): the proposal-time
// sha is provenance, not a pin — the repo can move between proposal and install.
// Best-effort by design: an unreadable catalog means "cannot compare", not drift.
function readCatalogSha(id) {
  try {
    var name = String(id).split('@')[0];
    var mktName = String(id).split('@')[1] || null;
    if (!mktName) return null;
    var res = runClaude(['plugin', 'marketplace', 'list', '--json']);
    if (!res || !res.ok) return null;
    var arr = JSON.parse(res.out);
    if (!Array.isArray(arr)) return null;
    for (var i = 0; i < arr.length; i++) {
      var mkt = arr[i];
      if (!mkt || typeof mkt !== 'object' || mkt.name !== mktName || !mkt.installLocation) continue;
      var catFile = path.join(mkt.installLocation, '.claude-plugin', 'marketplace.json');
      var cat = JSON.parse(fs.readFileSync(catFile, 'utf-8'));
      var plugins = Array.isArray(cat.plugins) ? cat.plugins : [];
      for (var j = 0; j < plugins.length; j++) {
        var pl = plugins[j];
        if (pl && pl.name === name) return pl.sha || (pl.source && pl.source.sha) || null;
      }
    }
    return null;
  } catch (e) { return null; }
}

// Install the approved ids. Fail-open shell: every outcome lands in the returned
// buckets and harness.json, never in a throw — init exits 0 whatever happens.
// opts: {ids, planned, scope, projectRoot, manifestVersion, manifest} — manifest
// is optional but needed to resolve `marketplace add` sources and to hand-write
// extraKnownMarketplaces on the no-claude path.
function applyCapabilities(opts) {
  var result = { installed: [], failed: [], manual: [], marketplacesAdded: [] };
  try {
    var ids = opts.ids || [];
    var planned = opts.planned || {};
    var scope = opts.scope || 'project';
    var iso = new Date().toISOString().slice(0, 10);
    var accepted = {};
    var unavailable = {};
    var handwrite = null; // accumulated across ids, ONE settings write at the end
    var addedMkts = {};

    // Only planner-approved rows are actionable — apply never invents an install.
    var byId = {};
    ['install', 'needsMarketplace', 'reoffer', 'disabledByUser'].forEach(function (b) {
      (planned[b] || []).forEach(function (entry) {
        if (entry && entry.id && !byId[entry.id]) byId[entry.id] = { entry: entry, bucket: b };
      });
    });

    // No binary → no runClaude ever: declare intent in settings, hand back commands.
    function goManual(id, entry) {
      handwrite = handwrite || { enabledPlugins: {} };
      handwrite.enabledPlugins[id] = true;
      var m = entry.marketplace && opts.manifest && opts.manifest.marketplaces &&
        opts.manifest.marketplaces[entry.marketplace];
      if (m && m.source) {
        handwrite.extraKnownMarketplaces = handwrite.extraKnownMarketplaces || {};
        handwrite.extraKnownMarketplaces[entry.marketplace] = { source: m.source };
      }
      result.manual.push({ id: id, command: 'claude plugin install ' + id + ' --scope ' + scope });
    }
    function fail(id, reason) {
      unavailable[id] = { at: iso, reason: reason };
      result.failed.push({ id: id, reason: reason });
    }

    var noClaude = findOnPath('claude') === null;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var found = byId[id];
      if (!found) { result.failed.push({ id: id, reason: 'not-in-plan' }); continue; }
      if (noClaude) { goManual(id, found.entry); continue; }
      var entry = found.entry;

      if (found.bucket === 'needsMarketplace' && entry.marketplace && !addedMkts[entry.marketplace]) {
        var spec = marketplaceAddSpec(opts.manifest, entry.marketplace);
        if (!spec) { fail(id, 'no-marketplace-source: ' + entry.marketplace); continue; }
        var addRes = runClaude(['plugin', 'marketplace', 'add', spec]);
        if (addRes === null) { goManual(id, entry); continue; } // binary vanished mid-run
        if (!addRes.ok) { fail(id, classifyFailure((addRes.err || '') + '\n' + (addRes.out || ''))); continue; }
        addedMkts[entry.marketplace] = true;
        result.marketplacesAdded.push(entry.marketplace);
      }

      var res = runClaude(['plugin', 'install', id, '--scope', scope]);
      if (res === null) { goManual(id, entry); continue; }
      if (!res.ok) { fail(id, classifyFailure((res.err || '') + '\n' + (res.out || ''))); continue; }

      accepted[id] = { at: iso, tier: entry.tier, overrodeUserDisable: !!entry.overridesUserDisable };
      var postSha = readCatalogSha(id);
      if (entry.sha && postSha && entry.sha !== postSha) {
        // Drift is recorded ALONGSIDE the accept — the install happened; the
        // provenance mismatch is a report line, not a rollback.
        unavailable[id] = { at: iso, reason: 'sha-drift' };
      }
      result.installed.push(id);
    }

    if (handwrite) {
      var restored = restorePluginKeys(opts.projectRoot, handwrite);
      if (restored && restored.error) console.log('Could not hand-write .claude/settings.json: ' + restored.error);
    }
    if (Object.keys(accepted).length || Object.keys(unavailable).length) {
      var patch = { scope: scope, resolvedAt: iso };
      if (Object.keys(accepted).length) patch.accepted = accepted;
      if (Object.keys(unavailable).length) patch.unavailable = unavailable;
      if (opts.manifestVersion !== undefined) patch.manifestVersion = opts.manifestVersion;
      try { writeCapabilityDecisions(opts.projectRoot, patch); }
      catch (e) {
        // The one function here allowed to throw — but apply is not: the install
        // already happened, so surface the unrecorded decision and keep going.
        result.decisionsError = e.message;
        console.log('Capability decisions not recorded: ' + e.message);
      }
    }
    if (result.installed.length > 0) console.log('Run /reload-plugins in any open session.');
  } catch (e) {
    result.failed.push({ id: null, reason: classifyFailure(e && e.message || e) });
  }
  return result;
}

module.exports = {
  findOnPath: findOnPath,
  runClaude: runClaude,
  claudeConfigDir: claudeConfigDir,
  readEnabledPlugins: readEnabledPlugins,
  readState: readState,
  planCapabilities: planCapabilities,
  TIER_RANK: TIER_RANK,
  classifyFailure: classifyFailure,
  writeCapabilityDecisions: writeCapabilityDecisions,
  applyCapabilities: applyCapabilities,
};
