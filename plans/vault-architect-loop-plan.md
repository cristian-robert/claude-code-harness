# Vault Architecture Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a vault-backed architect agent that reads this project's architecture from the Obsidian vault before structural work, and an `/evolve` step that records structural change back to the vault — with `init` asking for the general vault and `/harness-init` wiring it.

**Architecture:** Additive to Phase 1 (dual-emit). Architecture is knowledge, not config: it lives once in the vault project wiki (`projects/<name>/architecture.md` + `decisions.md`). A new `template/.claude/agents/architect-agent.md` reads it (`RETRIEVE`/`IMPACT`) and records to it (`RECORD`); Phase 1's emitter carries the agent to Codex unchanged. `cli/init.js` asks for the general vault and records it in `.claude/harness.json`; `/harness-init` scaffolds/wires it. The loop is opt-in on having a vault — no vault means the agent falls back to a codebase scan and `/evolve`'s record step is a no-op.

**Tech Stack:** Node ≥18, CommonJS (`cli/*.js`), zero runtime dependencies. Tests are plain Node scripts with a hand-rolled `assert` counter (matching `cli/harness-targets.test.js`). Agent and skill changes are Markdown.

**Spec:** `docs/design/2026-07-12-vault-architect-loop.md`.

## Global Constraints

- **Node ≥18**, CommonJS `require`/`module.exports` in `cli/`. `var`-in-function-bodies, ES5-ish `function` syntax — match `cli/harness-targets.js` exactly. **No new npm dependencies — ever.**
- Tests: plain Node, hand-rolled `assert` counter ending `process.exit(failed > 0 ? 1 : 0)`. No test framework. Register new test files in `package.json` `scripts.test` **and** `scripts.test:cli` (append with `&&`).
- **Budgets, enforced by `node tools/context-ledger.mjs template`:** `AGENTS.md`/`CLAUDE.md` ≤60 lines (hard 80); rules ≤45 (hard 60); skill **bodies** ≤100 (hard 120); total always-loaded <2000 est. tokens. Current: 1593/2000; `00-core.md` at **44/45** (adding a dispatch row lands it at exactly 45 — at the soft cap, not over; do not add a second line).
- **Agents are NOT measured by the ledger** (only `AGENTS.md`, `CLAUDE.md`, unscoped rules, and skill descriptions/bodies are). The new agent file has no always-loaded cost.
- **No model names in EMITTED Codex config** (Phase 3 owns that): the architect agent pins `model: opus` in its own `.claude/agents/*.md` frontmatter, but the emitter already strips `model` when producing `.codex/agents/*.toml` — do not fight that.
- `harness.json` is shared: every write MUST preserve `stopGate`, `workTracking`, `harness`, and every other key. A write that clobbers them disarms the stop gate.
- **`cli/update.js` needs NO change** — it is non-interactive; `writeHarnessTargets` already preserves the `vault` key on update. Do not touch it.
- Branch `feat/codex-harness-port`. Never touch `main`.

## File Structure

| File | Responsibility |
|---|---|
| `cli/vault-config.js` | **Create.** `parseVaultAnswer` (pure), `readVaultConfig`/`writeVaultConfig` (merge the `vault` key into `harness.json`, preserving other keys, refusing on malformed). |
| `cli/vault-config.test.js` | **Create.** Tests for the above, incl. coexistence with `writeHarnessTargets`. |
| `cli/init.js` | **Modify.** Ask the vault question after the harness question; record via `writeVaultConfig`. |
| `template/.claude/agents/architect-agent.md` | **Create.** The vault-backed architect agent (RETRIEVE/IMPACT/RECORD/PATTERN; codebase fallback). |
| `cli/emit-codex.test.js` | **Modify.** Add a real-payload assertion that the agent emits to `.codex/agents/architect-agent.toml`. |
| `template/.claude/skills/evolve/SKILL.md` | **Modify.** Structural-change detection + the `[vault: architecture]` RECORD row. |
| `template/.claude/rules/00-core.md` | **Modify.** One dispatch-table row for `architect-agent`. |
| `template/.claude/skills/harness-init/SKILL.md` | **Modify.** Route the vault step off `harness.json`; wire + confirm the architect agent. |
| `package.json` | **Modify.** Register `cli/vault-config.test.js`. |

---

### Task 1: `cli/vault-config.js` — the vault field in harness.json

**Files:**
- Create: `cli/vault-config.js`
- Create: `cli/vault-config.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `writeHarnessTargets` from `./harness-targets` (test only, to prove coexistence).
- Produces:
  - `VAULT_PROMPT: string` — the question `init.js` prints.
  - `parseVaultAnswer(input: string) -> { mode, path } | null` — `mode` is `'existing' | 'scaffold' | 'none'`; `path` is an absolute string for `existing`, else `null`. Returns `null` for unparseable input (caller re-asks). Pure — no fs.
  - `readVaultConfig(projectRoot: string) -> { mode, path } | null` — reads `.claude/harness.json` → `vault`; `null` if the file/key is absent or malformed.
  - `writeVaultConfig(projectRoot: string, config: { mode, path }) -> void` — merges `vault` into `.claude/harness.json`, preserving every other key; **throws** if an existing `harness.json` is present but unparseable or not a plain object (mirrors `harness-targets.js`).

- [ ] **Step 1: Write the failing test**

Create `cli/vault-config.test.js`:

```js
// cli/vault-config.test.js
//
// Tests vault-config parsing and persistence of the `vault` key in
// .claude/harness.json, and its coexistence with the `harness` key.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { parseVaultAnswer, readVaultConfig, writeVaultConfig } = require('./vault-config');
const { writeHarnessTargets } = require('./harness-targets');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const TEST_DIR = path.join(os.tmpdir(), 'vault-config-test-' + crypto.randomUUID());

console.log('parseVaultAnswer:');
var HOME = os.homedir();
assert('absolute path -> existing', JSON.stringify(parseVaultAnswer('/Users/x/Vault')) === JSON.stringify({ mode: 'existing', path: '/Users/x/Vault' }));
assert('trailing slash trimmed', parseVaultAnswer('/Users/x/Vault/').path === '/Users/x/Vault');
assert('~ expands to home', parseVaultAnswer('~/Vault').path === path.join(HOME, 'Vault'));
assert('"s" -> scaffold', JSON.stringify(parseVaultAnswer('s')) === JSON.stringify({ mode: 'scaffold', path: null }));
assert('"scaffold" -> scaffold', parseVaultAnswer('scaffold').mode === 'scaffold');
assert('"skip" -> none', JSON.stringify(parseVaultAnswer('skip')) === JSON.stringify({ mode: 'none', path: null }));
assert('"none" -> none', parseVaultAnswer('none').mode === 'none');
assert('empty -> none', parseVaultAnswer('').mode === 'none');
assert('whitespace trimmed', parseVaultAnswer('  s  ').mode === 'scaffold');
assert('relative path -> null (re-ask)', parseVaultAnswer('some/rel/path') === null);
assert('garbage -> null', parseVaultAnswer('maybe?') === null);

console.log('readVaultConfig:');
var PROJ = path.join(TEST_DIR, 'proj');
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true });
assert('missing harness.json -> null', readVaultConfig(PROJ) === null);
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), JSON.stringify({ stopGate: [] }));
assert('harness.json without vault key -> null', readVaultConfig(PROJ) === null);
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ not json');
assert('malformed harness.json -> null (no throw)', readVaultConfig(PROJ) === null);

console.log('writeVaultConfig preserves other keys:');
fs.writeFileSync(
  path.join(PROJ, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: ['npm test'], workTracking: { backend: 'none' } }, null, 2)
);
writeVaultConfig(PROJ, { mode: 'existing', path: '/v' });
var after = JSON.parse(fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8'));
assert('vault key written', JSON.stringify(after.vault) === JSON.stringify({ mode: 'existing', path: '/v' }));
assert('stopGate preserved', JSON.stringify(after.stopGate) === '["npm test"]');
assert('workTracking preserved', after.workTracking.backend === 'none');
assert('round-trips through readVaultConfig', readVaultConfig(PROJ).path === '/v');

console.log('writeVaultConfig refuses to destroy malformed config:');
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.json'), '{ oops not json');
var threw = false;
try { writeVaultConfig(PROJ, { mode: 'none', path: null }); } catch (e) { threw = true; }
assert('throws on malformed existing harness.json', threw);
assert('malformed file left untouched', fs.readFileSync(path.join(PROJ, '.claude', 'harness.json'), 'utf-8') === '{ oops not json');

console.log('coexistence with writeHarnessTargets:');
var CO = path.join(TEST_DIR, 'coexist');
fs.mkdirSync(path.join(CO, '.claude'), { recursive: true });
fs.writeFileSync(path.join(CO, '.claude', 'harness.json'), JSON.stringify({ stopGate: ['x'] }, null, 2));
writeVaultConfig(CO, { mode: 'scaffold', path: null });
writeHarnessTargets(CO, ['claude', 'codex']);
var co = JSON.parse(fs.readFileSync(path.join(CO, '.claude', 'harness.json'), 'utf-8'));
assert('vault survives a later writeHarnessTargets', co.vault.mode === 'scaffold');
assert('harness written alongside vault', JSON.stringify(co.harness) === '["claude","codex"]');
assert('stopGate still preserved through both writes', JSON.stringify(co.stopGate) === '["x"]');

console.log('writeVaultConfig creates harness.json when absent:');
var FRESH = path.join(TEST_DIR, 'fresh');
fs.mkdirSync(path.join(FRESH, '.claude'), { recursive: true });
writeVaultConfig(FRESH, { mode: 'none', path: null });
assert('creates harness.json when absent', readVaultConfig(FRESH).mode === 'none');

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node cli/vault-config.test.js`
Expected: FAIL — `Cannot find module './vault-config'`

- [ ] **Step 3: Write the implementation**

Create `cli/vault-config.js`:

```js
'use strict';

// The Obsidian vault this project uses for architecture & knowledge. Persisted
// in .claude/harness.json under `vault`, asked once at `init`. /harness-init
// reads this to scaffold/wire the vault and point the architect agent at it.
//
// Merge discipline mirrors harness-targets.js: harness.json is shared (it holds
// the stop gate and work-tracking config), so a write preserves every other key
// and REFUSES (throws) rather than overwrite a harness.json it cannot parse.

const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT_PROMPT =
  'Do you use an Obsidian vault for architecture & knowledge?\n' +
  '  <path>  absolute path to your general vault (e.g. ~/Dev/The Vault)\n' +
  '  s       scaffold a new vault later (during /harness-init)\n' +
  '  skip    no vault\n' +
  'Vault (path / s / skip): ';

function parseVaultAnswer(input) {
  if (typeof input !== 'string') return null;
  var a = input.trim();
  var lower = a.toLowerCase();
  if (a === '' || lower === 'skip' || lower === 'none') return { mode: 'none', path: null };
  if (lower === 's' || lower === 'scaffold') return { mode: 'scaffold', path: null };
  // An absolute path (or ~-rooted) is an existing vault. Expand ~ and trim a
  // trailing slash so the recorded path is canonical.
  if (a.charAt(0) === '/' || a.slice(0, 2) === '~/') {
    var p = a.slice(0, 2) === '~/' ? path.join(os.homedir(), a.slice(2)) : a;
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return { mode: 'existing', path: p };
  }
  // Anything else (a relative path, a typo) is unparseable — caller re-asks.
  return null;
}

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

function readVaultConfig(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null; // reads must never crash init/update
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!parsed.vault || typeof parsed.vault !== 'object') return null;
  return parsed.vault;
}

// Merge the vault key into harness.json, preserving every other key. Refuse to
// write through a harness.json we cannot parse — silently discarding the stop
// gate is never acceptable (parity with harness-targets.writeHarnessTargets).
function writeVaultConfig(projectRoot, config) {
  var p = harnessJsonPath(projectRoot);
  var current = {};
  if (fs.existsSync(p)) {
    var raw = fs.readFileSync(p, 'utf-8');
    try {
      current = JSON.parse(raw);
    } catch (e) {
      throw new Error(p + ' is not valid JSON. Fix it by hand and re-run — refusing to overwrite it.');
    }
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(p + ' is not a JSON object. Fix it by hand and re-run — refusing to overwrite it.');
    }
  }
  current.vault = { mode: config.mode, path: config.path || null };
  var dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(current, null, 2) + '\n');
}

module.exports = {
  VAULT_PROMPT: VAULT_PROMPT,
  parseVaultAnswer: parseVaultAnswer,
  readVaultConfig: readVaultConfig,
  writeVaultConfig: writeVaultConfig,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node cli/vault-config.test.js`
Expected: `24 passed, 0 failed`

- [ ] **Step 5: Register the test in `package.json`**

In `package.json`, append `cli/vault-config.test.js` to both scripts. Replace the `test:cli` and `test` lines with:

```json
    "test:cli": "node cli/cli-hardening.test.js && node cli/merge-settings.test.js && node cli/harness-targets.test.js && node cli/emit-codex.test.js && node cli/emit.test.js && node cli/vault-config.test.js",
    "test": "node cli/init-backup.test.js && node cli/cli-hardening.test.js && node cli/merge-settings.test.js && node cli/harness-targets.test.js && node cli/emit-codex.test.js && node cli/emit.test.js && node cli/vault-config.test.js && node template/.claude/hooks/smoke-test.mjs",
```

**Before editing, `cat package.json`** — Phase 1 may have registered `cli/emit.test.js` (the `emit` subcommand). If a script name shown above is not already present, do not invent it; add only `cli/vault-config.test.js` in the same style, preserving whatever is there.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites green, including the new `vault-config` suite.

- [ ] **Step 7: Commit**

```bash
git add cli/vault-config.js cli/vault-config.test.js package.json
git commit -m "feat(cli): record the project's Obsidian vault in harness.json"
```

---

### Task 2: Wire the vault question into `cli/init.js`

**Files:**
- Modify: `cli/init.js`

**Interfaces:**
- Consumes: `VAULT_PROMPT`, `parseVaultAnswer`, `writeVaultConfig` from `./vault-config`; the existing `ask()` helper and the `writeHarnessTargets` call in `main()`.
- Produces: an installed project whose `.claude/harness.json` carries a `vault` object alongside `harness`.

- [ ] **Step 1: Add the import**

In `cli/init.js`, after the line `const { HARNESS_PROMPT, parseHarnessAnswer, writeHarnessTargets } = require('./harness-targets');` add:

```js
const { VAULT_PROMPT, parseVaultAnswer, writeVaultConfig } = require('./vault-config');
```

- [ ] **Step 2: Ask the vault question, right after the harness question**

In `cli/init.js`, find the harness-question block that ends with:

```js
  console.log('  Harness: ' + targets.join(' + '));
  console.log('');
```

Immediately after it, insert:

```js
  // Which Obsidian vault (if any) backs architecture & knowledge? Asked once,
  // recorded in harness.json; /harness-init does the scaffolding + wiring.
  var vault = null;
  while (vault === null) {
    var vaultAnswer = await ask(VAULT_PROMPT);
    vault = parseVaultAnswer(vaultAnswer);
    if (vault === null) {
      console.log('  Enter an absolute path, or "s" to scaffold, or "skip".');
    }
  }
  console.log('  Vault: ' + (vault.mode === 'existing' ? vault.path : vault.mode));
  console.log('');
```

- [ ] **Step 3: Record it alongside the harness targets**

In `cli/init.js`, find the line `writeHarnessTargets(targetDir, targets);` and add, immediately after it:

```js
  writeVaultConfig(targetDir, vault);
```

- [ ] **Step 4: Extend the "Next steps" output**

In `cli/init.js`, find the `console.log('Next steps:');` block. Inside it, where the Claude-target or Codex-target lines are printed, add — after those, unconditionally — a vault line. Insert this just before the closing `console.log('');` of the Next-steps block:

```js
  if (vault.mode === 'scaffold' || vault.mode === 'existing') {
    console.log('  Vault: /harness-init will ' + (vault.mode === 'scaffold' ? 'scaffold it and ' : '') +
      'wire the pointer block and point the architect agent at projects/<name>/.');
  }
```

- [ ] **Step 5: Manual verification (forced local-fallback)**

`init.js` downloads the framework tarball and only falls back to the local package on failure — an unforced run installs the **published** package (which lacks this work) and gives a false pass. Force local-fallback by shadowing `curl`, and confirm you see `Download failed → Using local package as fallback`.

```bash
REPO=/Users/cristian-robertiosef/Dev/perfectHarnessEngineering
SCRATCH=$(mktemp -d) && cd "$SCRATCH" && git init -q .
SHIM=$(mktemp -d) && printf '#!/bin/sh\nexit 1\n' > "$SHIM/curl" && chmod +x "$SHIM/curl"
# answer: harness=1 (claude), vault=~/Dev/The Vault
printf '1\n~/Dev/The Vault\n' | PATH="$SHIM:$PATH" node "$REPO/cli/init.js"
echo "--- harness.json ---" && cat .claude/harness.json
```

Expected: output includes `Download failed` then `Using local package as fallback`; `Vault: /Users/.../Dev/The Vault` printed; and `.claude/harness.json` contains a `vault` object `{ "mode": "existing", "path": "/Users/.../Dev/The Vault" }` **alongside** its `stopGate`/`workTracking`/`harness` keys. Repeat with `printf '1\nskip\n'` and confirm `"vault": { "mode": "none", "path": null }`.

- [ ] **Step 6: Confirm `update` preserves the vault field**

```bash
cd "$SCRATCH" && PATH="$SHIM:$PATH" node "$REPO/cli/update.js" < /dev/null
grep -A2 '"vault"' .claude/harness.json
```

Expected: `update` runs without prompting and the `vault` object is still present afterward (proves the no-change-to-update.js claim holds).

- [ ] **Step 7: Run the suite and commit**

Run: `npm test` (green), then:

```bash
git add cli/init.js
git commit -m "feat(cli): init asks for the Obsidian vault and records it"
```

---

### Task 3: `template/.claude/agents/architect-agent.md` — the vault-backed agent

**Files:**
- Create: `template/.claude/agents/architect-agent.md`
- Modify: `cli/emit-codex.test.js`

**Interfaces:**
- Consumes: nothing at runtime; Phase 1's `emitCodexPayload` converts it to `.codex/agents/architect-agent.toml`.
- Produces: the `architect-agent` subagent, invocable on Claude Code (`.claude/agents/`) and Codex (emitted).

- [ ] **Step 1: Write the failing test**

In `cli/emit-codex.test.js`, find the `emitCodexPayload` real-payload section (the block that copies `template/` into a temp dir and emits it — added in Phase 1's F6 fix). If such a block exists, add these assertions to it; if it does not, add a new block before the final summary that copies `template/.claude` into a temp project and emits. Use this self-contained block (place it before the final `console.log('\n' + passed ...)`):

```js
console.log('architect-agent emits to Codex:');
{
  var AA_DIR = path.join(os.tmpdir(), 'emit-architect-test-' + crypto.randomUUID());
  var AA_PROJ = path.join(AA_DIR, 'proj');
  // Copy the REAL template payload so this guards the shipped agent file.
  var REPO_ROOT = path.join(__dirname, '..');
  fs.cpSync(path.join(REPO_ROOT, 'template', '.claude'), path.join(AA_PROJ, '.claude'), { recursive: true });
  emitCodexPayload(AA_PROJ);
  var aaToml = path.join(AA_PROJ, '.codex', 'agents', 'architect-agent.toml');
  assert('architect-agent.toml emitted', fs.existsSync(aaToml));
  var aa = fs.readFileSync(aaToml, 'utf-8');
  assert('architect-agent.toml has name', aa.indexOf('name = "architect-agent"') !== -1);
  assert('architect-agent.toml has developer_instructions', aa.indexOf('developer_instructions') !== -1);
  assert('architect-agent.toml has NO model line (Phase 3 owns model keys)', /^model\s*=/m.test(aa) === false);
  assert('architect-agent instructions mention the vault', aa.toLowerCase().indexOf('vault') !== -1);
  fs.rmSync(AA_DIR, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node cli/emit-codex.test.js`
Expected: FAIL — `architect-agent.toml emitted` fails (the agent file does not exist yet).

- [ ] **Step 3: Create the agent**

Create `template/.claude/agents/architect-agent.md`:

```markdown
---
name: architect-agent
description: "Project architecture knowledge base, backed by the vault. Consult BEFORE creating or changing modules, routes, DB tables, or endpoints (RETRIEVE/IMPACT). Records structural change back to the vault (RECORD). Returns concise file maps and integration points, not file contents."
tools: Read, Grep, Glob, Edit, Write
model: opus
---

You are this project's architecture knowledge base. Your knowledge base is the project's wiki IN
THE OBSIDIAN VAULT — not a copy inside the repo. You respond only to the dispatching agent, never
to a human. Answer in ≤30 lines: file paths, not file contents.

## Resolve your knowledge base first (every dispatch)

1. Read the repo `AGENTS.md`; find its `## Knowledge Vault` block. Take the absolute vault path and
   the `projects/<name>/` project name from it. Fallback: `.claude/harness.json` → `vault.path`.
2. No vault block AND no `vault.path` → you have NO vault KB. Open every answer with the line
   `NO VAULT KB — answering from the codebase.`, then answer from the code (Glob/Grep/Read) like a
   read-only scout. Skip RECORD entirely — there is nowhere to write.
3. Vault found → your KB is `<vault>/projects/<name>/`: `_index.md` (contents), `architecture.md`
   (the map), `decisions.md` (ADRs). Read `_index.md` first, then only the file the query needs.
   Never load the whole KB.

## Query types (from the dispatching agent)

### RETRIEVE
Current architecture relevant to the query. Read `architecture.md` (+ `decisions.md` for rationale).

    ## Modules/Files
    - <path or module → one-line responsibility>
    ## Integrates with
    - <what this connects to>
    ## Watch out
    - <gotchas, non-obvious patterns>

### IMPACT
What a planned change will touch. Read `architecture.md`; identify affected areas.

    ## Affected areas
    - <module → what changes>
    ## New files/tables likely
    - <suggested paths/tables following existing conventions>
    ## Follow pattern from
    - <existing file/module to template from>
    ## Integration points
    - <where new code connects>

### RECORD
The dispatching agent tells you what changed. No vault KB → refuse: `NO VAULT KB — cannot record.`

1. VERIFY the change exists in the codebase (Glob/Grep) before writing — never record unverified.
2. Update `architecture.md` (module table, data flow) to match.
3. Decision with rationale given → append an ADR to `decisions.md`.
4. Vault Index Law: a folder whose contents you changed gets its `_index.md` updated in the SAME
   change (bump `updated:`).
5. Reply with a one-line confirmation per file written.

### PATTERN
An established convention. Read `architecture.md` (or `decisions.md`).

    ## Pattern: <name>
    - <how it works, 3-5 lines>
    - Reference: <file path to an example>

## Rules

- ≤30 lines per response. Paths, not contents — the dispatching agent reads files itself.
- RECORD verifies against the codebase before writing; never write architecture you have not confirmed.
- Vault writes are the ONLY writes you make. Never edit product code.
- Ambiguous query → answer with your best interpretation; never ask the dispatcher a follow-up.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node cli/emit-codex.test.js`
Expected: all assertions pass, including the five new `architect-agent` ones.

- [ ] **Step 5: Verify agent frontmatter and the ledger**

Run: `node tools/context-ledger.mjs template`
Expected: `Status: OK`, no `!!HARD`. (The agent is not always-loaded, so the total is unchanged from before this task — confirm it did not somehow move.)

- [ ] **Step 6: Run the suite and commit**

Run: `npm test` (green), then:

```bash
git add template/.claude/agents/architect-agent.md cli/emit-codex.test.js
git commit -m "feat(agents): vault-backed architect agent (reads the vault project wiki)"
```

---

### Task 4: `/evolve` architecture-record row + `00-core` dispatch row

**Files:**
- Modify: `template/.claude/skills/evolve/SKILL.md`
- Modify: `template/.claude/rules/00-core.md`

**Interfaces:**
- Consumes: the `architect-agent` from Task 3.
- Produces: the writer end of the loop — `/evolve` proposes recording structural change to the vault; `00-core` routes architecture questions to the agent.

- [ ] **Step 1: Add structural-change detection to `/evolve` step 1**

In `template/.claude/skills/evolve/SKILL.md`, in the `## 1. Gather candidates` list, add a final bullet:

```markdown
- Structural changes this session — new/removed modules, routes, DB tables, or endpoints — from the plan's affected-surfaces list and the diff since the base branch (new files under module/route dirs, migrations, new endpoints).
```

- [ ] **Step 2: Add the architecture-record row to the `/evolve` destination ladder**

In the `## 2. Choose a destination` table in `evolve/SKILL.md`, add this row **immediately above** the `| Generalizes beyond this project | Vault: ... |` row:

```markdown
| Structural change to record | Dispatch `architect-agent` **RECORD** → updates `projects/<name>/architecture.md` + `decisions.md` in the vault (no vault → skip, say so) |
```

- [ ] **Step 3: Show the tag in the ask-first example**

In the `## 5. Ask-first` fenced example in `evolve/SKILL.md`, add one line so the `[vault: architecture]` destination tag is demonstrated. Change the example block to include:

```
4. [vault: architecture] Record the new `orders` table + tenant_id FK — traces to: this session's migration
```

- [ ] **Step 4: Add the dispatch-table row to `00-core.md`**

In `template/.claude/rules/00-core.md`, in the `## Dispatch` table, add this row **immediately below** the `| Understand / synthesize | scout (sonnet) |` row:

```markdown
| Architecture: where new code goes / what a change touches (BEFORE a new module/route/table/endpoint) | `architect-agent` (opus) — reads the vault project wiki; RECORD writes it back via /evolve |
```

- [ ] **Step 5: Verify the budgets — this is the tight one**

Run: `node tools/context-ledger.mjs template`
Expected: `Status: OK`, no `!!HARD`, and **`.claude/rules/00-core.md` at ≤45 lines** (it was 44; the one row makes it 45 — the soft cap, which is allowed; the ledger only warns above 45). If the ledger reports `00-core.md` over 45, you added more than one line — collapse the row to a single line or cut a lower-value line elsewhere in the file. Also confirm `evolve/SKILL.md` body is still ≤100 lines (no warning).

- [ ] **Step 6: Confirm the wiring reads correctly**

Run: `grep -n 'architect-agent' template/.claude/rules/00-core.md template/.claude/skills/evolve/SKILL.md`
Expected: matches in both files.

- [ ] **Step 7: Run the suite and commit**

Run: `npm test` (green — no code changed, but the smoke test and ledger prove nothing regressed), then:

```bash
git add template/.claude/skills/evolve/SKILL.md template/.claude/rules/00-core.md
git commit -m "feat(evolve): record structural change to the vault; route architecture to the agent"
```

---

### Task 5: `/harness-init` routes the vault step off harness.json and wires the agent

**Files:**
- Modify: `template/.claude/skills/harness-init/SKILL.md`

**Interfaces:**
- Consumes: `harness.json` `vault` (Task 1), the `architect-agent` (Task 3), the existing `vault-scaffold/` assets and pointer-block wiring.
- Produces: the setup step that scaffolds/wires the vault per the recorded choice and confirms the architect agent resolves.

- [ ] **Step 1: Route the INTERVIEW vault question off `harness.json`**

In `template/.claude/skills/harness-init/SKILL.md`, replace the interview line (currently item 5 under the interview section):

```markdown
5. Vault: detect one (a pasted pointer block, or ask for its path). None + wanted → offer to scaffold a fresh vault from `.claude/references/vault-scaffold/` at a path they choose. Existing → just wire the pointer block. Or skip vault wiring entirely.
```

with:

```markdown
5. Vault: read `.claude/harness.json` `vault` (recorded at `init`). `existing` → confirm the path; `scaffold` → confirm where to create it; `none` → confirm skipping, or offer to add one now. (No `vault` key — a pre-vault install — → ask as before: path / scaffold / skip.)
```

- [ ] **Step 2: Route the GENERATE vault step off `harness.json` and wire the agent**

In `harness-init/SKILL.md`, replace the GENERATE vault bullet (currently begins `- Vault (from question 5): scaffold chosen → ...`):

```markdown
- Vault (from question 5): scaffold chosen → copy `.claude/references/vault-scaffold/` to the target path, then in that copy's `system/pointer-block.md` replace `<ABSOLUTE_VAULT_PATH>` with the target's absolute path; paste that pointer block's fenced content into the repo `AGENTS.md` (the marked slot), filling `<project-name>`. Existing vault → just paste + fill its pointer block. Index Law already holds in the scaffold. Skipped → leave the `AGENTS.md` vault comment as-is.
```

with:

```markdown
- Vault (from `harness.json` `vault`): `scaffold` → copy `.claude/references/vault-scaffold/` to the chosen path; `existing` → use that vault. Either → ensure `projects/<name>/` exists there (copy `system/templates/project-template/` and register it in `projects/_index.md` if absent); replace `<ABSOLUTE_VAULT_PATH>` in the pointer block with the vault's absolute path and paste its fenced content into the repo `AGENTS.md` slot, filling `<project-name>`. Then WIRE THE ARCHITECT AGENT: confirm it resolves its KB — the pointer block is present in `AGENTS.md` and `projects/<name>/architecture.md` exists (the agent reads them). `none` → leave the `AGENTS.md` vault comment as-is; the architect agent falls back to a codebase scan. Index Law already holds in the scaffold.
```

- [ ] **Step 3: Verify the skill body budget**

Run: `node tools/context-ledger.mjs template`
Expected: `Status: OK`, no `!!HARD`, and `harness-init/SKILL.md` body **≤100 lines** (it was ~95; these are replace-in-place edits, roughly line-neutral). If it warns over 100, tighten the two replaced bullets — they must not grow the body past the soft cap.

- [ ] **Step 4: Confirm the wiring reads correctly**

Run: `grep -n 'harness.json.*vault\|architect agent\|vault.*architect' template/.claude/skills/harness-init/SKILL.md`
Expected: the interview line references `harness.json` `vault`, and the GENERATE bullet mentions wiring the architect agent.

- [ ] **Step 5: Run the suite and commit**

Run: `npm test` (green), then:

```bash
git add template/.claude/skills/harness-init/SKILL.md
git commit -m "feat(harness-init): wire the vault + architect agent off the recorded vault config"
```

---

## Phase exit criteria

Done when all hold:

1. `npm test` green, including the new `vault-config` suite and the architect-agent emit assertions.
2. `node tools/context-ledger.mjs template` OK, no `!!HARD`; `00-core.md` ≤45 lines; `AGENTS.md` ≤60; skill bodies ≤100.
3. `init` asks for the vault and records `{ mode, path }` in `harness.json` alongside `harness`; `update` preserves it.
4. `template/.claude/agents/architect-agent.md` exists and emits to `.codex/agents/architect-agent.toml` with no `model =` line.
5. `/evolve` has an `[vault: architecture]` RECORD row; `00-core` routes architecture to `architect-agent`.
6. `/harness-init` drives the vault step off `harness.json` and wires the agent, with graceful `none` degradation.

**Not in this phase:** the model tier map (Phase 3 still owns model keys in emitted config); enforcement hooks on Codex (Phase 2); the code/token-economy rules (their own design).
