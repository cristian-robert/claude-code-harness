# Codex Dual-Emit Core (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npx perfect-harness-engineering init` ask which harness the project uses (Claude Code, Codex, or both) and emit a working payload for each — ending with a guidance-only Codex harness (instructions + pipeline skills + subagents), with no content duplicated in the source tree.

**Architecture:** `template/` stays the single source of truth. `template/AGENTS.md` becomes the canonical instruction file and `template/CLAUDE.md` shrinks to an `@AGENTS.md` import shim. Two new pure-function CLI modules — `cli/harness-targets.js` (which harness, persisted in `.claude/harness.json`) and `cli/emit-codex.js` (derives `.agents/skills/`, `.codex/agents/*.toml`, `.codex/config.toml` from the canonical `.claude/` payload) — are called by `init.js` and `update.js`. The eight pipeline skills drop their `$ARGUMENTS` interpolation, which Codex does not support, in favour of prose that works on both.

**Tech Stack:** Node ≥18, CommonJS (`cli/*.js`, matching the existing code), zero runtime dependencies. Tests are plain Node scripts with a hand-rolled `assert` counter, matching `cli/init-backup.test.js`. TOML is emitted by hand (no library — PHE ships no runtime deps).

**Spec:** `docs/design/2026-07-11-codex-harness-port.md` (Phase 1).

## Global Constraints

- **Node ≥18**, CommonJS `require`/`module.exports` in `cli/`. `var`-style, ES5-ish syntax to match surrounding code. No new npm dependencies — ever.
- **No runtime deps for TOML.** Emit TOML as strings.
- **Budgets (enforced by `node tools/context-ledger.mjs template`):** root instruction file ≤60 lines (hard 80); rules ≤45 lines (hard 60); skill bodies ≤100 lines (hard 120); total always-loaded <2000 est. tokens. Current: 1479/2000.
- **`.agents/skills/` and `.codex/` are GENERATED.** Canonical content lives in `.claude/`. Generated trees are overwritten on every `init`/`update` — never hand-edited.
- **No model names anywhere in this phase.** Model/tier mapping is Phase 3. Emitted agent TOML deliberately omits `model`.
- **No hooks in this phase.** Phase 1 is guidance-only on Codex. `.codex/hooks.json` arrives in Phase 2.
- **Existing behaviour must not regress:** every existing file is still backed up as `<file>.backup` before being overwritten; `settings.json` deep-merge still runs; `npm test` stays green.
- Tests are registered in `package.json` `scripts.test` (append with `&&`).

## File Structure

| File | Responsibility |
|---|---|
| `cli/harness-targets.js` | **Create.** Parse the harness answer; read/write `harness` in `.claude/harness.json`. Pure + fs, no prompting. |
| `cli/harness-targets.test.js` | **Create.** Tests for the above. |
| `cli/emit-codex.js` | **Create.** `agentMdToToml()` (pure) and `emitCodexPayload()` (fs). Derives the Codex tree from the canonical `.claude/` tree. |
| `cli/emit-codex.test.js` | **Create.** Tests for the above. |
| `template/AGENTS.md` | **Create** (from today's `template/CLAUDE.md`, content unchanged). Canonical instructions. |
| `template/CLAUDE.md` | **Rewrite** as an `@AGENTS.md` shim + Claude-only notes. |
| `template/examples/{frontend,backend}.AGENTS.md` | **Rename** from `*.CLAUDE.md`. |
| `template/.claude/skills/{plan,implement,validate,review,accept,backlog,sprint,handoff}/SKILL.md` | **Modify.** Remove `$ARGUMENTS`. |
| `template/.claude/skills/harness-init/SKILL.md` | **Modify.** Fill `AGENTS.md`, not `CLAUDE.md`. |
| `cli/init.js` | **Modify.** Ask the harness question; copy `AGENTS.md`; conditionally copy the `CLAUDE.md` shim; call the emitter. |
| `cli/update.js` | **Modify.** Read targets from `harness.json` (non-interactive); same copy + emit. |
| `tools/context-ledger.mjs:54` | **Modify.** Measure `AGENTS.md` too, or the canonical file goes unmeasured. |
| `package.json` | **Modify.** Register the two new test files. |
| `README.md` | **Modify.** Document the harness question and the generated trees. |

---

### Task 1: `cli/harness-targets.js` — which harness, persisted

**Files:**
- Create: `cli/harness-targets.js`
- Test: `cli/harness-targets.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `parseHarnessAnswer(input: string) -> string[] | null` — returns `['claude']`, `['codex']`, `['claude','codex']`, or `null` when unparseable. Always sorted alphabetically (`codex` before `claude`? No — **alphabetical: `['claude','codex']`**).
  - `readHarnessTargets(projectRoot: string) -> string[] | null` — reads `.claude/harness.json` → `harness` key; `null` if the file or key is absent/invalid.
  - `writeHarnessTargets(projectRoot: string, targets: string[]) -> void` — writes the `harness` key into `.claude/harness.json`, **preserving every other key**.
  - `HARNESS_PROMPT: string` — the exact question text `init.js` prints.

- [ ] **Step 1: Write the failing test**

Create `cli/harness-targets.test.js`:

```js
// cli/harness-targets.test.js
//
// Tests harness-target parsing and persistence in .claude/harness.json.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  parseHarnessAnswer,
  readHarnessTargets,
  writeHarnessTargets,
} = require('./harness-targets');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const TEST_DIR = path.join(os.tmpdir(), 'harness-targets-test-' + crypto.randomUUID());

console.log('parseHarnessAnswer:');
assert('"1" -> claude', JSON.stringify(parseHarnessAnswer('1')) === '["claude"]');
assert('"2" -> codex', JSON.stringify(parseHarnessAnswer('2')) === '["codex"]');
assert('"3" -> both', JSON.stringify(parseHarnessAnswer('3')) === '["claude","codex"]');
assert('"claude" -> claude', JSON.stringify(parseHarnessAnswer('claude')) === '["claude"]');
assert('"Codex" (case-insensitive) -> codex', JSON.stringify(parseHarnessAnswer('Codex')) === '["codex"]');
assert('"both" -> both', JSON.stringify(parseHarnessAnswer('both')) === '["claude","codex"]');
assert('"  both  " (whitespace) -> both', JSON.stringify(parseHarnessAnswer('  both  ')) === '["claude","codex"]');
assert('empty -> null', parseHarnessAnswer('') === null);
assert('garbage -> null', parseHarnessAnswer('emacs') === null);
assert('always sorted', JSON.stringify(parseHarnessAnswer('both')) === '["claude","codex"]');

console.log('readHarnessTargets:');
fs.mkdirSync(path.join(TEST_DIR, 'proj', '.claude'), { recursive: true });
var PROJ = path.join(TEST_DIR, 'proj');
assert('missing harness.json -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ stopGate: [] }));
assert('harness.json without harness key -> null', readHarnessTargets(PROJ) === null);

fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ not json');
assert('malformed harness.json -> null (no throw)', readHarnessTargets(PROJ) === null);

console.log('writeHarnessTargets:');
// Preserving other keys is the whole point — harness.json holds the stop gate.
fs.writeFileSync(
  path.join(PROJ, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: ['npm test'], workTracking: { backend: 'none' } }, null, 2)
);
writeHarnessTargets(PROJ, ['claude', 'codex']);
var after = JSON.parse(fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8'));
assert('harness key written', JSON.stringify(after.harness) === '["claude","codex"]');
assert('stopGate preserved', JSON.stringify(after.stopGate) === '["npm test"]');
assert('workTracking preserved', after.workTracking.backend === 'none');
assert('round-trips through readHarnessTargets', JSON.stringify(readHarnessTargets(PROJ)) === '["claude","codex"]');

// Writing when harness.json does not exist yet must create it, not crash.
var FRESH = path.join(TEST_DIR, 'fresh');
fs.mkdirSync(path.join(FRESH, '.claude'), { recursive: true });
writeHarnessTargets(FRESH, ['codex']);
assert('creates harness.json when absent', JSON.stringify(readHarnessTargets(FRESH)) === '["codex"]');

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node cli/harness-targets.test.js`
Expected: FAIL — `Cannot find module './harness-targets'`

- [ ] **Step 3: Write the implementation**

Create `cli/harness-targets.js`:

```js
'use strict';

// Which harness(es) this project is installed for. Persisted in
// .claude/harness.json so `update` re-emits the same payload non-interactively.
//
// Targets are always stored sorted, so ['codex','claude'] and ['claude','codex']
// are the same value on disk and comparisons stay trivial.

const fs = require('fs');
const path = require('path');

const HARNESS_PROMPT =
  'Which harness will you use in this project?\n' +
  '  1) Claude Code\n' +
  '  2) Codex (CLI / IDE extension)\n' +
  '  3) Both\n' +
  'Choose 1/2/3 (or claude/codex/both): ';

function parseHarnessAnswer(input) {
  if (typeof input !== 'string') return null;
  var a = input.trim().toLowerCase();
  if (a === '1' || a === 'claude' || a === 'claude code') return ['claude'];
  if (a === '2' || a === 'codex') return ['codex'];
  if (a === '3' || a === 'both') return ['claude', 'codex'];
  return null;
}

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

function readHarnessTargets(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    // A malformed harness.json must not crash init/update — the caller falls
    // back to asking (init) or to claude-only (update).
    return null;
  }
  if (!parsed || !Array.isArray(parsed.harness) || parsed.harness.length === 0) return null;
  return parsed.harness.slice().sort();
}

// Merge the harness key into harness.json, preserving every other key —
// harness.json also holds the stop gate and work-tracking config.
function writeHarnessTargets(projectRoot, targets) {
  var p = harnessJsonPath(projectRoot);
  var current = {};
  if (fs.existsSync(p)) {
    try {
      current = JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
    } catch (e) {
      current = {};
    }
  }
  current.harness = targets.slice().sort();
  var dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(current, null, 2) + '\n');
}

module.exports = {
  HARNESS_PROMPT: HARNESS_PROMPT,
  parseHarnessAnswer: parseHarnessAnswer,
  readHarnessTargets: readHarnessTargets,
  writeHarnessTargets: writeHarnessTargets,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node cli/harness-targets.test.js`
Expected: `18 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add cli/harness-targets.js cli/harness-targets.test.js
git commit -m "feat(cli): harness target parsing + persistence in harness.json"
```

---

### Task 2: `agentMdToToml()` — Claude subagent Markdown → Codex subagent TOML

**Files:**
- Create: `cli/emit-codex.js` (this task adds `agentMdToToml` only; Task 3 adds `emitCodexPayload` to the same file)
- Test: `cli/emit-codex.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `agentMdToToml(mdText: string, fallbackName: string) -> string` — converts a `.claude/agents/<n>.md` (YAML frontmatter + Markdown body) into a Codex `.codex/agents/<n>.toml`. Emits `name`, `description`, `developer_instructions`. **Deliberately omits `model`** — model/tier mapping is Phase 3. Throws `Error` if the body cannot be represented (see Step 3).

**Why hand-rolled TOML:** PHE ships zero runtime dependencies (`package.json` has no `dependencies` key). Adding one for this would violate that; the emitted surface is three keys.

- [ ] **Step 1: Write the failing test**

Create `cli/emit-codex.test.js`:

```js
// cli/emit-codex.test.js
//
// Tests the Claude -> Codex payload emitter: agent MD->TOML conversion and the
// full emitCodexPayload() tree write.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { agentMdToToml } = require('./emit-codex');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

console.log('agentMdToToml:');

var SCOUT_MD = [
  '---',
  'name: scout',
  'description: "Read-only codebase scout: answers \'how does X work\' questions."',
  'tools: Read, Grep, Glob, Bash',
  'model: sonnet',
  'maxTurns: 25',
  '---',
  '',
  '# Scout',
  '',
  'Return a compact brief. Never edit files.',
  ''
].join('\n');

var toml = agentMdToToml(SCOUT_MD, 'scout');

assert('emits name', /^name = "scout"$/m.test(toml));
assert('emits description', toml.indexOf('description = "Read-only codebase scout') !== -1);
assert('strips YAML quotes from description', toml.indexOf('description = "\\"') === -1);
assert('emits developer_instructions', /^developer_instructions = '''$/m.test(toml));
assert('body carried into developer_instructions', toml.indexOf('Return a compact brief. Never edit files.') !== -1);
assert('frontmatter is NOT carried into the body', toml.indexOf('maxTurns') === -1);
assert('model is OMITTED (Phase 3 owns model mapping)', /^model\s*=/m.test(toml) === false);
assert('tools is OMITTED (Codex has no tools key on agents)', /^tools\s*=/m.test(toml) === false);
assert('carries a generated-file warning', toml.indexOf('Generated by perfect-harness-engineering') !== -1);

// Name falls back to the filename stem when frontmatter omits it.
var NO_NAME_MD = ['---', 'description: "x"', '---', '', 'body', ''].join('\n');
assert('name falls back to the given filename stem', /^name = "fallback-name"$/m.test(agentMdToToml(NO_NAME_MD, 'fallback-name')));

// A description containing a double quote must not break the TOML basic string.
var QUOTED_MD = ['---', 'name: q', 'description: "He said \\"hi\\" loudly"', '---', '', 'body', ''].join('\n');
var qToml = agentMdToToml(QUOTED_MD, 'q');
assert('escapes double quotes in description', qToml.indexOf('\\"hi\\"') !== -1);

// CRLF input must not corrupt the output.
var CRLF_MD = SCOUT_MD.split('\n').join('\r\n');
assert('handles CRLF input', agentMdToToml(CRLF_MD, 'scout').indexOf('Never edit files.') !== -1);

// A body containing ''' cannot use a TOML literal string — must fall back to a
// basic multi-line string rather than emit corrupt TOML.
var TRIPLE_MD = ['---', 'name: t', 'description: "d"', '---', '', "x = '''", 'body', ''].join('\n');
var tToml = agentMdToToml(TRIPLE_MD, 't');
assert("body with ''' falls back to a basic multiline string", tToml.indexOf('developer_instructions = """') !== -1);
assert("body with ''' still contains the body text", tToml.indexOf('body') !== -1);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node cli/emit-codex.test.js`
Expected: FAIL — `Cannot find module './emit-codex'`

- [ ] **Step 3: Write the implementation**

Create `cli/emit-codex.js`:

```js
'use strict';

// Emits the Codex payload from PHE's canonical .claude/ tree.
//
// Canonical content lives ONCE, under .claude/. Codex reads different paths, so
// we DERIVE its tree:
//   .claude/skills/<n>/  -> .agents/skills/<n>/     (Codex's skill root)
//   .claude/agents/<n>.md -> .codex/agents/<n>.toml (Codex agents are TOML)
//                          -> .codex/config.toml
// Everything under .agents/ and .codex/ is GENERATED and overwritten on every
// init/update. Edit .claude/, never the generated trees.
//
// No hooks here — Phase 1 is guidance-only on Codex. Hooks land in Phase 2.
// No model keys here — model/tier mapping lands in Phase 3.

const fs = require('fs');
const path = require('path');

const GENERATED_BY = 'Generated by perfect-harness-engineering — do not hand-edit.';

// Split "---\nkey: value\n---\nbody" into { fm: {...}, body: "..." }.
// Deliberately a flat scalar parser: agent frontmatter is flat key/value only.
function parseFrontmatter(text) {
  var t = String(text).replace(/\r\n/g, '\n');
  if (t.indexOf('---\n') !== 0) return { fm: {}, body: t };
  var end = t.indexOf('\n---', 3);
  if (end < 0) return { fm: {}, body: t };

  var fmBlock = t.slice(4, end);
  var afterMarker = t.indexOf('\n', end + 1);
  var body = afterMarker < 0 ? '' : t.slice(afterMarker + 1);

  var fm = {};
  var lines = fmBlock.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    var v = m[2].trim();
    // Strip YAML quoting, then unescape the \" YAML uses inside a "..." scalar.
    if (v.length >= 2 &&
        ((v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') ||
         (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'"))) {
      v = v.slice(1, -1).replace(/\\"/g, '"');
    }
    fm[m[1]] = v;
  }
  return { fm: fm, body: body };
}

// TOML basic string (single line): escape backslash then quote.
function tomlBasic(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// TOML multi-line string. Prefer a LITERAL string ('''...''') — it needs no
// escaping at all, so Markdown bodies survive byte-for-byte. Fall back to a
// basic string (""") only when the body itself contains ''', escaping as we go.
function tomlMultiline(body) {
  var b = String(body).replace(/\s+$/, '');
  if (b.indexOf("'''") === -1) {
    return "'''\n" + b + "\n'''";
  }
  var escaped = b.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  return '"""\n' + escaped + '\n"""';
}

// A Claude subagent (.claude/agents/<n>.md) -> a Codex subagent (.codex/agents/<n>.toml).
// Codex requires name + description + developer_instructions. It has no `tools`
// key, and `model` is intentionally left out until Phase 3 introduces the tier map.
function agentMdToToml(mdText, fallbackName) {
  var parsed = parseFrontmatter(mdText);
  var name = parsed.fm.name || fallbackName;
  var description = parsed.fm.description || '';
  var body = parsed.body;

  if (!name) throw new Error('agentMdToToml: no name in frontmatter and no fallback name given');

  return [
    '# ' + GENERATED_BY,
    '# Source: .claude/agents/' + name + '.md',
    '',
    'name = ' + tomlBasic(name),
    'description = ' + tomlBasic(description),
    'developer_instructions = ' + tomlMultiline(body),
    '',
  ].join('\n');
}

module.exports = {
  GENERATED_BY: GENERATED_BY,
  agentMdToToml: agentMdToToml,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node cli/emit-codex.test.js`
Expected: `14 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add cli/emit-codex.js cli/emit-codex.test.js
git commit -m "feat(cli): convert Claude subagent markdown to Codex agent TOML"
```

---

### Task 3: `emitCodexPayload()` — write the generated Codex tree

**Files:**
- Modify: `cli/emit-codex.js` (append)
- Modify: `cli/emit-codex.test.js` (append)

**Interfaces:**
- Consumes: `agentMdToToml()` from Task 2.
- Produces:
  - `emitCodexPayload(projectRoot: string) -> { skills: number, agents: number }` — reads the already-installed `<projectRoot>/.claude/{skills,agents}` and writes `<projectRoot>/.agents/skills/`, `<projectRoot>/.codex/agents/*.toml`, `<projectRoot>/.codex/config.toml`. Idempotent: safe to re-run; overwrites generated files without backing them up (they are derived, not user content).

**Design note — copy, not symlink.** The spec flags whole-directory symlink support in Claude Code as unverified, and Windows symlinks need Administrator/Developer Mode. Copying is deterministic and cross-platform. `.agents/skills/` is regenerated on every `init`/`update`, and a `.phe-generated` marker file states that so nobody edits it by mistake.

- [ ] **Step 1: Write the failing test (append to `cli/emit-codex.test.js`, before the final summary block)**

Insert this block immediately **before** the `console.log('\n' + passed + ...)` line:

```js
console.log('emitCodexPayload:');

const { emitCodexPayload } = require('./emit-codex');

var TEST_DIR = path.join(os.tmpdir(), 'emit-codex-test-' + crypto.randomUUID());
var PROJ = path.join(TEST_DIR, 'proj');

// A minimal installed .claude/ payload: one skill, one agent.
fs.mkdirSync(path.join(PROJ, '.claude', 'skills', 'plan'), { recursive: true });
fs.mkdirSync(path.join(PROJ, '.claude', 'skills', 'plan', 'nested'), { recursive: true });
fs.mkdirSync(path.join(PROJ, '.claude', 'agents'), { recursive: true });
fs.writeFileSync(
  path.join(PROJ, '.claude', 'skills', 'plan', 'SKILL.md'),
  '---\nname: plan\ndescription: "Plan a ticket."\n---\n\n# /plan\n\nBody.\n'
);
fs.writeFileSync(path.join(PROJ, '.claude', 'skills', 'plan', 'nested', 'ref.md'), '# nested asset\n');
fs.writeFileSync(
  path.join(PROJ, '.claude', 'agents', 'scout.md'),
  '---\nname: scout\ndescription: "Read-only scout."\nmodel: sonnet\n---\n\nScout body.\n'
);

var result = emitCodexPayload(PROJ);

assert('reports 1 skill emitted', result.skills === 1);
assert('reports 1 agent emitted', result.agents === 1);
assert('skill lands in .agents/skills/ (Codex root, NOT .codex/skills)',
  fs.existsSync(path.join(PROJ, '.agents', 'skills', 'plan', 'SKILL.md')));
assert('skill content is copied verbatim',
  fs.readFileSync(path.join(PROJ, '.agents', 'skills', 'plan', 'SKILL.md'), 'utf-8').indexOf('# /plan') !== -1);
assert('nested skill assets are copied too',
  fs.existsSync(path.join(PROJ, '.agents', 'skills', 'plan', 'nested', 'ref.md')));
assert('generated marker written', fs.existsSync(path.join(PROJ, '.agents', 'skills', '.phe-generated')));
assert('agent lands as TOML', fs.existsSync(path.join(PROJ, '.codex', 'agents', 'scout.toml')));
var scoutToml = fs.readFileSync(path.join(PROJ, '.codex', 'agents', 'scout.toml'), 'utf-8');
assert('agent TOML has name', scoutToml.indexOf('name = "scout"') !== -1);
assert('agent TOML has developer_instructions', scoutToml.indexOf('developer_instructions') !== -1);
assert('config.toml written', fs.existsSync(path.join(PROJ, '.codex', 'config.toml')));
var cfg = fs.readFileSync(path.join(PROJ, '.codex', 'config.toml'), 'utf-8');
assert('config enables multi_agent (Codex subagents are off by default)', cfg.indexOf('multi_agent = true') !== -1);
assert('config declares no model (Phase 3 owns that)', /^model\s*=/m.test(cfg) === false);
assert('config carries the generated warning', cfg.indexOf('Generated by perfect-harness-engineering') !== -1);

// Idempotence: a second run must not duplicate or throw.
var result2 = emitCodexPayload(PROJ);
assert('re-emit is idempotent (same counts)', result2.skills === 1 && result2.agents === 1);
assert('re-emit does not create .backup files in generated trees',
  !fs.existsSync(path.join(PROJ, '.agents', 'skills', 'plan', 'SKILL.md.backup')));

// A stale generated skill (removed from .claude/) must not linger in .agents/.
fs.mkdirSync(path.join(PROJ, '.agents', 'skills', 'ghost'), { recursive: true });
fs.writeFileSync(path.join(PROJ, '.agents', 'skills', 'ghost', 'SKILL.md'), '# ghost\n');
emitCodexPayload(PROJ);
assert('stale generated skill is pruned', !fs.existsSync(path.join(PROJ, '.agents', 'skills', 'ghost')));

// A project with no .claude/agents/ must not crash.
var EMPTY = path.join(TEST_DIR, 'empty');
fs.mkdirSync(path.join(EMPTY, '.claude', 'skills'), { recursive: true });
var emptyResult = emitCodexPayload(EMPTY);
assert('missing .claude/agents/ does not throw', emptyResult.agents === 0);

// Implicit invocation: a skill marked `disable-model-invocation: true` on the
// Claude side must get Codex's equivalent, or Codex will auto-fire /implement.
console.log('implicit-invocation parity:');
fs.mkdirSync(path.join(PROJ, '.claude', 'skills', 'auto'), { recursive: true });
fs.writeFileSync(
  path.join(PROJ, '.claude', 'skills', 'auto', 'SKILL.md'),
  '---\nname: auto\ndescription: "Auto-invocable knowledge skill."\n---\n\nBody.\n'
);
emitCodexPayload(PROJ);
var planYaml = path.join(PROJ, '.agents', 'skills', 'plan', 'agents', 'openai.yaml');
assert('openai.yaml NOT written for plan (plan has no disable-model-invocation)', !fs.existsSync(planYaml));

// Now mark `plan` as user-invoke-only, as the real pipeline skills are.
fs.writeFileSync(
  path.join(PROJ, '.claude', 'skills', 'plan', 'SKILL.md'),
  '---\nname: plan\ndescription: "Plan a ticket."\ndisable-model-invocation: true\n---\n\n# /plan\n\nBody.\n'
);
emitCodexPayload(PROJ);
assert('openai.yaml written for a disable-model-invocation skill', fs.existsSync(planYaml));
assert('openai.yaml forbids implicit invocation',
  fs.readFileSync(planYaml, 'utf-8').indexOf('allow_implicit_invocation: false') !== -1);
assert('auto-invocable skill still gets no openai.yaml',
  !fs.existsSync(path.join(PROJ, '.agents', 'skills', 'auto', 'agents', 'openai.yaml')));

fs.rmSync(TEST_DIR, { recursive: true, force: true });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node cli/emit-codex.test.js`
Expected: FAIL — `emitCodexPayload is not a function`

- [ ] **Step 3: Write the implementation (append to `cli/emit-codex.js`)**

Replace the `module.exports` block at the bottom of `cli/emit-codex.js` with:

```js
const CODEX_CONFIG_TOML = [
  '# ' + GENERATED_BY,
  '# Source: perfect-harness-engineering template. Re-run `npx perfect-harness-engineering update`.',
  '',
  '# Codex subagents are OFF by default; PHE ships four (see .codex/agents/).',
  '[features]',
  'multi_agent = true',
  '',
  '[agents]',
  'max_threads = 4',
  '',
].join('\n');

const GENERATED_MARKER = [
  '# ' + GENERATED_BY,
  '#',
  '# This directory is DERIVED from .claude/skills/ on every',
  '# `perfect-harness-engineering init` / `update`. Edits here are LOST.',
  '# Edit .claude/skills/<name>/SKILL.md instead — it is the single source and',
  '# it serves both harnesses (Claude Code reads .claude/skills, Codex reads here).',
  '',
].join('\n');

function copyTree(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    // Parity with init.js: never follow symlinks out of the payload.
    if (entry.isSymbolicLink()) continue;
    var s = path.join(src, entry.name);
    var d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function dirNames(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true })
    .filter(function (e) { return e.isDirectory(); })
    .map(function (e) { return e.name; });
}

// Derive the Codex tree from the installed .claude/ payload.
// Generated files are overwritten, never backed up — they are not user content.
function emitCodexPayload(projectRoot) {
  var claudeSkills = path.join(projectRoot, '.claude', 'skills');
  var claudeAgents = path.join(projectRoot, '.claude', 'agents');
  var agentsSkills = path.join(projectRoot, '.agents', 'skills');
  var codexAgents = path.join(projectRoot, '.codex', 'agents');
  var counts = { skills: 0, agents: 0 };

  // --- skills: .claude/skills/<n>/ -> .agents/skills/<n>/ ---
  fs.mkdirSync(agentsSkills, { recursive: true });
  var wanted = dirNames(claudeSkills);

  // Prune skills we previously generated but no longer ship, so a removed skill
  // does not keep firing on Codex after an update.
  var existing = dirNames(agentsSkills);
  for (var p = 0; p < existing.length; p++) {
    if (wanted.indexOf(existing[p]) === -1) {
      fs.rmSync(path.join(agentsSkills, existing[p]), { recursive: true, force: true });
    }
  }

  for (var s = 0; s < wanted.length; s++) {
    var skillDest = path.join(agentsSkills, wanted[s]);
    copyTree(path.join(claudeSkills, wanted[s]), skillDest);
    counts.skills++;

    // Implicit-invocation parity. Claude Code keeps a skill user-invoke-only with
    // `disable-model-invocation: true`; Codex's equivalent is an openai.yaml
    // policy alongside SKILL.md. Without it Codex would happily auto-fire
    // /implement off a description match — a pipeline stage must never self-start.
    var skillMd = null;
    try {
      skillMd = fs.readFileSync(path.join(skillDest, 'SKILL.md'), 'utf-8');
    } catch (e) {
      skillMd = null;
    }
    var yamlPath = path.join(skillDest, 'agents', 'openai.yaml');
    var userOnly = skillMd !== null &&
      parseFrontmatter(skillMd).fm['disable-model-invocation'] === 'true';

    if (userOnly) {
      fs.mkdirSync(path.join(skillDest, 'agents'), { recursive: true });
      fs.writeFileSync(yamlPath, [
        '# ' + GENERATED_BY,
        '# Mirrors `disable-model-invocation: true` in the canonical SKILL.md.',
        'policy:',
        '  allow_implicit_invocation: false',
        '',
      ].join('\n'));
    } else if (fs.existsSync(yamlPath)) {
      // The flag was turned off upstream — drop the stale policy.
      fs.rmSync(yamlPath, { force: true });
    }
  }
  fs.writeFileSync(path.join(agentsSkills, '.phe-generated'), GENERATED_MARKER);

  // --- agents: .claude/agents/<n>.md -> .codex/agents/<n>.toml ---
  fs.mkdirSync(codexAgents, { recursive: true });
  if (fs.existsSync(claudeAgents)) {
    var files = fs.readdirSync(claudeAgents).filter(function (f) { return f.endsWith('.md'); });
    for (var a = 0; a < files.length; a++) {
      var stem = files[a].replace(/\.md$/, '');
      var md = fs.readFileSync(path.join(claudeAgents, files[a]), 'utf-8');
      fs.writeFileSync(path.join(codexAgents, stem + '.toml'), agentMdToToml(md, stem));
      counts.agents++;
    }
  }

  // --- .codex/config.toml ---
  fs.writeFileSync(path.join(projectRoot, '.codex', 'config.toml'), CODEX_CONFIG_TOML);

  return counts;
}

module.exports = {
  GENERATED_BY: GENERATED_BY,
  agentMdToToml: agentMdToToml,
  emitCodexPayload: emitCodexPayload,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node cli/emit-codex.test.js`
Expected: `35 passed, 0 failed`

- [ ] **Step 5: Register both new test files in `package.json`**

In `package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "test:init": "node cli/init-backup.test.js",
    "test:cli": "node cli/cli-hardening.test.js && node cli/merge-settings.test.js && node cli/harness-targets.test.js && node cli/emit-codex.test.js",
    "test:hooks": "node template/.claude/hooks/smoke-test.mjs",
    "test": "node cli/init-backup.test.js && node cli/cli-hardening.test.js && node cli/merge-settings.test.js && node cli/harness-targets.test.js && node cli/emit-codex.test.js && node template/.claude/hooks/smoke-test.mjs"
  },
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass; the hook smoke test still reports its existing fixture count.

- [ ] **Step 7: Commit**

```bash
git add cli/emit-codex.js cli/emit-codex.test.js package.json
git commit -m "feat(cli): emit the Codex payload (.agents/skills, .codex/agents, config.toml)"
```

---

### Task 4: `AGENTS.md` becomes canonical; `CLAUDE.md` becomes a shim

**Files:**
- Create: `template/AGENTS.md` (git-move of `template/CLAUDE.md`)
- Rewrite: `template/CLAUDE.md`
- Rename: `template/examples/frontend.CLAUDE.md` → `template/examples/frontend.AGENTS.md`
- Rename: `template/examples/backend.CLAUDE.md` → `template/examples/backend.AGENTS.md`
- Modify: `tools/context-ledger.mjs:54`
- Modify: `template/.claude/skills/harness-init/SKILL.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `template/AGENTS.md` as the canonical instruction file that `init.js`/`update.js` (Task 6/7) copy for **every** target, and `template/CLAUDE.md` as the shim copied **only** for the `claude` target.

**Why:** Codex reads `AGENTS.md` and does not read `CLAUDE.md`. Claude Code reads `CLAUDE.md` and does **not** natively read `AGENTS.md` — but it officially supports importing it with `@AGENTS.md`. One canonical file, one 6-line shim, no symlink (Windows needs Admin for those).

- [ ] **Step 1: Move the canonical content**

```bash
git mv template/CLAUDE.md template/AGENTS.md
git mv template/examples/frontend.CLAUDE.md template/examples/frontend.AGENTS.md
git mv template/examples/backend.CLAUDE.md template/examples/backend.AGENTS.md
```

The **contents of `template/AGENTS.md` are unchanged** by this step.

- [ ] **Step 2: Edit `template/AGENTS.md` — one line, for the harness-neutral reference**

In `template/AGENTS.md`, find this line in the "Context tiers" section:

```
- Path-scoped rules and subdirectory `CLAUDE.md` auto-load on matching file reads.
```

Replace it with:

```
- Path-scoped rules and subdirectory `AGENTS.md` auto-load on matching file reads (native on Claude Code; injected by a hook on Codex).
```

- [ ] **Step 3: Write the new `template/CLAUDE.md` shim**

Create `template/CLAUDE.md` with exactly this content:

```markdown
@AGENTS.md

# Claude Code notes

`AGENTS.md` above is the canonical harness contract and is shared with Codex.
This file exists because Claude Code reads `CLAUDE.md`, not `AGENTS.md` — it imports it.

Claude-Code-only behaviour (Codex gets the same rules through `.claude/hooks/rules-inject.mjs`):

- `.claude/rules/*.md` with a `paths:` key auto-load when a matching file is read.
- Skills in `.claude/skills/` are invocable as `/<name>`; on Codex they are `$<name>` from `.agents/skills/`.

Project-specific instructions belong in `AGENTS.md`, not here.
```

- [ ] **Step 4: Teach the context ledger to measure `AGENTS.md`**

In `tools/context-ledger.mjs`, replace line 54:

```js
for (const f of ["CLAUDE.md", join(".claude", "CLAUDE.md"), "CLAUDE.local.md"]) {
```

with:

```js
// AGENTS.md is the canonical instruction file (Codex reads it directly; CLAUDE.md
// imports it). Both are counted: on Claude Code the import inlines AGENTS.md, so
// the real always-loaded cost is shim + canonical.
for (const f of ["AGENTS.md", "CLAUDE.md", join(".claude", "CLAUDE.md"), "CLAUDE.local.md"]) {
```

- [ ] **Step 5: Point `/harness-init` at `AGENTS.md`**

In `template/.claude/skills/harness-init/SKILL.md`, replace every reference to filling or reconciling `CLAUDE.md` with `AGENTS.md`. Concretely:
- The frontmatter `description` — change `fill CLAUDE.md` to `fill AGENTS.md`.
- Every body mention of `CLAUDE.md` **as the file whose placeholders get filled** becomes `AGENTS.md`.
- Leave untouched any mention of `CLAUDE.md.backup` reconciliation (a pre-PHE project genuinely has a `CLAUDE.md.backup`), and add this line to the reconcile section:

```markdown
A pre-PHE project's `CLAUDE.md.backup` reconciles INTO `AGENTS.md` — that is where project content now lives. The installed `CLAUDE.md` is a generated shim; never merge user content into it.
```

- [ ] **Step 6: Verify the budgets still hold**

Run: `node tools/context-ledger.mjs template`
Expected: `AGENTS.md` appears at ~59 lines / ~916 tokens; `CLAUDE.md` appears at ~10 lines; `Status: OK` and TOTAL still **< 2000**. No `!!HARD` lines.

- [ ] **Step 7: Commit**

```bash
git add template/AGENTS.md template/CLAUDE.md template/examples/ tools/context-ledger.mjs template/.claude/skills/harness-init/SKILL.md
git commit -m "refactor(template): AGENTS.md is canonical, CLAUDE.md imports it"
```

---

### Task 5: Remove `$ARGUMENTS` from the eight pipeline skills

**Files:**
- Modify: `template/.claude/skills/plan/SKILL.md:11,25,26,30`
- Modify: `template/.claude/skills/implement/SKILL.md:15`
- Modify: `template/.claude/skills/validate/SKILL.md:21,56`
- Modify: `template/.claude/skills/review/SKILL.md:14`
- Modify: `template/.claude/skills/accept/SKILL.md:14`
- Modify: `template/.claude/skills/backlog/SKILL.md:11`
- Modify: `template/.claude/skills/sprint/SKILL.md:19`
- Modify: `template/.claude/skills/handoff/SKILL.md:10`

**Interfaces:**
- Consumes: nothing.
- Produces: skills whose argument handling works identically on Claude Code (`/plan backlog/x.md`) and Codex (`$plan backlog/x.md`).

**Why:** Codex has **no `$1`/`$ARGUMENTS` substitution** — it was grepped for across the whole `openai/codex` workspace and does not exist. A skill body containing the literal `$ARGUMENTS` would reach the Codex model as the literal string `$ARGUMENTS`, which reads as an instruction to look for a variable that isn't there. Claude Code *does* substitute it, but the model can equally read the argument from the invoking message — so prose works on both, and interpolation works on only one.

**The substitution:** everywhere a skill says `` `$ARGUMENTS` ``, say **`the invocation argument`** (defined once per skill on first use as "the text typed after the command"). Keep the `argument-hint:` frontmatter — Claude Code uses it for autocomplete and Codex silently ignores it.

- [ ] **Step 1: Apply the edits**

`template/.claude/skills/plan/SKILL.md` line 11 — replace:

```
Turn `$ARGUMENTS` into an executable plan at `plans/<slug>-plan.md`. No code is written in this stage; `/implement` runs the plan in a fresh session.
```

with:

```
Turn **the invocation argument** (the text typed after the command) into an executable plan at `plans/<slug>-plan.md`. No code is written in this stage; `/implement` runs the plan in a fresh session.
```

Then in the same file replace the remaining three occurrences of `` `$ARGUMENTS` `` with `the invocation argument` (lines 25, 26, 30).

`template/.claude/skills/implement/SKILL.md` line 15 — replace:

```
Read the plan file at `$ARGUMENTS`. Missing, unreadable, or no argument → stop; final line becomes:
```

with:

```
Read the plan file named by **the invocation argument** (the text typed after the command). Missing, unreadable, or no argument → stop; final line becomes:
```

`template/.claude/skills/validate/SKILL.md` lines 21 and 56 — replace both occurrences of:

```
`$ARGUMENTS` if given
```

with:

```
the invocation argument (the text typed after the command) if given
```

`template/.claude/skills/review/SKILL.md` line 14 and `template/.claude/skills/accept/SKILL.md` line 14 — same substitution: `` `$ARGUMENTS` if given `` → `the invocation argument if given`.

`template/.claude/skills/backlog/SKILL.md` line 11 — replace `Route on `$ARGUMENTS`; no subcommand → board.` with `Route on the invocation argument (the text typed after the command); no subcommand → board.`

`template/.claude/skills/sprint/SKILL.md` line 19 — replace `` `$ARGUMENTS` picks the ceremony; missing → ask which. `` with `The invocation argument (the text typed after the command) picks the ceremony; missing → ask which.`

`template/.claude/skills/handoff/SKILL.md` line 10 — replace `(slug from `$ARGUMENTS`; none given → derive from the branch name)` with `(slug from the invocation argument; none given → derive from the branch name)`.

- [ ] **Step 2: Verify no `$ARGUMENTS` survives anywhere in the payload**

Run: `grep -rn 'ARGUMENTS' template/ ; echo "exit=$?"`
Expected: no matches, `exit=1`.

- [ ] **Step 3: Verify skill bodies still fit their budget**

Run: `node tools/context-ledger.mjs template`
Expected: `Status: OK`, no `!!HARD` line, no skill over the 100-line soft cap that wasn't already over it.

- [ ] **Step 4: Commit**

```bash
git add template/.claude/skills/
git commit -m "refactor(skills): drop \$ARGUMENTS — Codex has no argument interpolation"
```

---

### Task 6: Wire `init.js` — ask the harness question, emit the payload

**Files:**
- Modify: `cli/init.js` (imports at top; `main()` body)

**Interfaces:**
- Consumes: `harness-targets.js` (Task 1), `emit-codex.js` (Task 3), `template/AGENTS.md` + `template/CLAUDE.md` (Task 4).
- Produces: an installed project whose `.claude/harness.json` carries `harness: [...]`, and whose generated Codex tree exists when `codex` is a target.

- [ ] **Step 1: Add the imports**

In `cli/init.js`, after the existing `const { reconcileSettingsJson } = require('./merge-settings');` line (line 9), add:

```js
const { HARNESS_PROMPT, parseHarnessAnswer, writeHarnessTargets } = require('./harness-targets');
const { emitCodexPayload } = require('./emit-codex');
```

- [ ] **Step 2: Ask the question before installing**

In `main()`, immediately **before** the line `// Get previous version before overwriting` (currently line 273), insert:

```js
  // Which harness(es)? Asked once, at init; recorded in .claude/harness.json so
  // `update` re-emits the same payload without prompting.
  var targets = null;
  while (targets === null) {
    var answer = await ask('\n' + HARNESS_PROMPT);
    targets = parseHarnessAnswer(answer);
    if (targets === null) {
      console.log('  Please answer 1, 2, or 3 (or claude / codex / both).');
    }
  }
  console.log('  Harness: ' + targets.join(' + '));
  console.log('');
```

- [ ] **Step 3: Replace the CLAUDE.md copy with a target-aware AGENTS.md + shim copy**

In `cli/init.js`, replace this block (currently lines 317-327):

```js
  // Install CLAUDE.md with backup + rollback on failure. See
  // cli/claude-md-copy.js for the rollback semantics.
  var claudeMdSource = path.join(sourceDir, 'template', 'CLAUDE.md');
  var claudeMdDest = path.join(targetDir, 'CLAUDE.md');
  var claudeMdDelta = copyClaudeMdWithBackup(claudeMdSource, claudeMdDest);
  stats.created += claudeMdDelta.created;
  stats.updated += claudeMdDelta.updated;
  stats.backedUp += claudeMdDelta.backedUp;
  for (var bi = 0; bi < claudeMdDelta.backedUpFiles.length; bi++) {
    stats.backedUpFiles.push(claudeMdDelta.backedUpFiles[bi]);
  }
```

with:

```js
  // Instructions: AGENTS.md is canonical and installed for EVERY target (Codex
  // reads it directly). CLAUDE.md is a thin `@AGENTS.md` import shim and is only
  // installed when Claude Code is a target. Both use the backup+rollback copier.
  var instructionFiles = [{ name: 'AGENTS.md' }];
  if (targets.indexOf('claude') !== -1) instructionFiles.push({ name: 'CLAUDE.md' });

  for (var ifI = 0; ifI < instructionFiles.length; ifI++) {
    var ifName = instructionFiles[ifI].name;
    var ifDelta = copyClaudeMdWithBackup(
      path.join(sourceDir, 'template', ifName),
      path.join(targetDir, ifName),
      { backupLabel: ifName }
    );
    stats.created += ifDelta.created;
    stats.updated += ifDelta.updated;
    stats.backedUp += ifDelta.backedUp;
    for (var bi = 0; bi < ifDelta.backedUpFiles.length; bi++) {
      stats.backedUpFiles.push(ifDelta.backedUpFiles[bi]);
    }
  }
```

- [ ] **Step 4: Record the targets and emit the Codex tree**

In `cli/init.js`, immediately **after** the `settingsReconcile` block (after the `else if (settingsReconcile.error) { ... }` closing brace, currently line 379), insert:

```js
  // Record the harness choice AFTER the payload copy — the copy installs the
  // framework's harness.json, and writeHarnessTargets merges into it.
  writeHarnessTargets(targetDir, targets);

  // Derive the Codex tree from the canonical .claude/ payload.
  var codexCounts = null;
  if (targets.indexOf('codex') !== -1) {
    codexCounts = emitCodexPayload(targetDir);
    console.log('Emitted Codex payload: ' + codexCounts.skills + ' skills -> .agents/skills/, ' +
      codexCounts.agents + ' agents -> .codex/agents/');
  }
```

- [ ] **Step 5: Tell the user what to do next, per target**

In `cli/init.js`, replace the `console.log('Next steps:')` block (currently lines 425-431) with:

```js
  console.log('Next steps:');
  if (targets.indexOf('claude') !== -1) {
    console.log('  1. Open Claude Code in this project');
    console.log('  2. Run /harness-init — it fits the payload to your stack, arms the gate, and (optionally) scaffolds a vault');
  }
  if (targets.indexOf('codex') !== -1) {
    console.log('  Codex: instructions are in AGENTS.md; the pipeline skills are invocable as $plan, $implement, $validate, $review.');
    console.log('  .agents/skills/ and .codex/ are GENERATED from .claude/ — edit .claude/, then re-run update.');
    console.log('  Enforcement hooks are not wired for Codex yet (guidance-only).');
  }
  if (stats.backedUp > 0) {
    console.log('  (existing files were backed up as .backup — reconcile any you had customized)');
  }
  console.log('');
```

- [ ] **Step 6: Verify by hand on a scratch project**

```bash
SCRATCH=$(mktemp -d) && cp -R template "$SCRATCH/template" && cp package.json "$SCRATCH/" \
  && (cd "$SCRATCH" && git init -q . && printf '3\n' | node <repo>/cli/init.js) ; echo "---" ; ls -a "$SCRATCH"
```

Replace `<repo>` with the absolute path to this repository. (The download step falls back to the local package when offline; if it downloads, that is fine too.)

Expected: `$SCRATCH` contains `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/skills/plan/SKILL.md`, `.codex/agents/scout.toml`, `.codex/config.toml`; and `.claude/harness.json` contains `"harness": ["claude","codex"]`.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add cli/init.js
git commit -m "feat(cli): init asks which harness and emits the matching payload"
```

---

### Task 7: Wire `update.js` — re-emit non-interactively

**Files:**
- Modify: `cli/update.js` (imports; `main()` body)

**Interfaces:**
- Consumes: `readHarnessTargets()` (Task 1), `emitCodexPayload()` (Task 3).
- Produces: `update` refreshes both trees for whichever targets `harness.json` records, **without prompting**.

**Back-compat:** a project installed before this feature has no `harness` key. `readHarnessTargets()` returns `null` → default to `['claude']`, which is exactly what those projects already are. No prompt, no surprise.

- [ ] **Step 1: Add the imports**

In `cli/update.js`, after `const { reconcileSettingsJson } = require('./merge-settings');` (line 9), add:

```js
const { readHarnessTargets, writeHarnessTargets } = require('./harness-targets');
const { emitCodexPayload } = require('./emit-codex');
```

- [ ] **Step 2: Resolve targets before copying**

In `main()`, immediately after `var previousVersion = getVersion(projectRoot);` (line 149), insert:

```js
  // Non-interactive: the harness choice was made at init. A project installed
  // before multi-harness support has no `harness` key — it is Claude-only.
  var targets = readHarnessTargets(projectRoot);
  if (targets === null) {
    targets = ['claude'];
    writeHarnessTargets(projectRoot, targets);
    console.log('No harness recorded — assuming Claude Code. Re-run `init` to add Codex.');
  }
  console.log('Harness: ' + targets.join(' + '));
```

- [ ] **Step 3: Replace the CLAUDE.md copy with the target-aware instruction copy**

In `cli/update.js`, replace this block (currently lines 198-208):

```js
    // Update CLAUDE.md with backup + rollback on failure. See
    // cli/claude-md-copy.js for the rollback semantics.
    var claudeMdSource = path.join(sourceDir, 'template', 'CLAUDE.md');
    var claudeMdDest = path.join(projectRoot, 'CLAUDE.md');
    var claudeMdDelta = copyClaudeMdWithBackup(claudeMdSource, claudeMdDest);
    stats.created += claudeMdDelta.created;
    stats.updated += claudeMdDelta.updated;
    stats.backedUp += claudeMdDelta.backedUp;
    for (var bi = 0; bi < claudeMdDelta.backedUpFiles.length; bi++) {
      stats.backedUpFiles.push(claudeMdDelta.backedUpFiles[bi]);
    }
```

with:

```js
    // Instructions: AGENTS.md always; the CLAUDE.md shim only for a Claude target.
    var instructionFiles = ['AGENTS.md'];
    if (targets.indexOf('claude') !== -1) instructionFiles.push('CLAUDE.md');

    for (var ifI = 0; ifI < instructionFiles.length; ifI++) {
      var ifName = instructionFiles[ifI];
      var ifDelta = copyClaudeMdWithBackup(
        path.join(sourceDir, 'template', ifName),
        path.join(projectRoot, ifName),
        { backupLabel: ifName }
      );
      stats.created += ifDelta.created;
      stats.updated += ifDelta.updated;
      stats.backedUp += ifDelta.backedUp;
      for (var bi = 0; bi < ifDelta.backedUpFiles.length; bi++) {
        stats.backedUpFiles.push(ifDelta.backedUpFiles[bi]);
      }
    }
```

- [ ] **Step 4: Re-emit the Codex tree**

In `cli/update.js`, immediately after the `settingsReconcile` block (after its `else if (settingsReconcile.error) { ... }` closing brace, currently line 254), insert:

```js
    // Re-derive the Codex tree so a payload change (new skill, edited agent)
    // reaches Codex. Generated trees are overwritten, never backed up.
    if (targets.indexOf('codex') !== -1) {
      var codexCounts = emitCodexPayload(projectRoot);
      console.log('Re-emitted Codex payload: ' + codexCounts.skills + ' skills, ' + codexCounts.agents + ' agents.');
    }
```

- [ ] **Step 5: Verify update is idempotent on the scratch project from Task 6**

```bash
cd "$SCRATCH" && node <repo>/cli/update.js && cat .claude/harness.json
```

Expected: `Harness: claude + codex` is printed, `Re-emitted Codex payload: ...` is printed, and `harness.json` still contains `"harness": ["claude","codex"]` alongside its other keys (`stopGate`, `workTracking`).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add cli/update.js
git commit -m "feat(cli): update re-emits the Codex payload from harness.json"
```

---

### Task 8: Document the dual-emit model and verify the whole phase

**Files:**
- Modify: `README.md`
- Modify: `template/.claude/skills/harness-init/SKILL.md` (Codex trust note)

**Decision (do NOT gitignore the generated trees):** `.agents/` and `.codex/` are committed in an adopting project, exactly like `.claude/` is. They are derived, but a fresh `git clone` of a Codex project must work without first running the CLI. "Generated" here means "overwritten by `update`, never hand-edited" — not "untracked". No `.gitignore` change is needed.

**Interfaces:**
- Consumes: everything above.
- Produces: the shipped documentation of the harness question and generated trees.

- [ ] **Step 1: Update the README Layout table and Install section**

In `README.md`, in the `## Layout` table, change the `template/` row's description to read:

```
| `template/` | **The payload** — copy into any project: `AGENTS.md` (canonical instructions), `CLAUDE.md` (a `@AGENTS.md` import shim for Claude Code), `.claude/` (hooks, rules, skills, agents, references, `statusline.mjs`), `plans/`, `reports/`. `.claude/state/` holds runtime snapshots — gitignored by `/harness-init` |
```

In `## Install`, after the `npx` code block, add:

```markdown
`init` asks **which harness you use — Claude Code, Codex, or both** — and records it in `.claude/harness.json`, so `update` re-emits the right payload without asking again.

**One source, two harnesses.** Canonical content lives once, under `.claude/` and `AGENTS.md`. When Codex is a target, PHE *derives* the trees Codex reads:

| Generated | Derived from | Read by |
|---|---|---|
| `.agents/skills/` | `.claude/skills/` | Codex (`$plan`, `$implement`, …) |
| `.codex/agents/*.toml` | `.claude/agents/*.md` | Codex subagents |
| `.codex/config.toml` | (framework) | Codex |
| `CLAUDE.md` | `AGENTS.md` (imports it) | Claude Code (`/plan`, `/implement`, …) |

**Never hand-edit `.agents/` or `.codex/`** — they are overwritten on every `init`/`update`. Edit `.claude/`.

Codex support in this release is **guidance-only**: instructions, skills, and subagents port; the enforcement hooks do not yet. They arrive next.
```

- [ ] **Step 2: Add the Codex trust note to `/harness-init`**

In `template/.claude/skills/harness-init/SKILL.md`, add this to the body (it costs nothing until the skill is invoked — `disable-model-invocation: true`):

```markdown
**Codex target?** Codex only loads a project's `.codex/` layer when the project is TRUSTED. Tell the user to run `codex` in this directory once and accept the trust prompt, or to add `[projects."<abs-path>"] trust_level = "trusted"` to `~/.codex/config.toml`. Until then `.codex/config.toml` and `.codex/agents/` are ignored entirely.
```

- [ ] **Step 3: Full verification — the whole phase, end to end**

Run each and confirm:

```bash
npm test
```
Expected: every suite green (init-backup, cli-hardening, merge-settings, harness-targets, emit-codex, hook smoke test).

```bash
node tools/context-ledger.mjs template
```
Expected: `Status: OK`, TOTAL < 2000, no `!!HARD` lines, `AGENTS.md` listed.

```bash
grep -rn 'ARGUMENTS' template/ ; echo "exit=$?"
```
Expected: `exit=1` (no matches).

- [ ] **Step 4: Manual acceptance — a Codex-only project really works**

```bash
SCRATCH2=$(mktemp -d) && cd "$SCRATCH2" && git init -q . \
  && printf '2\n' | node <repo>/cli/init.js
ls -a
cat .claude/harness.json
```

Expected, and each is a hard requirement of Phase 1:
- `AGENTS.md` exists; **`CLAUDE.md` does NOT** (Codex-only target).
- `.agents/skills/plan/SKILL.md` exists and contains no `$ARGUMENTS`.
- `.agents/skills/plan/agents/openai.yaml` exists and contains `allow_implicit_invocation: false` — the pipeline must never self-start on Codex. The two knowledge skills (`architecture-map`, `debugging-this-repo`) must **not** have one; they are meant to auto-invoke.
- `.codex/agents/scout.toml` exists, starts with the generated-file warning, has `name = "scout"` and a `developer_instructions` block, and has **no `model =` line**.
- `.codex/config.toml` contains `multi_agent = true`.
- `.claude/harness.json` contains `"harness": ["codex"]` **and still has its `stopGate` / `workTracking` keys**.

- [ ] **Step 5: Commit**

```bash
git add README.md template/.claude/skills/harness-init/SKILL.md
git commit -m "docs: dual-emit install model + Codex project-trust step"
```

---

## Phase exit criteria

Phase 1 is done when all of these hold:

1. `npm test` is green, including the two new suites.
2. `node tools/context-ledger.mjs template` reports OK with `AGENTS.md` measured.
3. A Codex-only `init` produces `AGENTS.md` + `.agents/skills/` + `.codex/` and **no** `CLAUDE.md`.
4. A both-harness `init` produces every tree, and `update` re-emits without prompting.
5. No `$ARGUMENTS` survives anywhere under `template/`.
6. No model name appears in any emitted file (Phase 3 owns that).

**Not in this phase, by design:** hooks on Codex (Phase 2), the model tier map (Phase 3), the loop driver / global / docs rewrite (Phase 4), the code & token economy rules (Phase 5, its own design doc).
