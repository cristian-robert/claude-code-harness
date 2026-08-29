#!/usr/bin/env node
'use strict';

// cli/merge-settings.test.js
//
// Tests for the deep-merge of .claude/settings.local.json (Finding 5 fix).
// Exercises the in-process API and the CLI surface.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-settings-'));
const SCRIPT = path.join(__dirname, 'merge-settings.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.error('  FAIL  ' + name);
    console.error('        ' + e.message);
    failed++;
    process.exitCode = 1;
  }
}

console.log('\nmerge-settings tests\n');

const { mergeSettings } = require('./merge-settings.js');

// ─── In-process API ─────────────────────────────────────────────────────────

test('user has hook A, framework has A + B → merged has [A, B]', () => {
  const user = {
    hooks: {
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/A.sh' }] },
      ],
    },
  };
  const fw = {
    hooks: {
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/A.sh' }] },
        { matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/B.sh' }] },
      ],
    },
  };
  const out = mergeSettings(user, fw);
  // Both A and B end up under the "" matcher group as one entry with two inner hooks.
  const stop = out.hooks.Stop;
  assert.strictEqual(stop.length, 1, 'Stop must have a single matcher group');
  const cmds = stop[0].hooks.map((h) => h.command);
  assert.deepStrictEqual(cmds, ['.claude/hooks/A.sh', '.claude/hooks/B.sh'], 'A then B');
});

test('exact duplicate (matcher, command) is deduped', () => {
  const user = {
    hooks: {
      PostToolUse: [
        { matcher: 'TodoWrite', hooks: [{ type: 'command', command: '.claude/hooks/X.sh' }] },
      ],
    },
  };
  const fw = {
    hooks: {
      PostToolUse: [
        { matcher: 'TodoWrite', hooks: [{ type: 'command', command: '.claude/hooks/X.sh' }] },
      ],
    },
  };
  const out = mergeSettings(user, fw);
  const cmds = out.hooks.PostToolUse[0].hooks.map((h) => h.command);
  assert.deepStrictEqual(cmds, ['.claude/hooks/X.sh'], 'duplicate must be deduped');
});

test('same matcher, different commands → BOTH preserved', () => {
  // The user customised the framework's hook command; the framework's later
  // version added a separate hook on the same matcher. We preserve both so
  // neither side loses behaviour silently.
  const user = {
    hooks: {
      PostToolUse: [
        { matcher: 'TodoWrite', hooks: [{ type: 'command', command: '.claude/hooks/user-custom.sh' }] },
      ],
    },
  };
  const fw = {
    hooks: {
      PostToolUse: [
        { matcher: 'TodoWrite', hooks: [{ type: 'command', command: '.claude/hooks/framework-default.sh' }] },
      ],
    },
  };
  const out = mergeSettings(user, fw);
  const cmds = out.hooks.PostToolUse[0].hooks.map((h) => h.command);
  assert.deepStrictEqual(
    cmds,
    ['.claude/hooks/user-custom.sh', '.claude/hooks/framework-default.sh'],
    'same matcher with different commands → both run'
  );
});

test('node hooks with same matcher+command but different args → BOTH preserved', () => {
  // The real harness shape: every hook is command:"node" with the target script
  // in args. Deduping on (matcher, type, command) alone collapses them to one and
  // silently drops a guardrail. args MUST be part of the tuple identity.
  const user = {
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/user-lint.mjs'], timeout: 10 }] },
      ],
    },
  };
  const fw = {
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/guard.mjs'], timeout: 15 }] },
      ],
    },
  };
  const out = mergeSettings(user, fw);
  const hooks = out.hooks.PreToolUse[0].hooks;
  assert.strictEqual(hooks.length, 2, 'both node hooks must survive (distinct args)');
  assert.deepStrictEqual(
    hooks.map((h) => h.args[0]),
    ['.claude/hooks/user-lint.mjs', '.claude/hooks/guard.mjs'],
    'user hook then framework hook'
  );
});

test('node hook round-trips args + timeout (nothing dropped)', () => {
  const fw = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start.mjs'], timeout: 15, statusMessage: 'Orienting...' }] },
      ],
    },
  };
  const out = mergeSettings({}, fw);
  const h = out.hooks.SessionStart[0].hooks[0];
  assert.deepStrictEqual(h.args, ['${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start.mjs'], 'args preserved');
  assert.strictEqual(h.timeout, 15, 'timeout preserved');
  assert.strictEqual(h.statusMessage, 'Orienting...', 'other hook keys preserved');
});

test('exact duplicate node hook (same matcher+command+args) is still deduped', () => {
  const entry = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/guard.mjs'], timeout: 15 }] };
  const out = mergeSettings({ hooks: { PreToolUse: [entry] } }, { hooks: { PreToolUse: [entry] } });
  assert.strictEqual(out.hooks.PreToolUse[0].hooks.length, 1, 'identical node hook deduped');
});

test('permissions union: user has X, framework has Y → merged has [X, Y]', () => {
  const user = { permissions: { allow: ['Bash(git *)'], deny: [] } };
  const fw = { permissions: { allow: ['Bash(npm *)'], deny: ['WebFetch(https://evil.example/*)'] } };
  const out = mergeSettings(user, fw);
  assert.deepStrictEqual(out.permissions.allow.sort(), ['Bash(git *)', 'Bash(npm *)'].sort());
  assert.deepStrictEqual(out.permissions.deny, ['WebFetch(https://evil.example/*)']);
});

test('user wins on scalar conflicts', () => {
  const user = { enableAllProjectMcpServers: false, customField: 'user-value' };
  const fw = { enableAllProjectMcpServers: true, customField: 'framework-value' };
  const out = mergeSettings(user, fw);
  assert.strictEqual(out.enableAllProjectMcpServers, false, 'user scalar wins');
  assert.strictEqual(out.customField, 'user-value', 'user scalar wins on custom keys too');
});

test('different lifecycles do not interfere', () => {
  const user = {
    hooks: {
      PostToolUse: [
        { matcher: 'TodoWrite', hooks: [{ type: 'command', command: '.claude/hooks/U-post.sh' }] },
      ],
    },
  };
  const fw = {
    hooks: {
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/F-stop.sh' }] },
      ],
    },
  };
  const out = mergeSettings(user, fw);
  assert.strictEqual(out.hooks.PostToolUse[0].hooks[0].command, '.claude/hooks/U-post.sh');
  assert.strictEqual(out.hooks.Stop[0].hooks[0].command, '.claude/hooks/F-stop.sh');
});

test('empty user file merges into the framework default', () => {
  const out = mergeSettings({}, {
    hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'fw.sh' }] }] },
    permissions: { allow: ['Bash(ls *)'], deny: [] },
  });
  assert.strictEqual(out.hooks.Stop[0].hooks[0].command, 'fw.sh');
  assert.deepStrictEqual(out.permissions.allow, ['Bash(ls *)']);
});

// ─── CLI surface ────────────────────────────────────────────────────────────

test('--dry-run prints merged JSON without writing user file', () => {
  const userPath = path.join(TMP, 'user.json');
  const fwPath = path.join(TMP, 'framework.json');
  fs.writeFileSync(userPath, JSON.stringify({
    permissions: { allow: ['Bash(git *)'], deny: [] },
  }));
  fs.writeFileSync(fwPath, JSON.stringify({
    permissions: { allow: ['Bash(npm *)'], deny: [] },
    hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'compact.sh' }] }] },
  }));

  const before = fs.readFileSync(userPath, 'utf-8');
  const out = execFileSync('node', [SCRIPT, '--dry-run', '--user', userPath, '--framework', fwPath], {
    encoding: 'utf-8',
  });
  const merged = JSON.parse(out);
  assert.deepStrictEqual(merged.permissions.allow.sort(), ['Bash(git *)', 'Bash(npm *)'].sort());
  assert.strictEqual(merged.hooks.Stop[0].hooks[0].command, 'compact.sh');
  assert.strictEqual(fs.readFileSync(userPath, 'utf-8'), before, '--dry-run must not modify user file');
});

test('--apply writes merged result atomically', () => {
  const userPath = path.join(TMP, 'apply-user.json');
  const fwPath = path.join(TMP, 'apply-framework.json');
  fs.writeFileSync(userPath, JSON.stringify({
    permissions: { allow: ['Bash(git *)'], deny: [] },
  }));
  fs.writeFileSync(fwPath, JSON.stringify({
    hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'compact.sh' }] }] },
  }));

  execFileSync('node', [SCRIPT, '--apply', '--user', userPath, '--framework', fwPath], {
    encoding: 'utf-8',
  });

  const merged = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
  assert.deepStrictEqual(merged.permissions.allow, ['Bash(git *)']);
  assert.strictEqual(merged.hooks.Stop[0].hooks[0].command, 'compact.sh');
  // No tmp file lingering after atomic rename
  assert.ok(!fs.existsSync(userPath + '.tmp'), 'tmp file must not linger after --apply');
});

test('--help prints usage', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf-8' });
  assert.ok(out.includes('Usage:'), 'help must include Usage:');
  assert.ok(out.includes('--dry-run'), 'help must mention --dry-run');
  assert.ok(out.includes('--apply'), 'help must mention --apply');
});

test('missing args exits non-zero', () => {
  let status = 0;
  try {
    execFileSync('node', [SCRIPT, '--dry-run'], { stdio: 'pipe' });
  } catch (e) {
    status = e.status;
  }
  assert.notStrictEqual(status, 0, 'missing --user/--framework must exit non-zero');
});

test('cli/index.js merge-settings subcommand forwards to script', () => {
  const indexJs = path.join(__dirname, 'index.js');
  const userPath = path.join(TMP, 'idx-user.json');
  const fwPath = path.join(TMP, 'idx-framework.json');
  fs.writeFileSync(userPath, '{}');
  fs.writeFileSync(fwPath, JSON.stringify({
    permissions: { allow: ['Bash(test *)'], deny: [] },
  }));

  const out = execFileSync(
    'node',
    [indexJs, 'merge-settings', '--dry-run', '--user', userPath, '--framework', fwPath],
    { encoding: 'utf-8' }
  );
  const merged = JSON.parse(out);
  assert.deepStrictEqual(merged.permissions.allow, ['Bash(test *)']);
});

// ─── reconcileSettingsJson (init/update post-step) ───────────────────────────

const { reconcileSettingsJson } = require('./merge-settings.js');

function seedProject(name, live, backup) {
  const root = path.join(TMP, name);
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  const livePath = path.join(root, '.claude', 'settings.json');
  fs.writeFileSync(livePath, JSON.stringify(live, null, 2));
  if (backup !== undefined) {
    fs.writeFileSync(livePath + '.backup', JSON.stringify(backup, null, 2));
  }
  return { root, livePath };
}

const MARKER = '.settings-user-origin';

test('adoption (userBackupJustCreated) unions the user backup with the framework and records the marker', () => {
  // live = freshly-installed PHE settings; backup = user's original team settings.
  const framework = {
    permissions: { deny: ['Read(./.env)'] },
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/guard.mjs'], timeout: 15 }] },
      ],
    },
  };
  const userBackup = {
    permissions: { allow: ['Bash(docker *)'], deny: [] },
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/my-lint.mjs'], timeout: 10 }] },
      ],
    },
  };
  const { root, livePath } = seedProject('recon-union', framework, userBackup);
  const res = reconcileSettingsJson(root, { userBackupJustCreated: true });
  assert.strictEqual(res.merged, true, 'should report a merge happened');
  const merged = JSON.parse(fs.readFileSync(livePath, 'utf-8'));
  const scripts = merged.hooks.PreToolUse[0].hooks.map((h) => h.args[0]);
  assert.deepStrictEqual(scripts, ['.claude/hooks/my-lint.mjs', '.claude/hooks/guard.mjs'], 'user hook AND framework guard both survive');
  assert.ok(merged.permissions.allow.includes('Bash(docker *)'), 'user allow preserved');
  assert.ok(merged.permissions.deny.includes('Read(./.env)'), 'framework deny preserved');
  assert.ok(fs.existsSync(livePath + '.backup'), 'backup retained as audit trail');
  assert.ok(fs.existsSync(path.join(root, '.claude', MARKER)), 'user-origin marker written for future updates');
});

test('reconcileSettingsJson no-ops on a fresh install (no .backup, no marker)', () => {
  const framework = { permissions: { deny: ['Read(./.env)'] }, hooks: {} };
  const { root, livePath } = seedProject('recon-fresh', framework /* no backup */);
  const before = fs.readFileSync(livePath, 'utf-8');
  const res = reconcileSettingsJson(root, { userBackupJustCreated: true });
  assert.strictEqual(res.merged, false, 'no backup → nothing to merge');
  assert.strictEqual(fs.readFileSync(livePath, 'utf-8'), before, 'live settings untouched');
  assert.ok(!fs.existsSync(path.join(root, '.claude', MARKER)), 'no marker written when nothing merged');
});

test('reconcileSettingsJson does NOT merge a PHE-origin backup (fresh-init→update lineage: no adoption flag, no marker)', () => {
  // The dangerous case: a fresh install had no user settings, so the FIRST update
  // backs up PHE's OWN v1 file. Merging that into a v1.5 that intentionally
  // REMOVED an allow/hook would resurrect them (a security ratchet reversal).
  const pheV1 = { permissions: { allow: ['Bash(curl -s https://api.internal/*)'], deny: [] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/old-H1.mjs'] }] }] } };
  const pheV15 = { permissions: { deny: [] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/guard.mjs'] }] }] } };
  const { root, livePath } = seedProject('recon-ratchet', pheV15, pheV1);
  const before = fs.readFileSync(livePath, 'utf-8');
  const res = reconcileSettingsJson(root, {}); // update lineage: no userBackupJustCreated, no marker
  assert.strictEqual(res.merged, false, 'must not merge a PHE-origin backup');
  assert.strictEqual(fs.readFileSync(livePath, 'utf-8'), before, 'framework removals preserved — no resurrection');
});

test('after adoption, an update applies framework removals (marker path, no ratchet reversal)', () => {
  const fwV1 = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/guard.mjs'] }, { type: 'command', command: 'node', args: ['.claude/hooks/v1-only.mjs'] }] }] } };
  const userBackup = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/my-lint.mjs'] }] }] } };
  const { root, livePath } = seedProject('recon-update', fwV1, userBackup);
  // Adoption at init:
  reconcileSettingsJson(root, { userBackupJustCreated: true });
  // Update: framework v1.5 dropped v1-only.mjs; backupAndCopy overwrites live, backup (user original) untouched.
  const fwV15 = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/guard.mjs'] }] }] } };
  fs.writeFileSync(livePath, JSON.stringify(fwV15, null, 2));
  const res = reconcileSettingsJson(root, {}); // update relies on the marker
  assert.strictEqual(res.merged, true, 'marker → merge on update');
  const scripts = JSON.parse(fs.readFileSync(livePath, 'utf-8')).hooks.PreToolUse[0].hooks.map((h) => h.args[0]).sort();
  assert.deepStrictEqual(scripts, ['.claude/hooks/guard.mjs', '.claude/hooks/my-lint.mjs'], 'user hook kept; framework-removed v1-only.mjs NOT resurrected');
});

test('reconcileSettingsJson fails safe on a malformed backup (leaves framework settings intact)', () => {
  const framework = { hooks: {}, permissions: { deny: ['Read(./.env)'] } };
  const { root, livePath } = seedProject('recon-bad', framework);
  fs.writeFileSync(livePath + '.backup', '{ this is not json');
  const before = fs.readFileSync(livePath, 'utf-8');
  const res = reconcileSettingsJson(root, { userBackupJustCreated: true });
  assert.strictEqual(res.merged, false, 'malformed backup → no merge');
  assert.ok(res.error, 'error surfaced');
  assert.strictEqual(fs.readFileSync(livePath, 'utf-8'), before, 'framework settings left intact');
});

// ─── capturePluginKeys / restorePluginKeys (plugin keys survive the copy path) ──
//
// backupAndCopy preserves only the FIRST backup ever taken, so enabledPlugins /
// extraKnownMarketplaces — keys Claude Code itself writes via
// `claude plugin install --scope project` — are clobbered by the template on
// re-init/update and never re-unioned by reconcileSettingsJson (which only fires
// off a genuine pre-PHE backup). capturePluginKeys/restorePluginKeys bracket the
// copy directly instead.

const { capturePluginKeys, restorePluginKeys } = require('./merge-settings.js');

test('capturePluginKeys/restorePluginKeys: plugin keys survive the template overwriting settings.json', () => {
  const { root, livePath } = seedProject('plugin-keys', {
    permissions: {},
    enabledPlugins: { 'superpowers@claude-plugins-official': true, 'x@m': false },
    extraKnownMarketplaces: { 'openai-codex': { source: { source: 'github', repo: 'openai/codex-plugin-cc' } } },
  });

  const captured = capturePluginKeys(root);
  assert.ok(captured && captured.enabledPlugins && captured.extraKnownMarketplaces, 'capture picks up both keys');

  // Simulate the template copy clobbering the file (backupAndCopy overwrites settings.json).
  fs.writeFileSync(livePath, JSON.stringify({ permissions: {}, hooks: {} }));

  const res = restorePluginKeys(root, captured);
  assert.strictEqual(res.restored, true, 'restore reports restored');

  const after = JSON.parse(fs.readFileSync(livePath, 'utf-8'));
  assert.strictEqual(after.enabledPlugins['superpowers@claude-plugins-official'], true, 'enabledPlugins restored');
  assert.strictEqual(after.enabledPlugins['x@m'], false, 'user false preserved');
  assert.ok(after.extraKnownMarketplaces['openai-codex'], 'marketplaces restored');
  assert.ok(after.permissions && after.hooks, 'other keys intact');
});

test('capturePluginKeys returns null when settings.json is missing', () => {
  assert.strictEqual(capturePluginKeys(path.join(TMP, 'plugin-keys-missing')), null, 'capture on missing file is null');
});

test('restorePluginKeys is a no-op when captured is null', () => {
  const { root } = seedProject('plugin-keys-noop', { permissions: {} });
  assert.strictEqual(restorePluginKeys(root, null).restored, false, 'restore with null is a no-op');
});

// Valid JSON that is not an object must degrade to {restored:false, error}, never
// throw and never report success while silently dropping the keys — Task 6's
// no-claude apply path calls restorePluginKeys on arbitrary projects and its
// contract is "never throws" (plan Task 6 Interfaces).
test('restorePluginKeys fails soft when settings.json is JSON null', () => {
  const root = path.join(TMP, 'plugin-keys-null');
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), 'null');
  const res = restorePluginKeys(root, { enabledPlugins: { 'a@m': true } });
  assert.strictEqual(res.restored, false, 'null settings → restored:false');
  assert.ok(res.error, 'carries an error message');
});

test('restorePluginKeys fails soft when settings.json is a JSON array (no silent key drop)', () => {
  const root = path.join(TMP, 'plugin-keys-array');
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  const live = path.join(root, '.claude', 'settings.json');
  fs.writeFileSync(live, '[1, 2]');
  const res = restorePluginKeys(root, { enabledPlugins: { 'a@m': true } });
  assert.strictEqual(res.restored, false, 'array settings → restored:false, not a lying restored:true');
  assert.ok(res.error, 'carries an error message');
  assert.strictEqual(fs.readFileSync(live, 'utf-8'), '[1, 2]', 'file left untouched');
});

// ─── Blocker 2: the silent decline gets loud ────────────────────────────────
// A fresh-project adopter has no .settings-user-origin marker (init writes it
// only when it backed up a PRE-existing settings.json). Their post-adoption
// hooks and permissions are therefore clobbered by every update while
// reconcileSettingsJson returned a bare {merged:false} and both callers printed
// nothing (review F2). The decline now carries a reason, and both callers say so.

test('decline with a backup present carries reason "not-user-origin"', () => {
  const phe = { permissions: { deny: [] }, hooks: {} };
  const userEdited = { permissions: { allow: ['Bash(pnpm test:*)'] }, hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'node', args: ['./scripts/team-notify.mjs'] }] }] } };
  const { root } = seedProject('recon-reason', phe, userEdited);
  const res = reconcileSettingsJson(root, {});
  assert.strictEqual(res.merged, false);
  assert.strictEqual(res.reason, 'not-user-origin', 'the caller needs a reason to warn on');
});

test('a decline with NO backup carries no reason (nothing was dropped)', () => {
  const { root } = seedProject('recon-reason-none', { hooks: {} } /* no backup */);
  const res = reconcileSettingsJson(root, {});
  assert.strictEqual(res.merged, false);
  assert.strictEqual(res.reason, undefined, 'no backup → no user content to warn about');
});

test('a successful merge carries no reason', () => {
  const { root } = seedProject('recon-reason-merged', { hooks: {} }, { hooks: {} });
  const res = reconcileSettingsJson(root, { userBackupJustCreated: true });
  assert.strictEqual(res.merged, true);
  assert.strictEqual(res.reason, undefined);
});

test('settingsNotMergedWarning states what was lost, where it survives, and how to fix it', () => {
  const { settingsNotMergedWarning } = require('./merge-settings.js');
  assert.strictEqual(typeof settingsNotMergedWarning, 'function', 'both callers must share one warning text');
  const text = settingsNotMergedWarning().join('\n');
  assert.ok(/replaced|overwritt?en/i.test(text), 'says the live settings.json was replaced by the template');
  assert.ok(/not .*re-?merged|NOT/.test(text), 'says hand-added hooks/permissions are NOT re-merged');
  assert.ok(text.includes('.claude/settings.json.backup'), 'names the backup that still holds them');
  assert.ok(text.includes('.backup-'), 'mentions the newest rotation backup');
  assert.ok(text.includes('npx perfect-harness-engineering merge-settings'), 'gives the re-merge command');
  assert.ok(text.includes('/harness-init'), 'says harness-init step 0 does not cover settings');
});

// Cleanup
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch (_) {}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
