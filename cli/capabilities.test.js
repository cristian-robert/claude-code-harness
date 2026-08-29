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
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
