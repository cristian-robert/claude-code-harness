'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}
function tmpdir() {
  const d = path.join(os.tmpdir(), 'phe-cap-' + crypto.randomUUID());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Task 1: STACK_SIGNALS vocabulary ──────────────────────────────────────
const initMod = require('./init.js');
check('STACK_SIGNALS is a non-empty array', Array.isArray(initMod.STACK_SIGNALS) && initMod.STACK_SIGNALS.length > 0);
check('STACK_SIGNALS covers the known signals', ['Next.js','React','Vue','Svelte','Express','NestJS','Expo','Supabase','Tailwind','Stripe','Prisma','Drizzle','MongoDB/Mongoose','Python','FastAPI','Django','Flask','Go','Rust'].every(s => initMod.STACK_SIGNALS.indexOf(s) !== -1));
check('STACK_SIGNALS has no duplicates', new Set(initMod.STACK_SIGNALS).size === initMod.STACK_SIGNALS.length);

// detection still behaves: dual-key deps dedupe to one signal
{
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({
    dependencies: { next: '1', svelte: '1', '@sveltejs/kit': '1', prisma: '1', '@prisma/client': '1' }
  }));
  const prev = process.cwd();
  process.chdir(d);
  const got = initMod.detectTechStack();
  process.chdir(prev);
  check('detect: Next.js present', got.indexOf('Next.js') !== -1);
  check('detect: Svelte deduped', got.filter(s => s === 'Svelte').length === 1);
  check('detect: Prisma deduped', got.filter(s => s === 'Prisma').length === 1);
}

// ── Task 4: findOnPath / runClaude / readState with a fake `claude` ──────
if (process.platform !== 'win32') {
  const cap = require('./capabilities.js');
  {
    const bindir = tmpdir();
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo \'[{"id":"superpowers@claude-plugins-official","scope":"user","enabled":true,"installPath":"/tmp/x","version":"6.3.0"}]\'; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ]; then echo "[]"; exit 0; fi\n' +
      'exit 1\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir; // shim is the ONLY thing on PATH

    check('findOnPath finds the shim', cap.findOnPath('claude') === path.join(bindir, 'claude'));
    check('findOnPath misses absent bins', cap.findOnPath('definitely-not-a-binary-xyz') === null);
    const v = cap.runClaude(['--version']);
    check('runClaude ok', v && v.ok === true && v.out.indexOf('9.9.9') !== -1);
    const bad = cap.runClaude(['nonsense']);
    check('runClaude failure carries ok:false, not a throw', bad && bad.ok === false);

    const proj = tmpdir();
    const state = cap.readState(proj);
    check('state.claude read', state.claude === '9.9.9 (Claude Code)');
    check('plugin indexed by bare name', !!state.pluginNames['superpowers']);

    process.env.PATH = prevPath;
    check('no claude → state.claude null', (function () {
      process.env.PATH = tmpdir(); // empty dir
      const s = cap.readState(proj);
      process.env.PATH = prevPath;
      return s.claude === null;
    })());
  }
}

// ── Task 4 hardening: readState never throws, whatever shape claude prints ──
// Spec (Components 2): "readState() — best-effort, never throws". JSON that
// parses but is not the expected array (`null`, an object wrapper, junk
// elements) must degrade to the documented empty shapes, not leak through.
if (process.platform !== 'win32') {
  const cap = require('./capabilities.js');
  {
    const bindir = tmpdir();
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ]; then echo "null"; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo \'[null,{"id":"codex@openai-codex","enabled":true}]\'; exit 0; fi\n' +
      'exit 1\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir;

    let state = null, threw = null;
    try { state = cap.readState(tmpdir()); } catch (e) { threw = e; }
    check('readState survives marketplace list printing null', threw === null);
    check('null marketplace list degrades to []', !!state && Array.isArray(state.marketplaces) && state.marketplaces.length === 0);
    check('junk plugin-list element skipped, real one indexed', !!state && !!state.pluginNames['codex']);

    // plugin list itself printing null → plugins stays an array, never null
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ]; then echo "[]"; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo "null"; exit 0; fi\n' +
      'exit 1\n');
    let state2 = null, threw2 = null;
    try { state2 = cap.readState(tmpdir()); } catch (e) { threw2 = e; }
    check('readState survives plugin list printing null', threw2 === null);
    check('null plugin list degrades to []', !!state2 && Array.isArray(state2.plugins) && state2.plugins.length === 0);

    process.env.PATH = prevPath;
  }

  // Duplicate bare names: the spec's bare-name match exists so "a --plugin-dir
  // copy or the same plugin from another marketplace counts as present" — so an
  // ENABLED copy anywhere must win the index over a disabled one, regardless of
  // list order. Two enabled copies: first wins (stable).
  {
    const bindir = tmpdir();
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ]; then echo "[]"; exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo \'[{"id":"superpowers@claude-plugins-official","enabled":false},{"id":"superpowers@elsewhere","enabled":true}]\'; exit 0; fi\n' +
      'exit 1\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir;
    const state = cap.readState(tmpdir());
    process.env.PATH = prevPath;
    check('enabled copy wins the bare-name index over a disabled one',
      !!state.pluginNames['superpowers'] && state.pluginNames['superpowers'].enabled === true);
    check('both copies still listed in state.plugins', Array.isArray(state.plugins) && state.plugins.length === 2);
  }

  // enabledPlugins that is an array must contribute nothing (index keys are junk)
  {
    const proj = tmpdir();
    fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: ['a@m', 'b@m'] }));
    const prevCfg = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = tmpdir(); // isolate from the real ~/.claude
    const enabled = cap.readEnabledPlugins(proj);
    if (prevCfg === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevCfg;
    check('array-shaped enabledPlugins contributes nothing', Object.keys(enabled).length === 0);
  }
}

// ── Task 5: planCapabilities buckets ─────────────────────────────────────
// Pure-function tests — platform-independent, so they run outside the win32
// guard (the planner touches no fs and spawns nothing).
{
  const cap = require('./capabilities.js');
  const M = { marketplaces: { 'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' }, trust: 'official' } }, capabilities: [
    { id: 'superpowers@claude-plugins-official', class: 'plugin', tier: 'required', skills: ['brainstorming'], why: 'w' },
    { id: 'typescript-lsp@claude-plugins-official', class: 'plugin', tier: 'recommended', when: { files: ['tsconfig.json'] }, requiresBinary: 'typescript-language-server', why: 'w' },
    { id: 'pyright-lsp@claude-plugins-official', class: 'plugin', tier: 'recommended', when: { stack: ['Python'] }, requiresBinary: 'pyright-langserver', why: 'w' },
    { id: 'codex@openai-codex', class: 'plugin', tier: 'optional', skills: ['rescue'], why: 'w' },
    { id: 'architect-agent', class: 'global-agent', tier: 'recommended', provision: 'manual', why: 'w' },
  ]};
  const baseState = { claude: '9.9.9', plugins: [], pluginNames: {}, marketplaces: [{ name: 'claude-plugins-official' }], catalog: {}, enabledIn: {} };
  // Default tiers deliberately EXCLUDE 'optional' (controller ruling A on the
  // brief's fixture: optional is off by default, tiers is a plain filter; the
  // explicit ['optional'] re-plan below carries the needsMarketplace assertion).
  const P = (over) => cap.planCapabilities(Object.assign({ manifest: M, stack: [], files: [], binaries: {}, state: baseState, decisions: {}, tiers: ['required', 'recommended'] }, over));

  check('required + registered mkt → install', P({}).install.some(e => e.id === 'superpowers@claude-plugins-official'));
  check('global-agent → manual', P({}).manual.some(e => e.id === 'architect-agent'));
  check('no claude → everything manual', P({ state: Object.assign({}, baseState, { claude: null }) }).manual.some(e => e.id === 'superpowers@claude-plugins-official'));
  check('recommended without when-match is absent everywhere', Object.values(P({})).every(b => !b.some || !b.some(e => e.id === 'pyright-lsp@claude-plugins-official')) || !JSON.stringify(P({})).includes('pyright-lsp'));
  check('when.stack match → install', P({ stack: ['Python'] }).install.some(e => e.id === 'pyright-lsp@claude-plugins-official'));
  check('when.files match → install', P({ files: ['tsconfig.json'] }).install.some(e => e.id === 'typescript-lsp@claude-plugins-official'));
  check('binaryMissing flagged', P({ stack: ['Python'], binaries: { 'pyright-langserver': null } }).install.find(e => e.id === 'pyright-lsp@claude-plugins-official').binaryMissing === true);
  check('installed+enabled by bare name → present (any marketplace)',
    P({ state: Object.assign({}, baseState, { pluginNames: { superpowers: { id: 'superpowers@elsewhere', enabled: true } } }) }).present.some(e => e.id === 'superpowers@claude-plugins-official'));
  check('installed but disabled → disabledByUser',
    P({ state: Object.assign({}, baseState, { pluginNames: { superpowers: { id: 'superpowers@claude-plugins-official', enabled: false } } }) }).disabledByUser.length === 1);
  check('unregistered marketplace → needsMarketplace', P({}).needsMarketplace.some(e => e.id === 'codex@openai-codex') === false /* optional tier not requested */ &&
    cap.planCapabilities({ manifest: M, stack: [], files: [], binaries: {}, state: baseState, decisions: {}, tiers: ['optional'] }).needsMarketplace.some(e => e.id === 'codex@openai-codex'));
  check('declined same tier → declined bucket', P({ decisions: { declined: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'required' } } } }).declined.length === 1);
  check('declined lower tier, now higher → reoffer', P({ decisions: { declined: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'recommended' } } } }).reoffer.length === 1);
  check('recorded blocked → blocked, never install', P({ decisions: { unavailable: { 'superpowers@claude-plugins-official': { at: 'x', reason: 'blocked: strictKnownMarketplaces' } } } }).blocked.length === 1);
}


// ── Task 6: classifyFailure (pure) ───────────────────────────────────────
{
  const cap = require('./capabilities.js');
  check('classify: policy refusal → blocked: <setting name>',
    cap.classifyFailure('Error: blocked by strictKnownMarketplaces') === 'blocked: strictKnownMarketplaces');
  check('classify: DNS failure → network',
    cap.classifyFailure('getaddrinfo ENOTFOUND github.com') === 'network');
  check('classify: gone from catalog → not-found',
    cap.classifyFailure('Plugin superpowers not found in marketplace') === 'not-found');
  check('classify: unmatched text → first non-empty line',
    cap.classifyFailure('\n\nsome unrecognised failure\nsecond line') === 'some unrecognised failure');
  check('classify: fallback truncated to 120 chars',
    cap.classifyFailure('x'.repeat(200)).length === 120);
}

// ── Task 6: writeCapabilityDecisions ─────────────────────────────────────
{
  const cap = require('./capabilities.js');
  const proj = tmpdir();
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  const hj = path.join(proj, '.claude', 'harness.json');
  fs.writeFileSync(hj, JSON.stringify({ stopGate: { enabled: true }, knowledge: { local: 'knowledge-base' } }));

  cap.writeCapabilityDecisions(proj, { accepted: { 'a@m': { at: '2026-08-30', tier: 'required' } }, scope: 'project', manifestVersion: 1 });
  cap.writeCapabilityDecisions(proj, { declined: { 'b@m': { at: '2026-08-30', tier: 'optional' } } });
  let got = JSON.parse(fs.readFileSync(hj, 'utf-8'));
  check('decisions: accepted survives a later declined patch', got.capabilities.accepted['a@m'].tier === 'required');
  check('decisions: declined patch landed', got.capabilities.declined['b@m'].tier === 'optional');
  check('decisions: other harness.json keys intact', got.stopGate.enabled === true && got.knowledge.local === 'knowledge-base');
  check('decisions: scope/manifestVersion recorded', got.capabilities.scope === 'project' && got.capabilities.manifestVersion === 1);

  // One id, one decision state — a new decision evicts the old one.
  cap.writeCapabilityDecisions(proj, { declined: { 'a@m': { at: 'x', tier: 'required' } } });
  got = JSON.parse(fs.readFileSync(hj, 'utf-8'));
  check('decisions: a new decline evicts the accept', got.capabilities.accepted['a@m'] === undefined && got.capabilities.declined['a@m'].at === 'x');
  cap.writeCapabilityDecisions(proj, { accepted: { 'a@m': { at: 'y', tier: 'required' } } });
  got = JSON.parse(fs.readFileSync(hj, 'utf-8'));
  check('decisions: a new accept evicts the decline', got.capabilities.declined['a@m'] === undefined && got.capabilities.accepted['a@m'].at === 'y');

  // The ONE exception: accept + unavailable co-named in the SAME patch is the
  // sha-drift record (spec, locked decision 4) — both must land.
  cap.writeCapabilityDecisions(proj, { accepted: { 'c@m': { at: 'z', tier: 'required' } }, unavailable: { 'c@m': { at: 'z', reason: 'sha-drift' } } });
  got = JSON.parse(fs.readFileSync(hj, 'utf-8'));
  check('decisions: sha-drift co-write keeps both states', got.capabilities.accepted['c@m'].at === 'z' && got.capabilities.unavailable['c@m'].reason === 'sha-drift');

  // Unparseable harness.json → throws and leaves the file untouched.
  const proj2 = tmpdir();
  fs.mkdirSync(path.join(proj2, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(proj2, '.claude', 'harness.json'), '{ not json');
  let threw = null;
  try { cap.writeCapabilityDecisions(proj2, { accepted: { 'a@m': { at: 'x' } } }); } catch (e) { threw = e; }
  check('decisions: unparseable harness.json throws, does not overwrite',
    threw !== null && fs.readFileSync(path.join(proj2, '.claude', 'harness.json'), 'utf-8') === '{ not json');

  // Missing harness.json → created holding capabilities only.
  const proj3 = tmpdir();
  cap.writeCapabilityDecisions(proj3, { accepted: { 'a@m': { at: 'x', tier: 'required' } } });
  const fresh = JSON.parse(fs.readFileSync(path.join(proj3, '.claude', 'harness.json'), 'utf-8'));
  check('decisions: missing harness.json → {capabilities} only', Object.keys(fresh).length === 1 && fresh.capabilities.accepted['a@m'].at === 'x');
}

// ── Task 6: applyCapabilities against a shimmed claude ───────────────────
if (process.platform !== 'win32') {
  const cap = require('./capabilities.js');
  const entryFor = (over) => Object.assign({
    id: 'superpowers@claude-plugins-official', tier: 'required', why: 'w', class: 'plugin',
    requiresBinary: null, binaryMissing: false, source: null, sha: null, marketplace: 'claude-plugins-official',
  }, over);
  const plannedWith = (bucket, entry) => {
    const p = { install: [], needsMarketplace: [], reoffer: [], disabledByUser: [] };
    p[bucket] = [entry];
    return p;
  };
  const MANIFEST = { marketplaces: { 'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' }, trust: 'official' } }, capabilities: [] };
  const capture = (fn) => {
    const lines = [];
    const orig = console.log;
    console.log = (...a) => lines.push(a.join(' '));
    try { return { result: fn(), lines }; } finally { console.log = orig; }
  };

  // Success path: argv recorded, accepted recorded, reload line printed once.
  {
    const bindir = tmpdir();
    const argvLog = path.join(bindir, 'argv.log');
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'echo "$@" >> "' + argvLog + '"\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ]; then echo "[]"; exit 0; fi\n' +
      'exit 0\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir;
    const proj = tmpdir();
    const { result, lines } = capture(() => cap.applyCapabilities({
      ids: ['superpowers@claude-plugins-official'],
      planned: plannedWith('install', entryFor()),
      scope: 'project', projectRoot: proj, manifestVersion: 1, manifest: MANIFEST,
    }));
    const notInPlan = capture(() => cap.applyCapabilities({
      ids: ['nope@x'], planned: plannedWith('install', entryFor()),
      scope: 'project', projectRoot: tmpdir(), manifest: MANIFEST,
    })).result;
    process.env.PATH = prevPath;
    const argv = fs.readFileSync(argvLog, 'utf-8');
    check('apply: install argv is plugin install <id> --scope project',
      argv.split('\n').indexOf('plugin install superpowers@claude-plugins-official --scope project') !== -1);
    const hj = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
    check('apply: accepted recorded in harness.json',
      !!hj.capabilities.accepted['superpowers@claude-plugins-official'] && hj.capabilities.accepted['superpowers@claude-plugins-official'].tier === 'required');
    check('apply: installed lists the id', result.installed.indexOf('superpowers@claude-plugins-official') !== -1);
    check('apply: reload line printed once', lines.filter(l => l === 'Run /reload-plugins in any open session.').length === 1);
    check('apply: unknown id → failed not-in-plan', notInPlan.failed.length === 1 && notInPlan.failed[0].reason === 'not-in-plan');
  }

  // Policy refusal: unavailable with a blocked: prefix, function still returns.
  {
    const bindir = tmpdir();
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then echo "Error: blocked by strictKnownMarketplaces" >&2; exit 1; fi\n' +
      'echo "[]"; exit 0\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir;
    const proj = tmpdir();
    let threw = null, out = null, lines = null;
    try {
      const r = capture(() => cap.applyCapabilities({
        ids: ['superpowers@claude-plugins-official'], planned: plannedWith('install', entryFor()),
        scope: 'project', projectRoot: proj, manifest: MANIFEST,
      }));
      out = r.result; lines = r.lines;
    } catch (e) { threw = e; }
    process.env.PATH = prevPath;
    check('apply: policy refusal returns, never throws', threw === null && !!out);
    const hj = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
    check('apply: refusal recorded unavailable with blocked: prefix',
      String(hj.capabilities.unavailable['superpowers@claude-plugins-official'].reason).indexOf('blocked:') === 0);
    check('apply: failed carries the id, nothing installed', out.failed.length === 1 && out.installed.length === 0);
    check('apply: no reload line when nothing installed', lines.indexOf('Run /reload-plugins in any open session.') === -1);
  }

  // needsMarketplace: marketplace add precedes install, github source → repo shorthand.
  {
    const bindir = tmpdir();
    const argvLog = path.join(bindir, 'argv.log');
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'echo "$@" >> "' + argvLog + '"\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "add" ]; then exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then exit 0; fi\n' +
      'echo "[]"; exit 0\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir;
    const proj = tmpdir();
    const { result } = capture(() => cap.applyCapabilities({
      ids: ['superpowers@claude-plugins-official'], planned: plannedWith('needsMarketplace', entryFor()),
      scope: 'project', projectRoot: proj, manifest: MANIFEST,
    }));
    process.env.PATH = prevPath;
    const argv = fs.readFileSync(argvLog, 'utf-8').split('\n');
    check('apply: github marketplace added by repo shorthand before install',
      argv.indexOf('plugin marketplace add anthropics/claude-plugins-official') !== -1 &&
      argv.indexOf('plugin marketplace add anthropics/claude-plugins-official') < argv.indexOf('plugin install superpowers@claude-plugins-official --scope project'));
    check('apply: marketplacesAdded records the name', result.marketplacesAdded.indexOf('claude-plugins-official') !== -1);
  }

  // sha-drift: post-install catalog sha differs from proposal-time sha →
  // unavailable(sha-drift) recorded ALONGSIDE the accept.
  {
    const bindir = tmpdir();
    const mktDir = tmpdir();
    fs.mkdirSync(path.join(mktDir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(mktDir, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ plugins: [{ name: 'superpowers', sha: 'post-install-sha' }] }));
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then exit 0; fi\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ]; then echo \'' + JSON.stringify([{ name: 'claude-plugins-official', installLocation: mktDir }]) + '\'; exit 0; fi\n' +
      'exit 0\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir;
    const proj = tmpdir();
    capture(() => cap.applyCapabilities({
      ids: ['superpowers@claude-plugins-official'], planned: plannedWith('install', entryFor({ sha: 'proposal-sha' })),
      scope: 'project', projectRoot: proj, manifest: MANIFEST,
    }));
    process.env.PATH = prevPath;
    const hj = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
    check('apply: sha drift recorded alongside the accept',
      !!hj.capabilities.accepted['superpowers@claude-plugins-official'] &&
      hj.capabilities.unavailable['superpowers@claude-plugins-official'].reason === 'sha-drift');
  }

  // No claude on PATH: hand-write project settings, return the exact command.
  {
    const prevPath = process.env.PATH;
    process.env.PATH = tmpdir(); // empty dir — no claude anywhere
    const proj = tmpdir();
    fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), '{}');
    const { result } = capture(() => cap.applyCapabilities({
      ids: ['superpowers@claude-plugins-official'], planned: plannedWith('install', entryFor()),
      scope: 'project', projectRoot: proj, manifest: MANIFEST,
    }));
    process.env.PATH = prevPath;
    const settings = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf-8'));
    check('apply: no claude → enabledPlugins hand-written true',
      settings.enabledPlugins['superpowers@claude-plugins-official'] === true);
    check('apply: no claude → manifest marketplace hand-written into extraKnownMarketplaces',
      !!settings.extraKnownMarketplaces && settings.extraKnownMarketplaces['claude-plugins-official'].source.repo === 'anthropics/claude-plugins-official');
    check('apply: no claude → manual carries the exact command',
      result.manual.length === 1 && result.manual[0].command === 'claude plugin install superpowers@claude-plugins-official --scope project');
    check('apply: no claude → nothing under installed/failed', result.installed.length === 0 && result.failed.length === 0);
  }

  // Fix wave (C2): a disabledByUser id must be re-ENABLED, never re-installed —
  // `claude plugin enable` is the documented re-enable path; install-on-disabled
  // is undocumented, so the consent override may not take effect while
  // harness.json records accepted+overrodeUserDisable.
  {
    const bindir = tmpdir();
    const argvLog = path.join(bindir, 'argv.log');
    fs.writeFileSync(path.join(bindir, 'claude'),
      '#!/bin/sh\n' +
      'echo "$@" >> "' + argvLog + '"\n' +
      'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ]; then echo "[]"; exit 0; fi\n' +
      'exit 0\n');
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    const prevPath = process.env.PATH;
    process.env.PATH = bindir;
    const proj = tmpdir();
    const { result } = capture(() => cap.applyCapabilities({
      ids: ['superpowers@claude-plugins-official'],
      planned: plannedWith('disabledByUser', entryFor({ overridesUserDisable: true })),
      scope: 'project', projectRoot: proj, manifestVersion: 1, manifest: MANIFEST,
    }));
    process.env.PATH = prevPath;
    const argv = fs.readFileSync(argvLog, 'utf-8').split('\n');
    check('apply: disabledByUser id → plugin enable <id> --scope project',
      argv.indexOf('plugin enable superpowers@claude-plugins-official --scope project') !== -1);
    check('apply: disabledByUser id → NO plugin install spawned',
      argv.every(l => l.indexOf('plugin install') === -1));
    const hjEnable = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
    check('apply: enable recorded as accepted with overrodeUserDisable',
      !!hjEnable.capabilities.accepted['superpowers@claude-plugins-official'] &&
      hjEnable.capabilities.accepted['superpowers@claude-plugins-official'].overrodeUserDisable === true);
    check('apply: enabled id lands in result.installed', result.installed.indexOf('superpowers@claude-plugins-official') !== -1);
  }
}

// ── Task 7: `capabilities` subcommand end-to-end via cli/index.js ────────
// Spawned like a user would run it: node cli/index.js capabilities <flags>,
// cwd = a tmp project, PATH = shim dir (or an empty dir for no-claude paths).
if (process.platform !== 'win32') {
  const { spawnSync } = require('child_process');
  const INDEX = path.join(__dirname, 'index.js');
  // The Task 5 fixture manifest, written as the project's installed copy.
  const FIXTURE = { marketplaces: { 'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' }, trust: 'official' } }, capabilities: [
    { id: 'superpowers@claude-plugins-official', class: 'plugin', tier: 'required', skills: ['brainstorming'], why: 'w' },
    { id: 'typescript-lsp@claude-plugins-official', class: 'plugin', tier: 'recommended', when: { files: ['tsconfig.json'] }, requiresBinary: 'typescript-language-server', why: 'w' },
    { id: 'codex@openai-codex', class: 'plugin', tier: 'optional', skills: ['rescue'], why: 'w' },
    { id: 'architect-agent', class: 'global-agent', tier: 'recommended', provision: 'manual', why: 'w' },
  ] };
  const mkProject = (harness, opts) => {
    const proj = tmpdir();
    fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
    if (!opts || !opts.noManifest) {
      fs.writeFileSync(path.join(proj, '.claude', 'capabilities.json'), JSON.stringify(FIXTURE));
    }
    fs.writeFileSync(path.join(proj, '.claude', 'harness.json'), JSON.stringify(harness || {}));
    return proj;
  };
  const mkShim = (body) => {
    const bindir = tmpdir();
    fs.writeFileSync(path.join(bindir, 'claude'), '#!/bin/sh\n' + body);
    fs.chmodSync(path.join(bindir, 'claude'), 0o755);
    return bindir;
  };
  // CLAUDE_CONFIG_DIR isolated so readEnabledPlugins never reads the real ~/.claude.
  const run = (args, proj, pathDir) => spawnSync(
    process.execPath, [INDEX, 'capabilities'].concat(args),
    { cwd: proj, encoding: 'utf-8', env: Object.assign({}, process.env, { PATH: pathDir, CLAUDE_CONFIG_DIR: tmpdir() }) });
  const okShimBody =
    'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
    'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ]; then echo \'[{"name":"claude-plugins-official"}]\'; exit 0; fi\n' +
    'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo "[]"; exit 0; fi\n';

  // --propose --json: full pipeline — manifest, stack, files, binaries, tiers all three.
  {
    const proj = mkProject({});
    fs.writeFileSync(path.join(proj, 'tsconfig.json'), '{}'); // when.files trigger
    const r = run(['--propose', '--json'], proj, mkShim(okShimBody + 'exit 1\n'));
    check('propose: exit 0', r.status === 0);
    let parsed = null;
    try { parsed = JSON.parse(r.stdout); } catch (e) { /* fails below */ }
    check('propose: stdout parses as {stack, plan}', !!parsed && Array.isArray(parsed.stack) && !!parsed.plan);
    check('propose: plan.install names superpowers', !!parsed && parsed.plan.install.some(e => e.id === 'superpowers@claude-plugins-official'));
    check('propose: tiers include optional → codex in needsMarketplace', !!parsed && parsed.plan.needsMarketplace.some(e => e.id === 'codex@openai-codex'));
    check('propose: when.files matched, missing binary flagged', !!parsed && parsed.plan.install.some(e => e.id === 'typescript-lsp@claude-plugins-official' && e.binaryMissing === true));
    check('propose: global-agent in manual', !!parsed && parsed.plan.manual.some(e => e.id === 'architect-agent'));
  }

  // --propose with no manifest: one-line error naming the path, exit 1.
  {
    const proj = mkProject({}, { noManifest: true });
    const r = run(['--propose', '--json'], proj, tmpdir());
    check('propose: missing manifest → exit 1', r.status === 1);
    check('propose: error names the manifest path', (r.stderr + r.stdout).indexOf(path.join('.claude', 'capabilities.json')) !== -1);
  }

  // --check: accepted id not installed → each missing id + install command, exit 1.
  {
    const proj = mkProject({ capabilities: { scope: 'project', accepted: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'required' } } } });
    const r = run(['--check'], proj, mkShim(okShimBody + 'exit 1\n')); // plugin list []
    check('check: accepted-but-uninstalled → exit 1', r.status === 1);
    check('check: prints the missing id + install command',
      r.stdout.indexOf('claude plugin install superpowers@claude-plugins-official --scope project') !== -1);
  }

  // --check: all accepted installed → one ok line, exit 0.
  {
    const proj = mkProject({ capabilities: { accepted: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'required' } } } });
    const shim = mkShim(
      'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo \'[{"id":"superpowers@elsewhere","enabled":true}]\'; exit 0; fi\n' +
      'echo "[]"; exit 0\n');
    const r = run(['--check'], proj, shim);
    check('check: bare-name match across marketplaces → exit 0', r.status === 0);
  }

  // --check: no claude → the exact cannot-verify line, exit 0 (fail-open, ADR-006).
  {
    const proj = mkProject({ capabilities: { accepted: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'required' } } } });
    const r = run(['--check'], proj, tmpdir());
    check('check: no claude → exit 0', r.status === 0);
    check('check: no claude → the documented line', r.stdout.indexOf('capabilities --check: claude not on PATH — cannot verify') !== -1);
  }

  // --reset: declined + unavailable cleared; accepted/scope/other keys survive.
  {
    const proj = mkProject({ stopGate: { enabled: true }, capabilities: {
      scope: 'project', resolvedAt: 'x',
      accepted: { 'superpowers@claude-plugins-official': { at: 'x', tier: 'required' } },
      declined: { 'codex@openai-codex': { at: 'x', tier: 'optional' } },
      unavailable: { 'stripe@claude-plugins-official': { at: 'x', reason: 'network' } },
    } });
    const r = run(['--reset'], proj, tmpdir());
    const hj = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
    check('reset: exit 0', r.status === 0);
    check('reset: declined and unavailable gone', hj.capabilities.declined === undefined && hj.capabilities.unavailable === undefined);
    check('reset: accepted/scope/resolvedAt/other keys intact',
      !!hj.capabilities.accepted['superpowers@claude-plugins-official'] && hj.capabilities.scope === 'project' &&
      hj.capabilities.resolvedAt === 'x' && hj.stopGate.enabled === true);
    check('reset: prints what was cleared', r.stdout.indexOf('codex@openai-codex') !== -1 && r.stdout.indexOf('stripe@claude-plugins-official') !== -1);
  }

  // --apply, no claude: manual command printed VERBATIM (carry-forward from the
  // Task 6 review: apply returns the list, the CALLER prints it), settings
  // hand-written, exit 0.
  {
    const proj = mkProject({});
    fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), '{}');
    const r = run(['--apply', 'superpowers@claude-plugins-official'], proj, tmpdir());
    check('apply: no claude → exit 0', r.status === 0);
    check('apply: manual line carries the exact command',
      r.stdout.indexOf('claude plugin install superpowers@claude-plugins-official --scope project') !== -1);
    const settings = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf-8'));
    check('apply: no claude → enabledPlugins hand-written', !!settings.enabledPlugins && settings.enabledPlugins['superpowers@claude-plugins-official'] === true);
  }

  // --apply scope resolution: no --scope flag → recorded capabilities.scope wins.
  {
    const proj = mkProject({ capabilities: { scope: 'user' } });
    fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), '{}');
    const r = run(['--apply', 'superpowers@claude-plugins-official'], proj, tmpdir());
    check('apply: recorded scope used when no --scope flag', r.stdout.indexOf('--scope user') !== -1);
  }

  // --apply, install refused by policy: failed row printed with its reason, STILL exit 0.
  {
    const proj = mkProject({});
    const shim = mkShim(okShimBody +
      'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then echo "Error: blocked by strictKnownMarketplaces" >&2; exit 1; fi\n' +
      'exit 0\n');
    const r = run(['--apply', 'superpowers@claude-plugins-official'], proj, shim);
    check('apply: failure still exits 0 (fail-open)', r.status === 0);
    check('apply: failed row printed with id + reason',
      r.stdout.indexOf('superpowers@claude-plugins-official') !== -1 && r.stdout.indexOf('blocked: strictKnownMarketplaces') !== -1);
  }

  // --apply, success: installed line + reload hint land on stdout.
  {
    const proj = mkProject({});
    const shim = mkShim(okShimBody +
      'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then exit 0; fi\n' +
      'exit 0\n');
    const r = run(['--apply', 'superpowers@claude-plugins-official'], proj, shim);
    check('apply: success exits 0', r.status === 0);
    check('apply: installed id + reload hint printed',
      r.stdout.indexOf('superpowers@claude-plugins-official') !== -1 &&
      r.stdout.indexOf('Run /reload-plugins in any open session.') !== -1);
  }

  // --apply of a provision:manual PLUGIN with claude present: never installed
  // by apply (spec: userConfig/manual rows), but the command is printed so the
  // user can run it themselves. Exit 0.
  {
    const proj = tmpdir();
    fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.claude', 'capabilities.json'), JSON.stringify({
      marketplaces: FIXTURE.marketplaces,
      capabilities: [{ id: 'fussy@claude-plugins-official', class: 'plugin', tier: 'required', provision: 'manual', why: 'w' }],
    }));
    fs.writeFileSync(path.join(proj, '.claude', 'harness.json'), '{}');
    const argvLog = path.join(tmpdir(), 'argv.log');
    const shim = mkShim('echo "$@" >> "' + argvLog + '"\n' + okShimBody + 'exit 0\n');
    const r = run(['--apply', 'fussy@claude-plugins-official'], proj, shim);
    check('apply: provision-manual plugin → exit 0, command printed, not installed',
      r.status === 0 &&
      r.stdout.indexOf('claude plugin install fussy@claude-plugins-official --scope project') !== -1 &&
      (!fs.existsSync(argvLog) || fs.readFileSync(argvLog, 'utf-8').indexOf('plugin install fussy') === -1));
  }

  // Fix round 1 (Important): claude ON PATH but `--version` fails → readState
  // says claude:null, but applyCapabilities' noClaude check (findOnPath) says
  // present. The fold must NOT push manual rows into planned.install there, or
  // apply attempts REAL `plugin install` runs instead of the hand-write.
  {
    const proj = mkProject({});
    const argvLog = path.join(tmpdir(), 'argv.log');
    const shim = mkShim(
      'echo "$@" >> "' + argvLog + '"\n' +
      'if [ "$1" = "--version" ]; then exit 1; fi\n' + // broken, not absent
      'exit 0\n');
    const r = run(['--apply', 'superpowers@claude-plugins-official'], proj, shim);
    const argv = fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf-8') : '';
    check('apply: claude on PATH but --version fails → NO real install attempted',
      r.status === 0 && argv.indexOf('plugin install') === -1);
    check('apply: broken claude → command still printed for the user',
      r.stdout.indexOf('claude plugin install superpowers@claude-plugins-official --scope project') !== -1);
  }

  // Fix round 1 (Minor 2): on the no-claude path a provision:manual plugin is
  // report-only — command printed, but NOT hand-written into enabledPlugins
  // (the manifest author marked it hands-off).
  {
    const proj = tmpdir();
    fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.claude', 'capabilities.json'), JSON.stringify({
      marketplaces: FIXTURE.marketplaces,
      capabilities: [{ id: 'fussy@claude-plugins-official', class: 'plugin', tier: 'required', provision: 'manual', why: 'w' }],
    }));
    fs.writeFileSync(path.join(proj, '.claude', 'harness.json'), '{}');
    fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), '{}');
    const r = run(['--apply', 'fussy@claude-plugins-official'], proj, tmpdir()); // no claude anywhere
    const settings = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf-8'));
    check('apply: no claude → provision:manual plugin NOT hand-written into enabledPlugins',
      r.status === 0 && settings.enabledPlugins === undefined);
    check('apply: no claude → provision:manual plugin command still printed',
      r.stdout.indexOf('claude plugin install fussy@claude-plugins-official --scope project') !== -1);
  }

  // Unusable invocations: usage to stderr, exit 1.
  {
    const proj = mkProject({});
    const bogus = run(['--bogus'], proj, tmpdir());
    check('usage: unknown flag → exit 1 + usage on stderr', bogus.status === 1 && bogus.stderr.indexOf('Usage') !== -1);
    const none = run([], proj, tmpdir());
    check('usage: no mode → exit 1', none.status === 1 && none.stderr.indexOf('Usage') !== -1);
    const emptyApply = run(['--apply'], proj, tmpdir());
    check('usage: --apply without ids → exit 1', emptyApply.status === 1);
    const badScope = run(['--apply', 'x@y', '--scope', 'galactic'], proj, tmpdir());
    check('usage: invalid --scope value → exit 1', badScope.status === 1);
  }
}

// ── Task 8: initCapabilitiesFlow — the one required question at init ─────
// Called DIRECTLY with tmp dirs (never via init's main(), which downloads
// from GitHub). The flow is async, so these cases run inside an async IIFE
// and the summary/exit moves into its .then — still last in execution order.
(async function task8() {
  const cap = require('./capabilities.js');
  const T8_MANIFEST = {
    marketplaces: { 'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' }, trust: 'official' } },
    capabilities: [
      { id: 'superpowers@claude-plugins-official', class: 'plugin', tier: 'required', skills: ['brainstorming'], why: 'ADR-008: execution discipline inside every PIV stage' },
    ],
  };
  const mkProj8 = (opts) => {
    const proj = tmpdir();
    fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
    if (!opts || !opts.noManifest) fs.writeFileSync(path.join(proj, '.claude', 'capabilities.json'), JSON.stringify(T8_MANIFEST));
    fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), '{}');
    return proj;
  };
  const mkAsk = (answers) => {
    const fn = (prompt) => { fn.calls.push(prompt); return Promise.resolve(fn.answers.length ? fn.answers.shift() : ''); };
    fn.calls = []; fn.answers = answers.slice();
    return fn;
  };
  // Each case isolated: a throw records a FAIL for that case, not a suite abort.
  const t8 = async (name, fn) => {
    try { await fn(); } catch (e) { check('t8 ' + name + ' must not throw — got: ' + (e && e.message), false); }
  };

  // (a) codex-only target: skipped, askFn NEVER consulted.
  await t8('codex-only', async () => {
    const askFn = mkAsk([]);
    const lines = [];
    const r = await cap.initCapabilitiesFlow({ targetDir: mkProj8(), targets: ['codex'], tty: true, askFn, log: (l) => lines.push(l) });
    check('t8a: skippedReason codex-only', !!r && r.skippedReason === 'codex-only');
    check('t8a: askFn never called', askFn.calls.length === 0);
    check('t8a: the skipped line printed', lines.join('\n').indexOf('Capabilities: skipped (Codex-only target).') !== -1);
  });

  // (b) no TTY: skipped with the pointer line, askFn NEVER consulted
  // (acceptance 3: a piped init must not consume an answer line).
  await t8('no-tty', async () => {
    const askFn = mkAsk(['y']);
    const lines = [];
    const r = await cap.initCapabilitiesFlow({ targetDir: mkProj8(), targets: ['claude', 'codex'], tty: false, askFn, log: (l) => lines.push(l) });
    check('t8b: skippedReason no-tty', !!r && r.skippedReason === 'no-tty');
    check('t8b: askFn never called', askFn.calls.length === 0);
    check('t8b: pointer line names the fallbacks', lines.join('\n').indexOf('npx perfect-harness-engineering capabilities') !== -1);
  });

  // (f) missing manifest: skipped no-manifest, one log line, nothing thrown.
  await t8('no-manifest', async () => {
    const askFn = mkAsk([]);
    const lines = [];
    const r = await cap.initCapabilitiesFlow({ targetDir: mkProj8({ noManifest: true }), targets: ['claude'], tty: true, askFn, log: (l) => lines.push(l) });
    check('t8f: skippedReason no-manifest', !!r && r.skippedReason === 'no-manifest');
    check('t8f: askFn never called', askFn.calls.length === 0);
    check('t8f: exactly one log line', lines.length === 1);
  });

  if (process.platform !== 'win32') {
    // PATH/CLAUDE_CONFIG_DIR/cwd isolated per case: the flow spawns whatever
    // `claude` PATH resolves and buildProposal detects the stack from cwd.
    const withEnv = async (proj, pathDir, fn) => {
      const prevPath = process.env.PATH, prevCfg = process.env.CLAUDE_CONFIG_DIR, prevCwd = process.cwd();
      process.env.PATH = pathDir;
      process.env.CLAUDE_CONFIG_DIR = tmpdir();
      process.chdir(proj);
      try { return await fn(); } finally {
        process.env.PATH = prevPath;
        if (prevCfg === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = prevCfg;
        process.chdir(prevCwd);
      }
    };
    const mkShim8 = () => {
      const bindir = tmpdir();
      const argvLog = path.join(bindir, 'argv.log');
      fs.writeFileSync(path.join(bindir, 'claude'),
        '#!/bin/sh\n' +
        'echo "$@" >> "' + argvLog + '"\n' +
        'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
        'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ]; then echo \'[{"name":"claude-plugins-official"}]\'; exit 0; fi\n' +
        'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo "[]"; exit 0; fi\n' +
        'if [ "$1" = "plugin" ] && [ "$2" = "details" ]; then echo "cost: 12k tokens (details verbatim)"; exit 0; fi\n' +
        'if [ "$1" = "plugin" ] && [ "$2" = "install" ]; then exit 0; fi\n' +
        'exit 0\n');
      fs.chmodSync(path.join(bindir, 'claude'), 0o755);
      return { bindir, argvLog };
    };

    // (c) TTY + claude shim + 'y': install spawned at project scope, accepted
    // recorded (acceptance 1); details output lands verbatim in the log.
    await t8('yes-installs', async () => {
      const proj = mkProj8();
      const { bindir, argvLog } = mkShim8();
      const askFn = mkAsk(['y']);
      const lines = [];
      const r = await withEnv(proj, bindir, () =>
        cap.initCapabilitiesFlow({ targetDir: proj, targets: ['claude'], tty: true, askFn, log: (l) => lines.push(l) }));
      const argv = fs.readFileSync(argvLog, 'utf-8').split('\n');
      check('t8c: exactly one question, the documented prompt',
        askFn.calls.length === 1 && askFn.calls[0] === 'Install to project scope? [Y/n] ');
      check('t8c: install argv is plugin install <id> --scope project',
        argv.indexOf('plugin install superpowers@claude-plugins-official --scope project') !== -1);
      const hj = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
      check('t8c: accepted recorded in harness.json',
        !!hj.capabilities && !!hj.capabilities.accepted && hj.capabilities.accepted['superpowers@claude-plugins-official'].tier === 'required');
      check('t8c: result.installed carries the id', !!r && r.installed.indexOf('superpowers@claude-plugins-official') !== -1);
      check('t8c: prompt block shows id + why',
        lines.join('\n').indexOf('superpowers@claude-plugins-official') !== -1 && lines.join('\n').indexOf('ADR-008') !== -1);
      check('t8c: details output surfaced verbatim', lines.join('\n').indexOf('cost: 12k tokens (details verbatim)') !== -1);
    });

    // (d) 'n': nothing spawned beyond version/list/details reads; declined
    // recorded (acceptance 2).
    await t8('no-declines', async () => {
      const proj = mkProj8();
      const { bindir, argvLog } = mkShim8();
      const askFn = mkAsk(['n']);
      const r = await withEnv(proj, bindir, () =>
        cap.initCapabilitiesFlow({ targetDir: proj, targets: ['claude'], tty: true, askFn, log: () => {} }));
      const argv = fs.readFileSync(argvLog, 'utf-8');
      check('t8d: no plugin install spawned', argv.indexOf('plugin install') === -1);
      const hj = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'harness.json'), 'utf-8'));
      check('t8d: declined recorded with tier',
        !!hj.capabilities && !!hj.capabilities.declined && hj.capabilities.declined['superpowers@claude-plugins-official'].tier === 'required');
      check('t8d: result.declined carries the id', !!r && r.declined.indexOf('superpowers@claude-plugins-official') !== -1);
      check('t8d: asked exactly once', !!r && r.asked === 1);
    });

    // (e) empty PATH: planner parks required rows in `manual`; NO question,
    // enabledPlugins hand-written, command logged (acceptance 4).
    await t8('no-claude', async () => {
      const proj = mkProj8();
      const askFn = mkAsk([]);
      const lines = [];
      const r = await withEnv(proj, tmpdir(), () =>
        cap.initCapabilitiesFlow({ targetDir: proj, targets: ['claude'], tty: true, askFn, log: (l) => lines.push(l) }));
      check('t8e: askFn never called', askFn.calls.length === 0);
      const settings = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf-8'));
      check('t8e: enabledPlugins hand-written true',
        !!settings.enabledPlugins && settings.enabledPlugins['superpowers@claude-plugins-official'] === true);
      check('t8e: the exact command logged',
        lines.join('\n').indexOf('claude plugin install superpowers@claude-plugins-official --scope project') !== -1);
      check('t8e: no skippedReason, nothing installed', !!r && r.skippedReason === undefined && r.installed.length === 0);
    });

    // Fix wave (C2): an installed-but-disabled required plugin is ASKED with
    // the override NOTE line, and a 'y' answer routes to `plugin enable`,
    // never `plugin install`.
    await t8('disabled-reenables', async () => {
      const proj = mkProj8();
      const bindir = tmpdir();
      const argvLog = path.join(bindir, 'argv.log');
      fs.writeFileSync(path.join(bindir, 'claude'),
        '#!/bin/sh\n' +
        'echo "$@" >> "' + argvLog + '"\n' +
        'if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n' +
        'if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ]; then echo \'[{"name":"claude-plugins-official"}]\'; exit 0; fi\n' +
        'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo \'[{"id":"superpowers@claude-plugins-official","enabled":false,"scope":"user"}]\'; exit 0; fi\n' +
        'if [ "$1" = "plugin" ] && [ "$2" = "details" ]; then echo "details"; exit 0; fi\n' +
        'exit 0\n');
      fs.chmodSync(path.join(bindir, 'claude'), 0o755);
      const askFn = mkAsk(['y']);
      const lines = [];
      const r = await withEnv(proj, bindir, () =>
        cap.initCapabilitiesFlow({ targetDir: proj, targets: ['claude'], tty: true, askFn, log: (l) => lines.push(l) }));
      const argv = fs.readFileSync(argvLog, 'utf-8').split('\n');
      check('t8g: asked once, with the override NOTE line',
        askFn.calls.length === 1 &&
        lines.join('\n').indexOf('NOTE: you disabled this at user scope — project-scope enable overrides it.') !== -1);
      check('t8g: y routes to plugin enable at project scope',
        argv.indexOf('plugin enable superpowers@claude-plugins-official --scope project') !== -1);
      check('t8g: no plugin install spawned', argv.every(l => l.indexOf('plugin install') === -1));
      check('t8g: result.installed carries the re-enabled id', !!r && r.installed.indexOf('superpowers@claude-plugins-official') !== -1);
    });
  }
})().catch((e) => {
  failed++;
  console.log('  FAIL  task 8 suite threw: ' + (e && e.message));
}).then(() => {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
});
