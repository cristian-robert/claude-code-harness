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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
