---
ticket: ad-hoc
created: 2026-07-12
complexity: L
confidence: 8/10
tier: deep                # implementer hint (this plan's own vocabulary — see Task 2)
---

# Model tier map — role vocabulary, resolver, `/models` refresh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plans, rules, skills, and dispatches pin a **role** (`scout` | `build` | `deep`), never a
model name. Concrete model IDs live in exactly one file — `.claude/harness.json` → `models` — with a
`checkedAt` date, resolved per harness. The reviewer is derived, never pinned.

**Architecture:** A tiny CommonJS resolver (`cli/model-tiers.js`) is the single consumer of the map.
`emit-codex.js` calls it to write `model` / `model_reasoning_effort` into `.codex/agents/*.toml`.
`session-start.mjs` only date-compares `checkedAt` (no resolver needed — no dual-runtime duplication).
A new user-invoked `/models` skill re-verifies the map against live catalogs and proposes an update
ask-first.

**Tech Stack:** Node ≥18, no new npm deps. CommonJS in `cli/`, ESM (`.mjs`) in `.claude/hooks/`.

## The rule this plan encodes

| Role | For | Claude | Codex |
|---|---|---|---|
| `scout` | Reading files, locating, retrieval. **Never planning, never deciding.** | `haiku` | `gpt-5.6-luna` |
| `build` | Easy work the planner already specced out step by step | `sonnet` | `gpt-5.6-terra` |
| `deep` | Hard code, logic, architecture, planning, debugging | `opus` | `gpt-5.6-sol` |

**`review` is DERIVED, not pinned.** The reviewer is the *sibling* of whoever implemented, within the
same harness: `build`-written code → reviewed by `deep`; `deep`-written code → reviewed by `build`.
Different weights, uncorrelated blind spots. The reviewer always runs at `effort: xhigh`.

`scout` never implements, so it never has a reviewer; if a plan somehow pins `tier: scout` on an
implementation task, the reviewer resolves to `deep` (fail safe, not fail cheap).

## Global Constraints

- **No new npm deps.** Node stdlib only.
- **`harness.json` writes merge-preserve and THROW on malformed input** — it is shared (holds
  `harness`, `vault`, `stopGate`, `workTracking`). Mirror `cli/harness-targets.js:64-98` exactly:
  read degrades to `null`, write refuses with a thrown Error. Never clobber.
- **Any hook edit → `node template/.claude/hooks/smoke-test.mjs` green, with a NEW fixture for the
  new behaviour.** Non-negotiable (repo CLAUDE.md).
- **Ledger must not regress:** `node tools/context-ledger.mjs template` stays < 2000 est. tokens, no
  `!!HARD`, `00-core.md` ≤ 45 lines, skill bodies ≤ 100 lines. Baseline is 1629/2000 (81%).
  The new `/models` skill MUST carry `disable-model-invocation: true` — the ledger charges zero
  always-loaded tokens for such skills (`tools/context-ledger.mjs:88-90`), which is what keeps this
  phase inside the budget. Changes to `00-core.md` are **replacements**, not additions.
- **Verify CLI changes with `curl` shadowed** so `init`/`update` take the local-fallback path instead
  of fetching the published npm package — otherwise you are testing npm, not your branch.
- Every model fact in this plan was verified on 2026-07-12 against `openai/codex`'s
  `codex-rs/models-manager/models.json`, `developers.openai.com/api/docs/pricing`, and the installed
  `codex-cli 0.144.0` binary. Do not "correct" them from memory.

## Verified facts (2026-07-12) — the seed values

| Harness | Role | Model ID | in / cached-in / out per 1M | Effort levels |
|---|---|---|---|---|
| claude | scout | `haiku` (`claude-haiku-4-5`) | $1 / $0.10 / $5 | **none — the API rejects `effort` on Haiku 4.5** |
| claude | build | `sonnet` (`claude-sonnet-5`) | $3 / — / $15 ($2/$10 intro → 2026-08-31) | low·medium·high·xhigh·max |
| claude | deep | `opus` (`claude-opus-4-8`) | $5 / $0.50 / $25 | low·medium·high·xhigh·max |
| codex | scout | `gpt-5.6-luna` | $1 / $0.10 / $6 | low·medium·high·xhigh·max (**no `ultra`**) |
| codex | build | `gpt-5.6-terra` | $2.50 / $0.25 / $15 | low…max + `ultra` (default `medium`) |
| codex | deep | `gpt-5.6-sol` | $5 / $0.50 / $30 | low…max + `ultra` (default **`low`** — never inherit) |

- Claude Code's `haiku`/`sonnet`/`opus` aliases **float to the newest family member**. That is the
  "families are the stable abstraction" property, for free. Store the alias, not `claude-opus-4-8`.
- `gpt-5.6-sol` requires `codex >= 0.144.0` (`minimal_client_version` in models.json).
- Codex context window is **372,000** (models.json, all three 5.6 models).
- Live catalogs for `/models`: Codex → `https://chatgpt.com/backend-api/codex/models?client_version=<ver>`
  (`codex-rs/model-provider/src/models_endpoint.rs`); Anthropic → `GET /v1/models`.

### Claims we do NOT encode (they failed verification)

- ❌ **"Codex bills 2× input / 1.5× output on the whole request past 272K input tokens."** The
  `(<272K context length)` annotation appears on `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.4-pro`
  and on **no gpt-5.6 row**. 272,000 is the *context window* of the 5.4/5.5 generation, not a 5.6
  billing cliff. No `$45` output price exists anywhere in OpenAI's pricing payload. → goes in
  `docs/99` under "Claims we deliberately labeled as unverified", never into a budget or a rule.
- ❌ **"`ultra` is planner-only."** It is a real effort level on Sol and Terra; only Luna lacks it.

---

### Task 1: Verify the `.codex/agents/*.toml` schema (blocks everything downstream)

`cli/emit-codex.js` already writes `name` / `description` / `developer_instructions` into
`.codex/agents/<n>.toml` on an **unverified** schema inherited from the design doc. This plan is
about to add a `model` key there. If the schema is wrong, we are compounding a latent bug — so prove
it before building on it. `codex-cli 0.144.0` is installed locally; use it.

**Files:**
- Modify (only if the probe disproves the schema): `cli/emit-codex.js`
- Create: `reports/codex-agent-toml-schema.md` — the evidence

- [ ] **Step 1: Emit a real Codex payload into a scratch repo**

```bash
SCRATCH=$(mktemp -d)
cd "$SCRATCH" && git init -q && cd - >/dev/null
node -e '
  const { emitCodexPayload } = require("./cli/emit-codex.js");
  const fs = require("fs"), path = require("path");
  const root = process.argv[1];
  fs.cpSync("template/.claude", path.join(root, ".claude"), { recursive: true });
  console.log(emitCodexPayload(root));
' "$SCRATCH"
cat "$SCRATCH/.codex/agents/code-reviewer.toml"
```

Expected: a TOML file with `name`, `description`, `developer_instructions`.

- [ ] **Step 2: Ask Codex itself whether it accepts the file**

`deny_unknown_fields` is in play (the binary contains ``unknown field `` error strings), so an
unknown key is a hard error, not a silent ignore. Add a `model` key by hand and see if Codex loads it:

```bash
printf '\nmodel = "gpt-5.6-terra"\nmodel_reasoning_effort = "high"\n' >> "$SCRATCH/.codex/agents/code-reviewer.toml"
cd "$SCRATCH" && codex exec --skip-git-repo-check -m gpt-5.6-luna \
  'Reply with exactly: SCHEMA_OK' 2>&1 | tail -20
```

Expected (schema good): the run proceeds; no `unknown field` / `invalid agent` error.
Expected (schema bad): an explicit parse error naming the offending key — **record it verbatim**.

- [ ] **Step 3: Record the evidence**

Write `reports/codex-agent-toml-schema.md` with: the exact TOML emitted, the exact command run, the
exact output, and a one-line verdict — `model` and `model_reasoning_effort` are **accepted** /
**rejected** in `.codex/agents/*.toml`.

- [ ] **Step 4: Branch on the verdict**

- **Accepted** → no code change. Proceed to Task 2.
- **Rejected** → the per-agent model cannot live in the agent TOML. Fall back to `.codex/config.toml`
  (the binary confirms top-level `model`, `review_model`, and `model_reasoning_effort` keys in
  `ConfigToml`), and record in the report that per-agent model pinning is unavailable on Codex.
  Update Task 4's target file accordingly before starting it.

- [ ] **Step 5: Commit**

```bash
git add reports/codex-agent-toml-schema.md
git commit -m "test(codex): verify the .codex/agents TOML schema accepts model keys"
```

---

### Task 2: `cli/model-tiers.js` — the map, the resolver, the reviewer inversion

**Files:**
- Create: `cli/model-tiers.js`
- Create: `cli/model-tiers.test.js`
- Modify: `package.json` (add the test file to the test script if it enumerates files — check first)

**Interfaces:**
- Produces:
  - `ROLES` → `['scout', 'build', 'deep']`
  - `readModels(projectRoot)` → the `models` object, or `null` if absent/malformed
  - `writeModels(projectRoot, models)` → merge-preserve; **throws** on malformed `harness.json`
  - `resolveModel(models, harness, role)` → model-ID string; throws on unknown harness/role
  - `resolveReviewer(models, harness, implementerRole)` → model-ID string (the sibling)
  - `reviewerRoleFor(implementerRole)` → `'deep' | 'build'`
  - `isStale(checkedAt, maxDays, now)` → boolean
  - `DEFAULT_MODELS` → the seed map (the table above)

- [ ] **Step 1: Write the failing test**

Create `cli/model-tiers.test.js`. **This repo does not use Node's `assert` module or any test
framework** — it hand-rolls `assert(name, condition)` with `passed`/`failed` counters and exits
non-zero. Copy the runner from `cli/harness-targets.test.js` verbatim (its header, its `assert`, and
its `console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed > 0 ? 1 : 0)` tail).

```js
// cli/model-tiers.test.js
//
// Tests the role->model resolver and the reviewer-is-the-sibling rule.

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  DEFAULT_MODELS, readModels, writeModels,
  resolveModel, resolveReviewer, reviewerRoleFor, isStale,
} = require('./model-tiers');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}
function threw(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

// --- the reviewer inversion: the rule this whole phase exists to encode ---
assert('deep-written code is reviewed by build', reviewerRoleFor('deep') === 'build');
assert('build-written code is reviewed by deep', reviewerRoleFor('build') === 'deep');
assert('scout never implements — its reviewer fails SAFE, to deep', reviewerRoleFor('scout') === 'deep');

assert('opus-written code is reviewed by sonnet',
  resolveReviewer(DEFAULT_MODELS, 'claude', 'deep') === 'sonnet');
assert('sol-written code is reviewed by terra',
  resolveReviewer(DEFAULT_MODELS, 'codex', 'deep') === 'gpt-5.6-terra');
assert('sonnet-written code is reviewed by opus',
  resolveReviewer(DEFAULT_MODELS, 'claude', 'build') === 'opus');
assert('terra-written code is reviewed by sol',
  resolveReviewer(DEFAULT_MODELS, 'codex', 'build') === 'gpt-5.6-sol');

// The invariant behind the rule: a reviewer is NEVER the model that wrote the code.
assert('reviewer never equals the implementer, claude',
  resolveReviewer(DEFAULT_MODELS, 'claude', 'deep') !== resolveModel(DEFAULT_MODELS, 'claude', 'deep'));
assert('reviewer never equals the implementer, codex',
  resolveReviewer(DEFAULT_MODELS, 'codex', 'build') !== resolveModel(DEFAULT_MODELS, 'codex', 'build'));

// --- resolution ---
assert('scout resolves to haiku on claude', resolveModel(DEFAULT_MODELS, 'claude', 'scout') === 'haiku');
assert('deep resolves to sol on codex', resolveModel(DEFAULT_MODELS, 'codex', 'deep') === 'gpt-5.6-sol');
assert('an unknown role throws rather than silently picking a model',
  /unknown role/i.test(String(threw(function () { resolveModel(DEFAULT_MODELS, 'claude', 'reviewer'); }))));
assert('an unknown harness throws',
  /unknown harness/i.test(String(threw(function () { resolveModel(DEFAULT_MODELS, 'gemini', 'deep'); }))));

// --- staleness ---
var NOW = new Date('2026-07-12T00:00:00Z');
assert('a checkedAt older than maxDays is stale', isStale('2026-06-01', 30, NOW) === true);
assert('a fresh checkedAt is not stale', isStale('2026-07-01', 30, NOW) === false);
assert('a missing checkedAt is stale (never checked = needs checking)', isStale(undefined, 30, NOW) === true);
assert('an unparseable checkedAt is stale, never silently OK', isStale('not-a-date', 30, NOW) === true);

// --- the shared-file contract (harness.json also holds the stop gate) ---
var TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'phe-models-'));

var keep = path.join(TEST_DIR, 'keep');
fs.mkdirSync(path.join(keep, '.claude'), { recursive: true });
fs.writeFileSync(path.join(keep, '.claude', 'harness.json'),
  JSON.stringify({ stopGate: ['npm test'], vault: { mode: 'none' }, harness: ['claude'] }));
writeModels(keep, DEFAULT_MODELS);
var after = JSON.parse(fs.readFileSync(path.join(keep, '.claude', 'harness.json'), 'utf-8'));
assert('writeModels preserves the stop gate', JSON.stringify(after.stopGate) === '["npm test"]');
assert('writeModels preserves vault', after.vault && after.vault.mode === 'none');
assert('writeModels preserves harness targets', JSON.stringify(after.harness) === '["claude"]');
assert('writeModels writes the map', after.models.claude.deep === 'opus');

var bad = path.join(TEST_DIR, 'bad');
fs.mkdirSync(path.join(bad, '.claude'), { recursive: true });
fs.writeFileSync(path.join(bad, '.claude', 'harness.json'), '{ not json');
assert('writeModels REFUSES to write through a malformed harness.json',
  threw(function () { writeModels(bad, DEFAULT_MODELS); }) instanceof Error);
assert('readModels degrades to null on malformed harness.json (never crashes init)',
  readModels(bad) === null);

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node cli/model-tiers.test.js`
Expected: FAIL — `Cannot find module './model-tiers'`

- [ ] **Step 3: Implement `cli/model-tiers.js`**

```js
'use strict';

// The ONE file that names a model. Everything else — plans, rules, skills, dispatch
// prose, agent frontmatter — pins a ROLE, and this resolves it per harness.
//
// Why roles: model IDs churn (the gpt-5.6 Sol/Terra/Luna family landed 2026-07-09,
// two days before the design that needed it). A role survives the churn; an ID does not.
//
// Merge discipline mirrors harness-targets.js: harness.json is SHARED (stop gate,
// vault, work tracking), so a write preserves every other key and REFUSES (throws)
// rather than write through a harness.json it cannot parse.

const fs = require('fs');
const path = require('path');

// Implementer roles, weakest to strongest. `review` is deliberately NOT here — it is
// derived from who implemented (see reviewerRoleFor).
const ROLES = ['scout', 'build', 'deep'];

const HARNESSES = ['claude', 'codex'];

// Verified 2026-07-12 against openai/codex models.json + the installed codex-cli 0.144.0,
// and the Anthropic model reference. Claude values are ALIASES on purpose: Claude Code
// floats `opus`/`sonnet`/`haiku` to the newest family member, so they never need a bump.
// Codex has no alias mechanism, so its IDs are pinned and DO need /models to refresh them.
const DEFAULT_MODELS = {
  checkedAt: '2026-07-12',
  staleDays: 30,
  claude: { scout: 'haiku', build: 'sonnet', deep: 'opus' },
  codex: { scout: 'gpt-5.6-luna', build: 'gpt-5.6-terra', deep: 'gpt-5.6-sol' },
};

// THE RULE: the reviewer is the SIBLING of whoever implemented, same harness.
// deep wrote it -> build reviews it. build wrote it -> deep reviews it.
// Different weights catch different bugs; a model does not find the bug it just wrote.
//
// scout never implements. If a plan somehow pins it on an implementation task we fail
// SAFE (deep reviews) rather than fail cheap — a scout-grade reviewer is not a reviewer.
function reviewerRoleFor(implementerRole) {
  if (implementerRole === 'deep') return 'build';
  return 'deep'; // build -> deep; scout -> deep (fail safe)
}

function assertKnown(models, harness, role) {
  if (HARNESSES.indexOf(harness) === -1) {
    throw new Error('unknown harness: ' + harness + ' (expected one of ' + HARNESSES.join(', ') + ')');
  }
  if (ROLES.indexOf(role) === -1) {
    throw new Error(
      'unknown role: ' + role + ' (expected one of ' + ROLES.join(', ') + '). ' +
      '`review` is not a role — it is derived from the implementer via resolveReviewer().'
    );
  }
  if (!models || !models[harness] || !models[harness][role]) {
    throw new Error('no model mapped for ' + harness + '/' + role + ' in harness.json -> models');
  }
}

function resolveModel(models, harness, role) {
  assertKnown(models, harness, role);
  return models[harness][role];
}

function resolveReviewer(models, harness, implementerRole) {
  return resolveModel(models, harness, reviewerRoleFor(implementerRole));
}

function harnessJsonPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'harness.json');
}

// Reads must never crash init/update: degrade to null on anything unparseable.
function readModels(projectRoot) {
  var p = harnessJsonPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!parsed.models || typeof parsed.models !== 'object' || Array.isArray(parsed.models)) return null;
  return parsed.models;
}

// Writes REFUSE on malformed input — silently replacing a harness.json that also holds
// the user's stop gate would be strictly worse than failing loudly.
function writeModels(projectRoot, models) {
  var p = harnessJsonPath(projectRoot);
  var current = {};
  if (fs.existsSync(p)) {
    var parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      throw new Error(
        p + ' exists but is not valid JSON, so it cannot be safely updated ' +
        '(it may also hold your stop gate and work-tracking config). ' +
        'Fix the file by hand, then re-run this command.'
      );
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(
        p + ' exists but does not contain a JSON object, so it cannot be safely ' +
        'updated. Fix the file by hand, then re-run this command.'
      );
    }
    current = parsed;
  }
  current.models = models;
  var dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(current, null, 2) + '\n');
}

// Unknown, missing, or unparseable checkedAt is STALE. A map whose freshness we cannot
// establish is exactly the map that needs re-checking — never silently call it fresh.
function isStale(checkedAt, maxDays, now) {
  if (typeof checkedAt !== 'string') return true;
  var t = Date.parse(checkedAt);
  if (isNaN(t)) return true;
  var ref = (now instanceof Date ? now : new Date()).getTime();
  return (ref - t) > maxDays * 24 * 60 * 60 * 1000;
}

module.exports = {
  ROLES: ROLES,
  HARNESSES: HARNESSES,
  DEFAULT_MODELS: DEFAULT_MODELS,
  reviewerRoleFor: reviewerRoleFor,
  resolveModel: resolveModel,
  resolveReviewer: resolveReviewer,
  readModels: readModels,
  writeModels: writeModels,
  isStale: isStale,
};
```

- [ ] **Step 4: Run the tests to green**

Run: `node cli/model-tiers.test.js` → all PASS.
Run: `npm test` → still 87+ passed, 0 failed (nothing regressed).

- [ ] **Step 5: Commit**

```bash
git add cli/model-tiers.js cli/model-tiers.test.js
git commit -m "feat(models): role->model resolver with the reviewer-is-the-sibling rule"
```

---

### Task 3: Seed `models` into the shipped `template/.claude/harness.json`

**Files:**
- Modify: `template/.claude/harness.json`

**Interfaces:**
- Consumes: `DEFAULT_MODELS` (Task 2) — the shipped file must equal it byte-for-byte in content.

- [ ] **Step 1: Add the `models` block**

Append to the object in `template/.claude/harness.json` (keep every existing key; extend the
`$comment` with one clause about `models`):

```json
  "models": {
    "checkedAt": "2026-07-12",
    "staleDays": 30,
    "claude": { "scout": "haiku", "build": "sonnet", "deep": "opus" },
    "codex": { "scout": "gpt-5.6-luna", "build": "gpt-5.6-terra", "deep": "gpt-5.6-sol" }
  }
```

Extend the `$comment` string with:
`models maps ROLES (scout/build/deep) to model IDs per harness — the only file that names a model; /models re-verifies it and session-start warns when checkedAt is older than staleDays. review is NOT a role: the reviewer is the sibling of whoever implemented (deep<->build).`

- [ ] **Step 2: Assert the shipped file and the resolver agree**

Add to `cli/model-tiers.test.js`, above the `console.log(passed + ...)` tail (repo style — no
`test()`, no Node `assert` module):

```js
// Drift guard: the SHIPPED map and the resolver's DEFAULT_MODELS must never diverge.
// Without this, editing one and not the other ships a map the resolver disagrees with.
var shipped = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'template', '.claude', 'harness.json'), 'utf-8'));
assert('the shipped template harness.json models === DEFAULT_MODELS',
  JSON.stringify(shipped.models) === JSON.stringify(DEFAULT_MODELS));
```

`JSON.stringify` equality is key-order sensitive — that is deliberate here. Write the `models` block
in `harness.json` in exactly the key order `DEFAULT_MODELS` declares (`checkedAt`, `staleDays`,
`claude`, `codex`; and within each harness `scout`, `build`, `deep`), or this fails.

- [ ] **Step 3: Run**

Run: `node cli/model-tiers.test.js` → PASS. Run `npm test` → 0 failed.

- [ ] **Step 4: Commit**

```bash
git add template/.claude/harness.json cli/model-tiers.test.js
git commit -m "feat(models): ship the verified tier map in harness.json"
```

---

### Task 4: `emit-codex.js` — resolve `tier:` → `model`, AND register the agents so Codex can see them

**Task 1's verdict: ACCEPTED.** `model` / `model_reasoning_effort` do not trip a schema error in
`.codex/agents/*.toml` — `RawAgentRoleFileToml` deserializes as a generic serde map, which is
structurally incapable of `deny_unknown_fields`. The agent-TOML path is safe. Evidence:
`reports/codex-agent-toml-schema.md`.

**Task 1 also found a Phase-1 bug that this task must fix, or the whole phase is inert on Codex:**

> **Codex has no directory auto-scan of `.codex/agents/`.** An agent exists only if `.codex/config.toml`
> registers it with an `[agents.<name>]` block. PHE's `CODEX_CONFIG_TOML` emits only
> `[features] multi_agent = true` and `[agents] max_threads = 4` — **no per-agent blocks**. So all five
> generated agent files are unreachable today, and a `model` key inside them would be **dead config**.

Registering them is therefore not scope creep — it is the difference between this phase doing
something on Codex and doing nothing. Required keys per the binary's `AgentRoleToml`: `description`,
`config_file`, `nickname_candidates`.

⚠️ **Verify one thing before trusting the shape:** today's `[agents]` table holds `max_threads = 4`.
If `[agents]` is a map of *agent-name → AgentRoleToml*, then `max_threads` is being parsed as an agent
**named "max_threads"** — a live bug. Determine where `max_threads` actually belongs (the binary shows
it adjacent to `OrchestratorToml`, alongside `max_depth` / `job_max_runtime_seconds` /
`interrupt_message`) and place it correctly. Do not guess: probe the binary
(`/opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`)
and/or run Codex against an emitted config and read the error. Record what you established.

**Files:**
- Modify: `cli/emit-codex.js` (`agentMdToToml`, `CODEX_CONFIG_TOML` → a function, `emitCodexPayload`)
- Modify: `cli/emit-codex.test.js`

**Interfaces:**
- Consumes: `resolveModel` (Task 2); agent frontmatter `tier:` + `effort:` (Task 5)
- Produces: `.codex/agents/<n>.toml` carrying `model` and `model_reasoning_effort`

- [ ] **Step 1: Write the failing test**

`cli/emit-codex.test.js` currently imports only `{ agentMdToToml }`. Extend that import and add
`DEFAULT_MODELS`:

```js
const { agentMdToToml } = require('./emit-codex');
const { DEFAULT_MODELS } = require('./model-tiers');
```

Then add these cases, in the file's existing `assert(name, condition)` style (it uses the same
hand-rolled runner as `harness-targets.test.js` — do **not** introduce `test()` or Node's `assert`
module):

```js
// --- tier -> model resolution in the emitted Codex TOML ---
var scoutMd = [
  '---', 'name: scout', 'description: "d"', 'tier: scout', 'effort: medium', '---', 'body text',
].join('\n');
var scoutToml = agentMdToToml(scoutMd, 'scout', DEFAULT_MODELS);
assert('a scout-tier agent resolves to luna', scoutToml.indexOf('model = "gpt-5.6-luna"') !== -1);
assert('effort passes through to model_reasoning_effort',
  scoutToml.indexOf('model_reasoning_effort = "medium"') !== -1);
assert('no Claude alias ever reaches the Codex tree',
  scoutToml.indexOf('opus') === -1 && scoutToml.indexOf('sonnet') === -1 && scoutToml.indexOf('haiku') === -1);

var deepMd = ['---', 'name: architect-agent', 'description: "d"', 'tier: deep', '---', 'b'].join('\n');
assert('a deep-tier agent resolves to sol',
  agentMdToToml(deepMd, 'architect-agent', DEFAULT_MODELS).indexOf('model = "gpt-5.6-sol"') !== -1);

// luna is the ONE 5.6 model without `ultra` (models.json, verified 2026-07-12). Emitting it
// would fail at dispatch time, far from the file that caused it — so fail at emit instead.
var ultraMd = ['---', 'name: scout', 'description: "d"', 'tier: scout', 'effort: ultra', '---', 'b'].join('\n');
var ultraErr = null;
try { agentMdToToml(ultraMd, 'scout', DEFAULT_MODELS); } catch (e) { ultraErr = e; }
assert('ultra on a luna-backed agent throws at emit, naming the model',
  ultraErr instanceof Error && /ultra/i.test(ultraErr.message) && /luna/.test(ultraErr.message));

// code-reviewer has no tier: its model is chosen per dispatch (the sibling of the
// implementer). Emitting a fixed model here would reintroduce exactly the bug we removed.
var noTierMd = ['---', 'name: code-reviewer', 'description: "d"', '---', 'b'].join('\n');
assert('an agent with no tier: emits no model key rather than guessing one',
  agentMdToToml(noTierMd, 'code-reviewer', DEFAULT_MODELS).indexOf('model = ') === -1);
```

- [ ] **Step 2: Run to verify failure**

Run: `node cli/emit-codex.test.js`
Expected: FAIL — `agentMdToToml` takes 2 args and emits no `model`.

- [ ] **Step 3: Implement**

In `cli/emit-codex.js`, add the effort-capability guard and thread the map through:

```js
const { resolveModel } = require('./model-tiers');

// Verified 2026-07-12 (openai/codex models.json -> supported_reasoning_levels).
// luna is the ONLY 5.6 model without `ultra`; emitting it would be a runtime error
// at dispatch time, far from the file that caused it. Fail at emit instead.
const CODEX_EFFORTS = {
  'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6-terra': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
};

function agentMdToToml(mdText, fallbackName, models) {
  var parsed = parseFrontmatter(mdText);
  var name = parsed.fm.name || fallbackName;
  var description = parsed.fm.description || '';
  var body = parsed.body;

  if (!name) throw new Error('agentMdToToml: no name in frontmatter and no fallback name given');

  var lines = [
    '# ' + GENERATED_BY,
    '# Source: .claude/agents/' + name + '.md',
    '',
    'name = ' + tomlBasic(name),
    'description = ' + tomlBasic(description),
  ];

  // tier: is the canonical, harness-neutral pin. No tier -> no model key: Codex then
  // uses its own default, which beats us inventing one.
  var tier = parsed.fm.tier;
  if (tier && models) {
    var model = resolveModel(models, 'codex', tier);
    lines.push('model = ' + tomlBasic(model));

    var effort = parsed.fm.effort;
    if (effort) {
      var allowed = CODEX_EFFORTS[model];
      if (allowed && allowed.indexOf(effort) === -1) {
        throw new Error(
          '.claude/agents/' + name + '.md pins effort "' + effort + '", which ' + model +
          ' does not support (allowed: ' + allowed.join(', ') + '). ' +
          'Lower the effort or raise the tier.'
        );
      }
      lines.push('model_reasoning_effort = ' + tomlBasic(effort));
    }
  }

  lines.push('developer_instructions = ' + tomlMultiline(body), '');
  return lines.join('\n');
}
```

In `emitCodexPayload`, read the map once and pass it down:

```js
  // at the top of emitCodexPayload, alongside the other path setup:
  var models = require('./model-tiers').readModels(projectRoot) ||
               require('./model-tiers').DEFAULT_MODELS;
```
and change the agent loop's call to `agentMdToToml(md, stem, models)`.

- [ ] **Step 4: Register the agents in `.codex/config.toml` (without this, everything above is dead config)**

`CODEX_CONFIG_TOML` is currently a const string. Make it a function of the agents actually emitted, so
the registration can never drift from the files on disk. Collect `{name, description}` in the agent
loop (you already parse both), then build the config from that list.

Write a failing test first, in `cli/emit-codex.test.js` (repo style — `assert(name, cond)`):

```js
// Codex has NO directory auto-scan: an agent that config.toml does not register does not
// exist, and the model key we just wrote into its file is never read. Registration is what
// makes the tier map real on Codex.
var regRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phe-reg-'));
fs.cpSync('template/.claude', path.join(regRoot, '.claude'), { recursive: true });
emitCodexPayload(regRoot);
var cfg = fs.readFileSync(path.join(regRoot, '.codex', 'config.toml'), 'utf-8');
var emitted = fs.readdirSync(path.join(regRoot, '.codex', 'agents'))
  .filter(function (f) { return f.slice(-5) === '.toml'; })
  .map(function (f) { return f.slice(0, -5); });
assert('at least one agent was emitted', emitted.length >= 5);
for (var i = 0; i < emitted.length; i++) {
  assert('config.toml registers [agents.' + emitted[i] + ']',
    cfg.indexOf('[agents.' + emitted[i] + ']') !== -1);
  assert('the ' + emitted[i] + ' registration points at its file',
    cfg.indexOf('.codex/agents/' + emitted[i] + '.toml') !== -1);
}
assert('no agent file is left unregistered', emitted.length ===
  (cfg.match(/^\[agents\.[^\]]+\]/gm) || []).length);
```

Run `node cli/emit-codex.test.js` → these MUST fail before you write the emitter change.

Then emit a block per agent. Required keys (`AgentRoleToml`): `description`, `config_file`,
`nickname_candidates`. Shape:

```toml
[agents.code-reviewer]
description = "..."                            # from the agent's frontmatter
config_file = ".codex/agents/code-reviewer.toml"
nickname_candidates = ["code-reviewer"]
```

**Resolve the `max_threads` question here** (see the warning above the steps): if `[agents]` is a map
of agent-name → role, then today's `[agents] max_threads = 4` is registering a phantom agent called
`max_threads`. Establish where it belongs, move it, and write one comment in `emit-codex.js` recording
what you established and how. If you cannot establish it, leave `max_threads` OUT rather than emit a
key you know may be misparsed, and say so in your report — a missing tuning knob is recoverable, a
silently corrupt agent table is not.

- [ ] **Step 5: Run to green**

Run: `node cli/emit-codex.test.js` → PASS (including the registration cases).
Run: `npm test` → 0 failed.

- [ ] **Step 6: Commit**

```bash
git add cli/emit-codex.js cli/emit-codex.test.js
git commit -m "feat(codex): resolve agent tier -> model + effort, and register the agents in config.toml"
```

---

### Task 5: Agent files gain `tier:` (keeping the floating Claude alias)

Agent frontmatter carries **both**: `tier:` (canonical, read by the Codex emitter) and `model:` (the
Claude alias, which floats within its family and so never churns). Unknown keys are silently ignored
by both harnesses, so this is safe on each.

**Files:**
- Modify: `template/.claude/agents/{architect-agent,code-reviewer,qa-evaluator,research-gatherer,scout}.md`

**Interfaces:**
- Consumes: role vocabulary from Task 2. Produces: `tier:` keys read by Task 4's emitter.

- [ ] **Step 1: Add `tier:` to each agent, above the existing `model:` line**

| File | Add | Existing `model:` | Why |
|---|---|---|---|
| `scout.md` | `tier: build` | `model: sonnet` | Scout *synthesizes* ("how does X work") — that is `build`-grade reading, not `scout`-grade retrieval. The `scout` ROLE (haiku/luna) is the built-in Explore lane. Keep them distinct. |
| `research-gatherer.md` | `tier: build` | `model: sonnet` | Reads docs against an exact brief. |
| `architect-agent.md` | `tier: deep` | `model: opus` | Architecture. |
| `qa-evaluator.md` | `tier: deep` | `model: opus` | Runtime judgment. |
| `code-reviewer.md` | *(no `tier:`)* | **remove `model: opus`** | The reviewer is **derived per dispatch** from the plan's implementer tier. A fixed pin here would be exactly the bug this phase removes. Add the comment below instead. |

For `code-reviewer.md`, the frontmatter becomes:

```yaml
---
name: code-reviewer
description: "Reviews a diff against its plan and the repo's rules. Dispatched by /review; returns a machine-parseable verdict."
tools: Read, Grep, Glob, Bash
effort: xhigh
memory: project
---
```

and the body gains one line under the first heading:

```markdown
Your model is pinned by the dispatcher, never here: the reviewer is the SIBLING of whoever
implemented (deep-written code is reviewed by build, build-written by deep). A model does not find
the bug it just wrote. If you were dispatched without an explicit model, say so and stop.
```

- [ ] **Step 2: Verify the emitter now resolves every agent**

```bash
node -e '
  const { emitCodexPayload } = require("./cli/emit-codex.js");
  const fs = require("fs"), path = require("path"), os = require("os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phe-emit-"));
  fs.cpSync("template/.claude", path.join(root, ".claude"), { recursive: true });
  emitCodexPayload(root);
  for (const f of fs.readdirSync(path.join(root, ".codex", "agents"))) {
    const t = fs.readFileSync(path.join(root, ".codex", "agents", f), "utf-8");
    console.log(f, "->", (t.match(/^model = .*$/m) || ["(no model — code-reviewer is correct here)"])[0]);
  }
'
```

Expected: `architect-agent`/`qa-evaluator` → `gpt-5.6-sol`; `scout`/`research-gatherer` →
`gpt-5.6-terra`; `code-reviewer` → no model line.

- [ ] **Step 3: Full gate**

Run: `npm test` → 0 failed. Run: `node tools/context-ledger.mjs template` → still < 2000, no `!!HARD`.

- [ ] **Step 4: Commit**

```bash
git add template/.claude/agents/
git commit -m "feat(agents): pin tier: on every agent; code-reviewer's model is derived per dispatch"
```

---

### Task 6: De-leak the prose — roles replace model names

This is the defect the phase exists to fix: literal `model: opus` / `sonnet` prose lives in skill
bodies that the dual-emit copies verbatim into `.agents/skills/`, where those names mean **nothing**
to Codex. Replace with role vocabulary — that dissolves the leak at its source.

**Files (every line below is a REPLACEMENT — the line counts must not grow):**
- Modify: `template/.claude/rules/00-core.md` (lines 25-31) — **stays ≤ 45 lines**
- Modify: `template/.claude/references/dispatch-protocol.md` (lines 27-37)
- Modify: `template/.claude/references/plan-template.md` (line 12)
- Modify: `template/.claude/skills/plan/SKILL.md` (lines 48, 73)
- Modify: `template/.claude/skills/implement/SKILL.md` (line 47) — **body is at 100/100, do not grow**
- Modify: `template/.claude/skills/validate/SKILL.md` (line 56)
- Modify: `template/.claude/skills/review/SKILL.md` (line 21)
- Modify: `template/.claude/skills/accept/SKILL.md` (line 23)
- Modify: `template/.claude/skills/research/SKILL.md` (lines 28, 33)

- [ ] **Step 1: `00-core.md` — swap model names for roles in the Dispatch table**

```markdown
| Locate files / text / patterns | built-in Explore (`scout` tier; skips CLAUDE.md) |
| Understand / synthesize | `scout` agent (`build` tier) |
| Architecture — where new code goes / what a change touches, before a new module/route/table/endpoint | `architect-agent` (`deep`); reads the vault wiki, /evolve RECORDs back |
| Code review | `code-reviewer` — model is the SIBLING of the implementer's tier (deep↔build); never the same model that wrote the code |
```

and line 20's trailing sentence becomes:

```markdown
Every brief has four elements — objective · output format + size cap · tool guidance · boundaries — and pins `tier:` + `effort:`. Roles resolve via `.claude/harness.json` → `models`. Full protocol: `.claude/references/dispatch-protocol.md`.
```

- [ ] **Step 2: Verify 00-core is still ≤ 45 lines**

Run: `wc -l template/.claude/rules/00-core.md`
Expected: `45` or fewer. **If it grew, cut — do not proceed.**

- [ ] **Step 3: `dispatch-protocol.md` — rewrite the matrix (lines 25-37)**

```markdown
## Tier + effort matrix (pin both on every dispatch)

Roles, never model names. `.claude/harness.json` → `models` maps them per harness; `/models` refreshes it.

| Work | Dispatch | tier: | effort: |
|---|---|---|---|
| Locate/trace a symbol | `codebase-search` MCP (where_is/find_references/outline) if wired, else targeted grep — see symbol-navigation.md | — | — |
| Locate files / text | built-in Explore | `scout` | — |
| Understand / synthesize | `scout` agent | `build` | medium |
| Implement | general-purpose | per the plan's `tier:` hint | high |
| Code review | `code-reviewer` | **sibling of the implementer's tier** | xhigh |
| Runtime check | `qa-evaluator` | `deep` | high |
| Acceptance evidence pass | `qa-evaluator`; browser flows → global `tester-agent` | `deep` | high |

**The reviewer is never the model that wrote the code.** `deep`-written code is reviewed at `build`;
`build`-written code is reviewed at `deep`. Different weights find different bugs — a model does not
catch the mistake it just made. `/review` reads the plan's `tier:` and inverts it.

Per-invocation model beats agent frontmatter, which beats the session model. A dispatch that pins no
tier inherits the session model — a silent cost and quality bug.
```

- [ ] **Step 4: `plan-template.md` line 12 — the frontmatter hint becomes a tier**

```markdown
tier: deep                # implementer hint: `deep` (hard logic/architecture) | `build` (this plan already specs it out step by step). /review inverts this to pick the reviewer.
```

- [ ] **Step 5: The six skills — exact replacements**

`plan/SKILL.md:48` — replace `Pin \`model: sonnet\` and effort per` with:
`Pin \`tier: build\` and effort per`

`plan/SKILL.md:73` — replace the trailing clause with:
```
`tier:` implementer hint (`deep` default; `build` only when this plan already specifies the change step by step). /review inverts it to choose the reviewer, so an honest tier matters twice.
```

`implement/SKILL.md:47` — replace `pass \`model:\` explicitly per the plan's hint (default opus)` with
`pass the plan's \`tier:\` explicitly (default \`deep\`)`. **Verify the body is still ≤ 100 lines.**

`validate/SKILL.md:56` and `accept/SKILL.md:23` — replace `\`model: opus\`` with `\`tier: deep\``.

`review/SKILL.md:21` — replace the whole line with:
```
3. Pin the reviewer's model explicitly: it is the SIBLING of the plan's `tier:` (deep-written → review at `build`; build-written → review at `deep`), always at `effort: xhigh`. Never let the reviewer be the model that wrote the code — it does not find the bug it just made. No plan/tier? Default to `deep`.
```

`research/SKILL.md:28` — `## 3 · Gather (orchestrator directs, `build` tier gathers)`
`research/SKILL.md:33` — `and dispatch \`research-gatherer\` (\`build\` tier) to read official docs + web.`

- [ ] **Step 6: Prove the leak is gone**

```bash
grep -rniE '\b(opus|sonnet|haiku|fable|gpt-5|sol|terra|luna)\b' \
  template/.claude/skills/ template/.claude/rules/ template/.claude/references/ \
  --exclude-dir=vault-scaffold
```
Expected: **no matches.** (`template/.claude/agents/*.md` legitimately keeps the floating Claude
alias, and `harness.json` legitimately holds the map — neither is in the searched set.)

- [ ] **Step 7: Gate**

Run: `node tools/context-ledger.mjs template` → < 2000, no `!!HARD`, `00-core` ≤ 45, all skill bodies
≤ 100. Run: `npm test` → 0 failed.

- [ ] **Step 8: Commit**

```bash
git add template/.claude/rules template/.claude/references template/.claude/skills
git commit -m "fix(models): plans/rules/skills pin a ROLE, never a model name (fixes the Codex leak)"
```

---

### Task 7: `/models` refresh check + session-start staleness warning

**Files:**
- Create: `template/.claude/skills/models/SKILL.md`
- Modify: `template/.claude/hooks/session-start.mjs`
- Modify: `template/.claude/hooks/smoke-test.mjs` (NEW fixture — mandatory for any hook edit)

- [ ] **Step 1: Write the smoke-test fixture FIRST (it must fail)**

Fixtures are bare blocks that build a tmp dir, call `runHook(script, event)`, and `check(name, cond)`.
Add this **inside the `session-start.mjs` section** (after the "uninitialized template" block, before
the `check("survives malformed input", ...)` line at the end of that section):

```js
{
  // A model map nobody has re-checked is how a retired model ID stays in the dispatch
  // path long after the vendor pulled it. Staleness must be LOUD, at session start.
  const tmp = mkdtempSync(join(tmpdir(), "phe-models-stale-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    stopGate: [],
    models: { checkedAt: "2020-01-01", staleDays: 30, claude: { scout: "haiku", build: "sonnet", deep: "opus" } },
  }));
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("stale model map warns and names /models", res.code === 0 && ctx.includes("Model map is stale") && ctx.includes("/models"));

  // Fresh map: silent. A warning that fires every session is a warning nobody reads.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    stopGate: [],
    models: { checkedAt: new Date().toISOString().slice(0, 10), staleDays: 30, claude: { deep: "opus" } },
  }));
  const fresh = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let freshCtx = ""; try { freshCtx = JSON.parse(fresh.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: freshCtx stays "" */ }
  check("fresh model map emits no staleness warning", fresh.code === 0 && !freshCtx.includes("Model map is stale"));

  // No models key at all (an adopter who never ran /models): say nothing. Absent config
  // is not a stale map — nagging about a feature they never opted into is noise.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: [] }));
  const none = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let noneCtx = ""; try { noneCtx = JSON.parse(none.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: noneCtx stays "" */ }
  check("no models key emits no staleness warning", none.code === 0 && !noneCtx.includes("Model map is stale"));
}
```

Note the third case: it pins the "absent ≠ stale" behaviour the implementation must honour — the
`if (m && typeof m === "object")` guard in Step 3 is what makes it pass.

- [ ] **Step 2: Run the smoke test and watch the new fixtures fail**

Run: `node template/.claude/hooks/smoke-test.mjs`
Expected: **1 failure** — "stale model map warns and names /models". The two negative checks
(fresh map, absent map) pass trivially today because nothing is emitted at all; only the positive
check can fail before the code exists. If all three pass, the fixture is not exercising anything —
fix the fixture before writing the implementation.

- [ ] **Step 3: Implement the warning in `session-start.mjs`**

Inside the existing `try { const cfg = JSON.parse(...) }` block that already reads `harness.json`
(around line 71-73), after the stop-gate line, add:

```js
      // A model map nobody has re-checked in a month is how a retired ID gets dispatched.
      // Duplicated (not imported) from cli/model-tiers.js on purpose: hooks are ESM and must
      // stay dependency-free and copy-safe into any adopter repo. Keep the two in sync.
      const m = cfg.models;
      if (m && typeof m === "object") {
        const days = typeof m.staleDays === "number" ? m.staleDays : 30;
        const t = Date.parse(m.checkedAt ?? "");
        if (isNaN(t) || Date.now() - t > days * 864e5) {
          lines.push(`Model map is stale (checkedAt: ${m.checkedAt ?? "never"}) — run /models to re-verify against the live catalogs.`);
        }
      }
```

- [ ] **Step 4: Run to green**

Run: `node template/.claude/hooks/smoke-test.mjs`
Expected: **90 passed, 0 failed** (87 baseline + the 3 new fixtures).

- [ ] **Step 5: Write the `/models` skill**

Create `template/.claude/skills/models/SKILL.md`. **`disable-model-invocation: true` is mandatory** —
it is what keeps the always-loaded ledger at zero cost for this skill, and a model must never
silently re-price the harness on its own.

```markdown
---
name: models
description: "Re-verify .claude/harness.json -> models against the live model catalogs and propose an update, ask-first. Run when session-start says the map is stale, or after a vendor ships a new model family."
disable-model-invocation: true
allowed-tools: Read, Edit, WebFetch, Bash
---

# /models — refresh the tier map

The map in `.claude/harness.json` → `models` is the ONE place a model is named. Everything else pins
a role (`scout` | `build` | `deep`). This command re-verifies the map and **proposes** a diff. It
never writes without a yes.

## 1 · Read the current map

Read `.claude/harness.json` → `models`. Note `checkedAt`.

## 2 · Fetch both live catalogs

| Harness | Source | Why this one |
|---|---|---|
| Codex | `https://chatgpt.com/backend-api/codex/models?client_version=<installed>` | Codex's own catalog endpoint (`codex-rs/model-provider/src/models_endpoint.rs`); it is what the CLI itself reads. Get the version from `codex --version`. |
| Claude | `GET https://api.anthropic.com/v1/models` | The live Models API. Requires auth — if it 401s, fall back to the published model reference and SAY you did. |

If a fetch fails, say so plainly and do not touch that harness's half of the map. A half-verified map
recorded as fully verified is worse than a stale one.

## 3 · Diff against the roles

For each harness, check that every role still maps to a live model, and whether a **newer member of
the same family** has shipped:

- `scout` — cheapest reading tier. Never a model that has to decide anything.
- `build` — spec-following implementation. The planner already made the judgment calls.
- `deep` — hard logic, architecture, planning.

On Claude, prefer the **family alias** (`opus`, `sonnet`, `haiku`) over a pinned ID: aliases float to
the newest family member on their own, so they need no maintenance. Only pin an ID if the alias is
gone. On Codex there are no aliases — its IDs are pinned and are the real reason this command exists.

Also re-check the **effort ceilings**: as of 2026-07-12 `gpt-5.6-luna` is the one 5.6 model with no
`ultra`. `cli/emit-codex.js` → `CODEX_EFFORTS` encodes that and will throw at emit if it drifts —
update it in the same change.

## 4 · Propose, then ask

Show a table: role · harness · current · proposed · why. Then **ask**. On yes:

- update `models` (merge-preserve — never rewrite `harness.json` wholesale; it also holds the stop
  gate, vault, and work-tracking config),
- set `checkedAt` to today,
- update `CODEX_EFFORTS` in `cli/emit-codex.js` if a ceiling moved,
- re-run `npm test` and report the real output.

On no: change nothing, and do not touch `checkedAt` — an unchanged map that was checked is still
stale until the user accepts the check.

## 5 · Reviewer rule (unchanged by any refresh)

The reviewer is the **sibling** of whoever implemented — `deep`-written code is reviewed at `build`,
`build`-written at `deep`, always `effort: xhigh`. A refresh may change *which model* a tier names; it
never changes this inversion. If a proposed map would make `build` and `deep` the same model, REFUSE
it — the reviewer would then be the model that wrote the code.
```

- [ ] **Step 6: Gate**

Run: `node tools/context-ledger.mjs template`
Expected: TOTAL **unchanged at 1629** (the new skill is `disable-model-invocation: true`, so it costs
zero always-loaded tokens) and its body ≤ 100 lines.
Run: `node template/.claude/hooks/smoke-test.mjs` → 89 passed, 0 failed.
Run: `npm test` → 0 failed.

- [ ] **Step 7: Commit**

```bash
git add template/.claude/skills/models template/.claude/hooks/session-start.mjs template/.claude/hooks/smoke-test.mjs
git commit -m "feat(models): /models refresh check + stale-map warning at session start"
```

---

### Task 8: `docs/04` rewrite + `docs/99` sources

**Files:**
- Modify: `docs/04-model-policy.md` (currently 59 lines; ≤ 130 is the review guideline)
- Modify: `docs/99-sources.md`

- [ ] **Step 1: Rewrite `docs/04`'s routing matrix and reviewer rule**

Replace the `## Routing matrix` and `## Rules` sections. The **"Never downgrade a reviewer"** rule is
**deliberately superseded** — say so explicitly, so the change reads as a decision and not as rot:

```markdown
## Roles, not models

| Role | Route here | Never here |
|---|---|---|
| `scout` | Pure retrieval: find files, fetch, list, extract into a given schema | Anything needing a decision the prompt did not pre-make. **Never planning.** |
| `build` | Implementation the planner already specified step by step; mechanical transforms; read-only verification | Work whose design is still open |
| `deep` | Hard code, logic, architecture, planning, debugging | — |

Concrete IDs live in **one** file: `.claude/harness.json` → `models`, with a `checkedAt`. `/models`
re-verifies it against the live catalogs; session-start warns past `staleDays`. Model IDs churn — the
gpt-5.6 family landed two days before the design that needed it. A role survives that; an ID does not.

## The reviewer is the sibling, never the author

`deep`-written code is reviewed at `build`. `build`-written code is reviewed at `deep`. Always at
`effort: xhigh`. **A model does not find the bug it just wrote** — different weights fail differently,
and that difference is the entire value of a review.

> **This supersedes the old "never downgrade a reviewer" rule.** That rule optimized for reviewer
> *capability*; this one optimizes for reviewer *independence*. Sonnet reviewing Opus is a downgrade
> in raw capability and we are taking it on purpose, buying back the gap with `xhigh` effort. The
> failure it prevents — a model rubber-stamping its own reasoning — is the one we actually kept hitting.

## Three cost rules

1. **Read-heavy work swaps the MODEL, not the effort.** Effort scales *reasoning* (output) tokens; a
   scan is ~95% input. Sol at `low` still bills $5/1M input; Luna at `high` bills $1. *Sol-at-low is
   never the correct scout.* Same on Claude: Opus-at-low is not a cheap Haiku.
2. **Keep requests small — but not because of a cliff.** Codex's gpt-5.6 window is **372K**. The
   widely repeated "2× input / 1.5× output past 272K" surcharge **does not appear on any gpt-5.6
   pricing row** — 272K is the *context window* of the older 5.4/5.5 generation, not a 5.6 billing
   threshold (see `docs/99`). Fan out and `/handoff` because big contexts cost money and degrade
   attention, not because of a phantom cliff.
3. **Do not compare headline $/token across vendors.** Anthropic's newer tokenizer (Opus 4.7+,
   Sonnet 5, Fable 5) emits **~30% more tokens for the same text**, so a naive $/token comparison
   understates its real cost. Compare cost-per-task, measured.

## Effort is a separate axis — pin it, never inherit it

Codex's own default effort is **contradictory across its docs and its shipping catalog** (`gpt-5.6-sol`
defaults to `low` in models.json while the docs say `medium`). Never inherit; always pin.
Ceilings as of 2026-07-12: `gpt-5.6-luna` is the one 5.6 model **without `ultra`**; Claude's
Haiku 4.5 rejects the `effort` parameter entirely.
```

Keep the existing `## Cost sanity` and `## The security-framing gotcha` sections as they are.

- [ ] **Step 2: Add the sources + the refuted claim to `docs/99`**

Under the sources list, add a `## Model policy (verified 2026-07-12)` section citing:
`openai/codex` → `codex-rs/models-manager/models.json` (IDs, `context_window: 372000`,
`supported_reasoning_levels`), `codex-rs/model-provider/src/models_endpoint.rs` (the catalog
endpoint), `developers.openai.com/api/docs/pricing`, the installed `codex-cli 0.144.0` binary, and
Anthropic's model reference.

Then add a row to the existing **"Claims we deliberately labeled as unverified"** table:

```markdown
| Codex bills 2× input / 1.5× output on the whole request past 272K input tokens | The `(<272K context length)` annotation appears on gpt-5.5/5.5-pro/5.4/5.4-pro rows and on NO gpt-5.6 row; 272K is the 5.4/5.5 *context window*, not a 5.6 billing threshold. No $45 output price exists in OpenAI's pricing payload. Widely repeated by third-party blogs; not in OpenAI's own data. Do not budget against it. |
```

- [ ] **Step 3: Verify**

Run: `wc -l docs/04-model-policy.md` → ≤ 130.
Run: `npm test` → 0 failed. Run: `node tools/context-ledger.mjs template` → unchanged.

- [ ] **Step 4: Commit**

```bash
git add docs/04-model-policy.md docs/99-sources.md
git commit -m "docs(04): roles over models, the sibling-reviewer rule, three cost rules"
```

---

## Final verification (before any merge)

- [ ] `node template/.claude/hooks/smoke-test.mjs` → **90 passed, 0 failed**
- [ ] `npm test` → **0 failed** (87 baseline + the new model-tiers and emit-codex cases)
- [ ] `node tools/context-ledger.mjs template` → **< 2000**, no `!!HARD`, `00-core` ≤ 45 lines, every
      skill body ≤ 100 lines
- [ ] The leak grep from Task 6 Step 6 returns **no matches**
- [ ] A real `init` against a scratch repo with **curl shadowed** (forcing the local-fallback path —
      otherwise you are testing the published npm package, not this branch) produces
      `.codex/agents/*.toml` carrying the resolved `model` keys:

```bash
SCRATCH=$(mktemp -d) && cd "$SCRATCH" && git init -q
PATH="$(mktemp -d):$PATH"  # shadow curl so init cannot fetch the published package
printf '#!/bin/sh\nexit 1\n' > "$(dirname "$(command -v curl)")/curl" 2>/dev/null || true
node /Users/cristian-robertiosef/Dev/perfectHarnessEngineering/cli/index.js init <<< 'both'
grep -h '^model' .codex/agents/*.toml
```
Expected: `gpt-5.6-sol` for architect-agent/qa-evaluator, `gpt-5.6-terra` for scout/research-gatherer,
and **no** `model` line for code-reviewer.

- [ ] Re-running `init` is idempotent; existing files still back up as `.backup`
