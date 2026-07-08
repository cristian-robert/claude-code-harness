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

// Cleanup
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch (_) {}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
