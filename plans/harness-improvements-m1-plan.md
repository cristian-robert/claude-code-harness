---
ticket: ad-hoc
created: 2026-09-05
complexity: L
confidence: 8/10
tier: deep
---

# Harness improvements, milestone 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the six Tier 1 items of the deep analysis plus the operator's directive that `/evolve` runs after validation and before any push or merge: the framework runs under its own harness, the platform-drift facts are corrected and guarded, the stop gate cannot be disarmed by editing its config, contract claims come from raw docs, the handoff trigger is a number, and gate output stays out of the context window.

**Architecture:** Every change lands in the shipped payload (`template/`) or the CLI, with a test that exercises the behaviour, then a sync script copies the payload into this repo's root so the same hooks, rules and skills govern the sessions that edit them. Prose changes edit existing lines in place to hold the budgets; executable logic goes into tested `.mjs` files, never skill bodies (ADR-021).

**Tech Stack:** Node ≥18, zero dependencies, ESM for hooks/tools, CommonJS for `cli/`, the repo's ad-hoc `check()`/`test()` runners.

**Spec:** `reports/2026-09-05-harness-deep-analysis.md` — sections 1.2, 1.3, 2.1–2.4, 5.1, 6.1, 6.2 and the Tier 1 roadmap; operator directive 2026-09-05 (mid-session): "an evolve should happen after validate (before push and merge pr)" → Task 7.

## Global Constraints

- Budgets, measured by `node tools/context-ledger.mjs <dir>`: template `CLAUDE.md` ≤60 lines, each rule ≤45, skill body ≤100, reference ≤160; docs ≤130 as a review guideline; aggregate ≤2000 est. tokens.
- Every new rule line ends with `(traces to: <incident>)`; adding means cutting.
- Any edit under `template/.claude/hooks/` → `node template/.claude/hooks/smoke-test.mjs` green, with a new fixture per new behaviour.
- Platform claims are verified against the raw docs page (`https://code.claude.com/docs/en/<page>.md`), never a summarized fetch.
- Hooks stay dependency-free, exec-form, fail-open (ADR-006, ADR-007).
- Commits are conventional (`feat:` / `fix:` / `docs:` / `chore:`); never on `main`. This plan executes on the existing branch `fix/autonomous-single-activation-path` or a child of it.
- After Task 1, every template edit is followed by `node tools/self-harness.mjs` before the turn ends — the root stop gate fails on drift.

---

## Context

- Knowledge to load first: LOCAL: `none — this repo's knowledge base is the vault (root CLAUDE.md, "Knowledge Vault")` · SHARED: `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (ADR-005, 006, 007, 021, 023), `~/Dev/The Vault/wiki/checks-that-cannot-fail.md`, `~/Dev/The Vault/agent-kb/patterns/executable-logic-never-in-prose.md`.
- Read first: `template/.claude/hooks/smoke-test.mjs:16-27` (the `runHook` runner; Task 2 extends it with an env argument) and `:401-452` (the tamper fixtures Task 3 must keep green); `template/.claude/hooks/stop-gate.mjs:470-476` (the empty-gate early exit Task 3 moves behind the new check); `cli/backup-copy.js:137-200` (`backupAndCopy(sourceDir, targetDir, projectRoot)` — directories only, skips `harness.json` and `settings.local.json`); `cli/harness-config.js:198-214` (`installHarnessConfig(projectRoot, templateHarnessPath)` → `{created, updated, notices}`); `cli/harness-targets.js:95-146` (`writeHarnessTargets(projectRoot, targets)`).
- Pattern to follow: `cli/update-harness-config.test.js` — the CJS test shape (`test(name, fn)`, temp dirs, `process.exitCode = 1` on failure); `smoke-test.mjs` fixtures — `check(name, cond)` with a temp repo per fixture.
- Library versions: none (zero-dependency repo). Claude Code contract read 2026-09-05 from `hooks.md`, `sub-agents`, `statusline.md`, CHANGELOG 2.1.243–2.1.261.
- Measured 2026-09-05: `node template/.claude/hooks/smoke-test.mjs` 3s; `cli/skill-preview-guards.test.js`, `cli/migrations.test.js`, `cli/harness-targets.test.js` <1s each — all inside the 30s per-command gate cap.

## Out of scope

- Tier 2 and Tier 3 of the analysis (citation anchors, plan-confidence rubric, decisions-taken-unasked line, `/evolve` reading `/skill-doctor` and MEMORY.md deltas, review follow-ups M2/M3/M6, token-based skill ledger, docs in the ledger, migrations-in-CLI rule, `InstructionsLoaded` runtime ledger, `/verify` ablation, HTML-comment traces, Codex rules gap). Each gets its own milestone plan when its turn comes; the `Wave`-free ordering here keeps this plan reviewable in one pass.
- Arming `stopGateTamperPaths` at the root — opt-in by doctrine; revisit after a month of the root gate.
- Re-running `/harness-init` at the root: the two knowledge skills and the paths-scoped rules are left as shipped (harmless here); AGENTS.md is written by hand in Task 1.
- Releasing: the version stays 3.3.0 on this branch; whether Tier 1 ships in 3.3.0 or 3.4.0 is the operator's call at merge time.

## Tasks

### Task 1: The framework runs under its own harness

**Files:**
- Create: `tools/self-harness.mjs`
- Create: `cli/self-harness.test.js`
- Create: `AGENTS.md` (root)
- Modify: `CLAUDE.md` (root) → the import shim
- Create: `.claude/harness.json` (root)
- Modify: `package.json` (`scripts`, `test`)
- Generated by the sync: `.claude/{hooks,rules,skills,agents,references,tooling}/`, `.claude/settings.json`, `.claude/statusline.mjs`, `.claude/capabilities.json`

**Interfaces:**
- Produces: `node tools/self-harness.mjs [--root <dir>] [--template <dir>]` (sync; exit 0) and `node tools/self-harness.mjs --check [...]` (exit 1 on drift, listing `missing`/`differs` paths). Later tasks run the sync after every template edit.

- [ ] **Step 1: Write the failing test**

Create `cli/self-harness.test.js`:

```js
#!/usr/bin/env node
'use strict';
// tools/self-harness.mjs: the framework repo runs under its own payload. Sync copies
// template/.claude -> <root>/.claude through the CLI's own backupAndCopy; --check fails on
// drift so the root stop gate forces a re-sync after every template edit. Two skills are
// project content (filled per project) and are copied once, never re-synced.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = path.join(REPO, 'tools', 'self-harness.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'self-harness-'));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args, cwd) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
// A miniature template: one hook, one rule, one pipeline skill, one adapted skill, settings.
function makeTemplate(dir) {
  fs.mkdirSync(path.join(dir, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'rules'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'validate'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'architecture-map'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hooks', 'guard.mjs'), 'console.log("v1")\n');
  fs.writeFileSync(path.join(dir, 'rules', '00-core.md'), '# core v1\n');
  fs.writeFileSync(path.join(dir, 'skills', 'validate', 'SKILL.md'), '---\nname: validate\n---\nv1\n');
  fs.writeFileSync(path.join(dir, 'skills', 'architecture-map', 'SKILL.md'), '---\nname: architecture-map\n---\n<placeholder>\n');
  fs.writeFileSync(path.join(dir, 'settings.json'), '{"hooks":{}}\n');
  fs.writeFileSync(path.join(dir, 'settings.local.json'), '{"personal":true}\n');
  fs.writeFileSync(path.join(dir, 'harness.json'), JSON.stringify({ $comment: 'shipped', stopGate: [], baseBranch: null }) + '\n');
}

console.log('\nself-harness: root runs the payload\n');

const tpl = path.join(TMP, 'template', '.claude');
makeTemplate(tpl);
const root = path.join(TMP, 'root');
fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
fs.writeFileSync(path.join(root, '.claude', 'harness.json'), JSON.stringify({ stopGate: ['node x.mjs'], harness: ['claude'] }) + '\n');
const args = ['--root', root, '--template', tpl];

test('fresh sync copies the payload and keeps the root harness.json keys', () => {
  const r = run(args, root);
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude', 'hooks', 'guard.mjs'), 'utf-8'), 'console.log("v1")\n');
  assert.ok(fs.existsSync(path.join(root, '.claude', 'skills', 'architecture-map', 'SKILL.md')), 'adapted skill copied on first sync');
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'settings.local.json')), 'settings.local.json never shipped');
  const h = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'harness.json'), 'utf-8'));
  assert.deepStrictEqual(h.stopGate, ['node x.mjs'], 'root stopGate overwritten');
  assert.strictEqual(h.$comment, 'shipped', 'template $comment not merged in');
  assert.deepStrictEqual(h.harness, ['claude']);
});

test('--check passes right after a sync', () => {
  const r = run(args.concat('--check'), root);
  assert.strictEqual(r.code, 0, r.out);
});

test('--check fails and names the file when the template moves on', () => {
  fs.writeFileSync(path.join(tpl, 'hooks', 'guard.mjs'), 'console.log("v2")\n');
  const r = run(args.concat('--check'), root);
  assert.strictEqual(r.code, 1, 'drift must exit 1');
  assert.ok(/differs\s+hooks\/guard\.mjs/.test(r.out), 'must name hooks/guard.mjs, got: ' + r.out);
});

test('re-sync heals the drift and leaves the adapted skill alone', () => {
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'architecture-map', 'SKILL.md'), '---\nname: architecture-map\n---\nfilled for THIS repo\n');
  const r = run(args, root);
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude', 'hooks', 'guard.mjs'), 'utf-8'), 'console.log("v2")\n');
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude', 'skills', 'architecture-map', 'SKILL.md'), 'utf-8'), '---\nname: architecture-map\n---\nfilled for THIS repo\n', 'adapted skill was re-synced');
  assert.strictEqual(run(args.concat('--check'), root).code, 0, '--check red after a sync');
});

test('--check reports a file the root lacks as missing', () => {
  fs.unlinkSync(path.join(root, '.claude', 'rules', '00-core.md'));
  const r = run(args.concat('--check'), root);
  assert.strictEqual(r.code, 1);
  assert.ok(/missing\s+rules\/00-core\.md/.test(r.out), r.out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node cli/self-harness.test.js`
Expected: 5 FAIL lines (script missing: `Cannot find module`), `0 passed, 5 failed`, exit 1.

- [ ] **Step 3: Write the script**

Create `tools/self-harness.mjs`:

```js
#!/usr/bin/env node
// self-harness: this framework repo runs under its own payload. Sync copies
// template/.claude -> <root>/.claude through the SAME backupAndCopy the CLI uses
// (symlinks refused, settings.local.json and harness.json never copied); harness.json
// is merged so the root's stop gate survives; two skills are project content and are
// copied once, never re-synced. `--check` exits 1 on drift and is a root stop-gate
// command, so a template edit cannot end a turn until the root matches it.
// Traces to: 2026-09-05 — the repo ran with no guard, no gate, no pipeline skills.
//   node tools/self-harness.mjs [--check] [--root <dir>] [--template <dir>]
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { backupAndCopy, preserveBeforeOverwrite } = require("../cli/backup-copy.js");
const { installHarnessConfig } = require("../cli/harness-config.js");
const { writeHarnessTargets } = require("../cli/harness-targets.js");

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null; };
const CHECK = argv.includes("--check");
const ROOT = resolve(flag("--root") || REPO);
const TEMPLATE = resolve(flag("--template") || join(REPO, "template", ".claude"));
const DEST = join(ROOT, ".claude");

// Project content by design — filled per project like AGENTS.md. Copied once, then owned by the root.
const ADAPTED = ["skills/architecture-map", "skills/debugging-this-repo"];
const NEVER = new Set(["harness.json", "settings.local.json"]);

function files(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink() || NEVER.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, base, out);
    else if (e.isFile()) out.push(relative(base, p));
  }
  return out;
}

function drift() {
  const out = [];
  for (const f of files(TEMPLATE)) {
    if (ADAPTED.some((a) => f.startsWith(a + "/"))) continue;
    const dest = join(DEST, f);
    if (!existsSync(dest)) out.push(`missing  ${f}`);
    else if (!readFileSync(join(TEMPLATE, f)).equals(readFileSync(dest))) out.push(`differs  ${f}`);
  }
  return out;
}

function sync() {
  const stats = { created: 0, updated: 0, backedUp: 0 };
  const add = (s) => { stats.created += s.created; stats.updated += s.updated; stats.backedUp += s.backedUp; };
  mkdirSync(DEST, { recursive: true });
  for (const e of readdirSync(TEMPLATE, { withFileTypes: true })) {
    if (e.isSymbolicLink() || NEVER.has(e.name)) continue;
    const src = join(TEMPLATE, e.name), dest = join(DEST, e.name);
    if (e.isDirectory() && e.name === "skills") {
      for (const s of readdirSync(src, { withFileTypes: true })) {
        if (!s.isDirectory()) continue;
        const adapted = ADAPTED.includes(`skills/${s.name}`);
        if (adapted && existsSync(join(dest, s.name, "SKILL.md"))) continue;
        add(backupAndCopy(join(src, s.name), join(dest, s.name), ROOT));
      }
    } else if (e.isDirectory()) {
      add(backupAndCopy(src, dest, ROOT));
    } else if (e.isFile()) {
      if (existsSync(dest)) {
        if (preserveBeforeOverwrite(dest, src, relative(ROOT, dest)).backedUp) stats.backedUp++;
        stats.updated++;
      } else stats.created++;
      copyFileSync(src, dest);
    }
  }
  const delta = installHarnessConfig(ROOT, join(TEMPLATE, "harness.json"));
  for (const n of delta.notices) console.log(n);
  writeHarnessTargets(ROOT, ["claude"]);
  console.log(`self-harness: synced ${TEMPLATE} -> ${DEST} · created ${stats.created} · updated ${stats.updated} · backed up ${stats.backedUp}`);
}

if (CHECK) {
  const d = drift();
  if (d.length) {
    console.error(`self-harness: root .claude/ drifts from the template (${d.length}):\n  ${d.join("\n  ")}\nRun: node tools/self-harness.mjs`);
    process.exit(1);
  }
  console.log("self-harness: root .claude/ matches template/.claude/");
} else {
  sync();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node cli/self-harness.test.js`
Expected: `5 passed, 0 failed`. If `preserveBeforeOverwrite` is not exported by `cli/backup-copy.js`, check `module.exports` at `cli/backup-copy.js:282` and export it — `cli/update.js:9` already imports it, so it should be present.

- [ ] **Step 5: Wire the test and the scripts**

In `package.json`, add to `scripts`:

```json
"harness:sync": "node tools/self-harness.mjs",
"harness:check": "node tools/self-harness.mjs --check",
"test:self-harness": "node cli/self-harness.test.js",
```

and append ` && node cli/self-harness.test.js` to the end of the `test` script (after `node cli/capabilities.test.js`). Also add `"tools/self-harness.mjs"` to the `files` array so the published package can run it (it is harmless there).

- [ ] **Step 6: Write the root harness config**

Create `.claude/harness.json` at the repo root (the sync merges the template's remaining keys into it):

```json
{
  "stopGate": [
    "node tools/self-harness.mjs --check",
    "node template/.claude/hooks/smoke-test.mjs",
    "node cli/skill-preview-guards.test.js"
  ],
  "stopGateTimeoutSec": 30,
  "stopGateTotalSec": 75,
  "stopGateTamperPaths": [],
  "baseBranch": null,
  "requireEvolveBeforePush": true,
  "workTracking": { "backend": "none", "method": "kanban", "wipLimit": 3 },
  "knowledge": {
    "local": "knowledge-base",
    "shared": { "mode": "existing", "path": "/Users/cristian-robertiosef/Dev/The Vault" },
    "migratedAt": null
  },
  "harness": ["claude"]
}
```

- [ ] **Step 7: Write AGENTS.md from the current CLAUDE.md, then the shim**

Create `AGENTS.md` (root) with this content — the current `CLAUDE.md` body, plus the Pipeline table and the sync row, so the installed skills find their Commands table:

```markdown
# Perfect Harness Engineering (PHE)

Framework repo: the harness-engineering framework for Claude Code lives here. `template/` is the shippable payload; `docs/` is the discipline; the three coleam00 clones are read-only reference material. **This repo runs under its own payload:** root `.claude/` is a synced copy of `template/.claude/` — edit the template, then `node tools/self-harness.mjs`; the stop gate fails on drift.

## Knowledge Vault

This project's knowledge base lives in the unified Obsidian vault at:
`~/Dev/The Vault/`

**Before architecture, design, or planning work, navigate the vault** (3–4 reads, any vault size):
1. Read `~/Dev/The Vault/CLAUDE.md` — vault conventions.
2. Read `~/Dev/The Vault/_index.md` — vault map.
3. Read `~/Dev/The Vault/projects/perfectHarnessEngineering/_index.md` — THIS project's wiki (START HERE), then its `architecture.md`, `decisions.md`, `resources.md`, `runbook.md` as needed.
4. Read the specific file you need.

**Reusable knowledge** beyond this project:
- `~/Dev/The Vault/wiki/` — cross-project engineering knowledge.
- `~/Dev/The Vault/agent-kb/` — AI-agent building know-how (prompts, evals, models, patterns, tooling).

**Write back:** when a decision, architecture change, or reusable lesson emerges, record it in the vault (this project's wiki, or `wiki/`/`agent-kb/` if it generalizes) — and follow the vault's Index Law: any folder you create or whose contents you change, create/update its `_index.md` in the same change.

## Commands

| Task | Command |
|---|---|
| Hook smoke tests | `node template/.claude/hooks/smoke-test.mjs` |
| Full suite (CLI + hooks) | `npm test` |
| Context ledger (self-check on template/) | `node tools/context-ledger.mjs template` |
| Root harness sync · drift check | `node tools/self-harness.mjs` · `node tools/self-harness.mjs --check` |
| Loop driver dry run | `node loop/loop.mjs --dry-run` |

## Pipeline (PIV+E)

| Stage | Command | Writes to disk |
|---|---|---|
| Plan | `/plan-work <brain dump>` | `plans/<slug>-plan.md` |
| Implement | `/implement plans/<slug>-plan.md` | code + `reports/<slug>-implementation-report.md` |
| Validate | `/validate` | GATE GREEN/RED |
| Review | `/review-branch` | `reports/<slug>-review.md` |
| Evolve | `/evolve` | rule/doc deltas + vault write-back — runs BEFORE any push or merge |
| Ship | `superpowers:finishing-a-development-branch`, after `/evolve` | push / PR — `guard.mjs` denies a push until `/evolve` has run since the last commit (`requireEvolveBeforePush`) |

Work tracking is off here (`workTracking.backend: none`): plans and reports are the artifacts. Plan and Implement run in separate sessions (`/clear` between).

## Hard rules

- **Hooks change → smoke test runs**: any edit under `template/.claude/hooks/` (or to installed copies in `~/.claude/hooks/`) requires `node template/.claude/hooks/smoke-test.mjs` green, with a new fixture for any new behavior.
- **Platform claims get verified**: anything asserting Claude Code behavior (hook schemas, frontmatter keys, load order) must match the current official docs — they version and drift. `paths:` not `globs:`; stdin JSON not argv.
- **Budgets are enforced content design**: template CLAUDE.md ≤60 lines, rules ≤45, skill bodies ≤100 (measured by `tools/context-ledger.mjs`); docs ≤130 as a review guideline. Adding means cutting.
- **Ratchet + prune**: every rule added to `template/` needs a traceable incident; every change considers what to remove.
- **Dogfood the pipeline**: non-trivial changes to this repo go through `/plan-work → /implement → /validate → /review-branch → /evolve` with superpowers discipline, like any harnessed project. Template edits end with `node tools/self-harness.mjs`.

## Structure map (details: README.md)

| Area | Owner file |
|---|---|
| Shippable project harness | `template/` (CLAUDE.md + .claude/*) |
| Root copy of the harness (generated by `tools/self-harness.mjs`) | `.claude/` |
| Autonomous loop | `loop/` |
| Global (~/.claude) hardening | `global/` (opt-in, never auto-applied) |
| Measurement | `tools/context-ledger.mjs` |
| Discipline docs | `docs/00…06, 99` |
```

Replace `CLAUDE.md` (root) with the shim:

```markdown
@AGENTS.md

# Claude Code notes

`AGENTS.md` above is the canonical contract for this repo and is shared with Codex. This file exists because Claude Code reads `CLAUDE.md`, not `AGENTS.md` — it imports it.

- `.claude/rules/*.md` with a `paths:` key auto-load when a matching file is read.
- Skills in `.claude/skills/` are invocable as `/<name>`; they are synced copies of `template/.claude/skills/`.

Project-specific instructions belong in `AGENTS.md`, not here.
```

- [ ] **Step 8: Sync, then verify by effect**

Run, in order:

```bash
node tools/self-harness.mjs
node tools/self-harness.mjs --check
node .claude/hooks/smoke-test.mjs
node tools/context-ledger.mjs .
echo '{"session_id":"x","cwd":"'"$PWD"'","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"cat .env"}}' | node .claude/hooks/guard.mjs
echo '{"session_id":"x","cwd":"'"$PWD"'","hook_event_name":"Stop","stop_hook_active":false}' | node .claude/hooks/stop-gate.mjs; echo "stop-gate exit=$?"
```

Expected: sync prints `created N · updated 0`; `--check` prints `matches`; the root smoke test is `135 passed, 0 failed`; the ledger is OK or WARN and under 2000; the guard prints a JSON `permissionDecision: "deny"`; the stop gate prints nothing and exits 0 (all three armed commands green). Then open a new Claude Code session in the repo and run `/context`: `.claude/rules/00-core.md` must be listed under memory files and `/skills` must list `validate`, `implement`, `review-branch`. Record the outputs in the implementation report.

- [ ] **Step 9: Commit**

```bash
git add tools/self-harness.mjs cli/self-harness.test.js package.json AGENTS.md CLAUDE.md .claude
git commit -m "feat(dogfood): the framework repo runs under its own payload — tools/self-harness.mjs sync + drift gate"
```

### Task 2: Platform drift — subagent model resolution, minimum version

**Files:**
- Modify: `template/.claude/references/dispatch-protocol.md` (the two paragraphs starting "Model resolution, in order" and "**`CLAUDE_CODE_SUBAGENT_MODEL` defeats sibling review.**")
- Modify: `docs/99-sources.md` (source 3, the "Subagent model resolution" bullet)
- Modify: `template/.claude/hooks/session-start.mjs` (one warning line)
- Modify: `template/.claude/hooks/smoke-test.mjs` (`runHook` gains an `env` argument; two fixtures)
- Modify: `README.md` (the "Requires Node ≥18." sentence)
- Modify: `template/.claude/skills/harness-init/SKILL.md` (step 4 table, one row)

**Interfaces:**
- Produces: `runHook(script, event, env?)` in the smoke test — Task 3 and Task 5 fixtures may pass `env`.

- [ ] **Step 1: Extend the fixture runner and write the failing fixtures**

In `smoke-test.mjs`, change `runHook`:

```js
function runHook(script, event, env) {
  try {
    const out = execFileSync("node", [join(HOOKS, script)], {
      input: JSON.stringify(event), encoding: "utf8", timeout: 20000,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["pipe", "pipe", "pipe"], // capture stderr too (verdict-gate writes there)
    });
    return { code: 0, out: out.trim() };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout || ""}`.trim(), err: `${err.stderr || ""}`.trim() };
  }
}
```

Append inside the `session-start.mjs` section (after the last existing `{ … }` block of that section):

```js
{
  // CLAUDE_CODE_SUBAGENT_MODEL_FORCE (2.1.257) runs EVERY subagent on one model — the
  // reviewer becomes the model that wrote the code and sibling review is dead with no
  // error. The plain CLAUDE_CODE_SUBAGENT_MODEL is only a default since 2.1.251.
  const on = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup" }, { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "opus" });
  let ctx = ""; try { ctx = JSON.parse(on.out).hookSpecificOutput.additionalContext; } catch { /* no JSON: ctx stays "" and the check fails */ }
  check("warns when CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set", on.code === 0 && ctx.includes("CLAUDE_CODE_SUBAGENT_MODEL_FORCE") && ctx.includes("sibling review"));
  const off = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup" }, { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "" });
  let offCtx = ""; try { offCtx = JSON.parse(off.out).hookSpecificOutput.additionalContext; } catch { /* empty output is fine here */ }
  check("no FORCE warning when the variable is unset", off.code === 0 && !offCtx.includes("CLAUDE_CODE_SUBAGENT_MODEL_FORCE"));
}
```

- [ ] **Step 2: Run the smoke test to verify the new fixture fails**

Run: `node template/.claude/hooks/smoke-test.mjs | grep -E 'FORCE|passed'`
Expected: `FAIL  warns when CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set`, the unset fixture PASS, `136 passed, 1 failed`.

- [ ] **Step 3: Add the warning to session-start.mjs**

In `session-start.mjs`, immediately before the line `if (source === "resume") lines.push(...)`, insert:

```js
  // Every subagent — the reviewer included — runs on ONE model when this is exported
  // (2.1.257): the reviewer becomes the model that wrote the code, silently. The plain
  // CLAUDE_CODE_SUBAGENT_MODEL is only a default since 2.1.251 (see dispatch-protocol.md).
  if (process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE) lines.push("CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set — every subagent runs on one model, so sibling review (/review-branch) is dead this session. Unset it.");
```

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `node template/.claude/hooks/smoke-test.mjs | tail -1`
Expected: `137 passed, 0 failed`.

- [ ] **Step 5: Correct the reference**

In `template/.claude/references/dispatch-protocol.md`, replace the two paragraphs with:

```markdown
Model resolution, in order (verified 2026-09-05 against code.claude.com/docs/en/sub-agents.md and the
2.1.251 / 2.1.257 changelog entries): the per-invocation `model` → the agent's `model:` frontmatter →
`CLAUDE_CODE_SUBAGENT_MODEL` (a DEFAULT since 2.1.251, no longer an override) → the session model. A
dispatch that pins no tier inherits that default or the session model — a silent cost and quality bug.

**`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` defeats sibling review.** Added in 2.1.257, it applies
`CLAUDE_CODE_SUBAGENT_MODEL` (or the main model) to EVERY subagent, ignoring per-spawn and frontmatter
models: the reviewer silently becomes the model that wrote the code, with no error and nothing in the
transcript. Never set it in a harnessed repo; `session-start.mjs` warns when it is exported. (Before
2.1.251 the plain variable had this effect — the old warning traced to that.)
```

Validate: `wc -l template/.claude/references/dispatch-protocol.md` → ≤160 (it is 76 today; the edit is line-neutral).

- [ ] **Step 6: Correct docs/99 and state the minimum version**

In `docs/99-sources.md`, replace the bullet beginning `- **Subagent model resolution** (verified 2026-07-12, …` with:

```markdown
- **Subagent model resolution** (verified 2026-07-12; re-verified 2026-09-05 against `/en/sub-agents.md` and CHANGELOG 2.1.251/2.1.257): per-invocation `model` → agent `model:` → `CLAUDE_CODE_SUBAGENT_MODEL` (a default since 2.1.251) → session model. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` (2.1.257) overrides everything and therefore defeats the sibling-reviewer rule → the warning in `template/.claude/references/dispatch-protocol.md` and the `session-start.mjs` check. Before 2.1.251 the plain variable was the override; that older claim is superseded, not wrong for its date.
- **Minimum version:** agent `maxTurns` is honored from 2.1.246 (`/en/sub-agents`); below it a scout has no turn cap. Stated in README and checked at `/harness-init` step 4.
```

In `README.md`, change the sentence ending `Requires Node ≥18.` to `Requires Node ≥18 and Claude Code ≥2.1.246 (the shipped agents' \`maxTurns\` is ignored by older versions).`

In `template/.claude/skills/harness-init/SKILL.md`, add this row to the step 4 table, after the smoke-test row:

```markdown
| `claude --version` | ≥ 2.1.246 — below it the agents' `maxTurns` is ignored and a scout can grind unbounded; record the version |
```

Validate: `wc -l template/.claude/skills/harness-init/SKILL.md` → 105 total (100 body lines, the budget's edge; if a later edit needs room, fold the two `.claude/harness.json` bullets in step 3 into one).

- [ ] **Step 7: Sync the root and commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude docs/99-sources.md README.md .claude
git commit -m "fix(dispatch): subagent model resolution per 2.1.251/2.1.257 — FORCE warning at session start, minimum version stated"
```

### Task 3: The stop gate cannot be disarmed by editing its config

**Files:**
- Modify: `template/.claude/hooks/stop-gate.mjs:470-476` (gate read + empty-gate early exit) and the verdict section (`:503-542`)
- Modify: `template/.claude/hooks/smoke-test.mjs:401-466` (the three existing tamper fixtures switch to a constant command) plus three new fixtures

**Interfaces:**
- Produces: `.claude/state/gate-<sid8>.json` = `{"stopGate": [...]}` written on RED, deleted on an honest GREEN. Same lifetime rules as `tamper-<sid8>.json`.

- [ ] **Step 1: Make the existing tamper fixtures use a constant command, then write the failing fixtures**

The gate-config check compares command TEXT, so a fixture that switches `process.exit(1)` to `process.exit(0)` between RED and GREEN would now read as a removed command. Introduce one flag-driven command whose text never changes. Near the top of the `stop-gate.mjs` section of `smoke-test.mjs` (before the first tamper fixture), add:

```js
// One command whose TEXT never changes between RED and GREEN — it reads a flag file
// instead. The gate-config tamper check (below) compares command text, so a fixture
// that rewrites the command to "go green" would trip it for the wrong reason.
const FLAG_CMD = 'node -e "process.exit(require(\'fs\').existsSync(\'.red\') ? 1 : 0)"';
const setRed = (dir, on) => { const f = join(dir, ".red"); if (on) writeFileSync(f, ""); else if (existsSync(f)) unlinkSync(f); };
```

In each of the three existing tamper fixtures (`phe-gate-tamper-`, `phe-gate-tamper-del-`, `phe-gate-tamper-off-`): replace `const cfg = (exit) => JSON.stringify({ stopGate: [\`node -e "process.exit(${exit})"\`], stopGateTamperPaths: ["tests/"] });` with `const cfg = JSON.stringify({ stopGate: [FLAG_CMD], stopGateTamperPaths: ["tests/"] });` (drop `stopGateTamperPaths` in the `-off-` fixture as it is today), replace every `writeFileSync(join(tmp, ".claude", "harness.json"), cfg(1))` with `writeFileSync(join(tmp, ".claude", "harness.json"), cfg); setRed(tmp, true);` and every `cfg(0)` write with `setRed(tmp, false);`. Run `node template/.claude/hooks/smoke-test.mjs | tail -1` → still `137 passed, 0 failed` before continuing.

Then append the new fixtures after the `-off-` fixture:

```js
{
  // Gate-CONFIG tamper (always on): a RED gate snapshots its own command list; a later
  // GREEN whose list lost a command — or an emptied gate — is refused. Editing
  // harness.json is the cheapest way to "go green" once rewriting the tests is closed
  // off; same escape class (coleam00/skills), one door further in.
  const mk = () => { const t = mkdtempSync(join(tmpdir(), "phe-gate-cfg-")); mkdirSync(join(t, ".claude"), { recursive: true }); return t; };
  const cfg = (cmds) => JSON.stringify({ stopGate: cmds });
  const OK = 'node -e "process.exit(0)"';
  const stop = (t) => runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: t });
  const blocked = (r) => { try { return JSON.parse(r.out).decision === "block"; } catch { return false; } };
  const reason = (r) => { try { return JSON.parse(r.out).reason || ""; } catch { return ""; } };

  const t1 = mk(); writeFileSync(join(t1, ".claude", "harness.json"), cfg([FLAG_CMD])); setRed(t1, true);
  const snap1 = join(t1, ".claude", "state", "gate-smoke.json");
  check("red gate writes a gate-config snapshot", blocked(stop(t1)) && existsSync(snap1));
  writeFileSync(join(t1, ".claude", "harness.json"), cfg([]));
  const emptied = stop(t1);
  check("emptied gate after RED blocks", blocked(emptied) && reason(emptied).includes("shrank"));
  writeFileSync(join(t1, ".claude", "harness.json"), cfg([FLAG_CMD])); setRed(t1, false);
  const honest = stop(t1);
  check("same gate going green passes and clears the gate snapshot", honest.code === 0 && honest.out === "" && !existsSync(snap1));

  const t2 = mk(); writeFileSync(join(t2, ".claude", "harness.json"), cfg([FLAG_CMD, OK])); setRed(t2, true);
  stop(t2);
  writeFileSync(join(t2, ".claude", "harness.json"), cfg([OK]));
  const dropped = stop(t2);
  check("gate missing a command after RED blocks and names it", blocked(dropped) && reason(dropped).includes(".red"));

  const t3 = mk(); writeFileSync(join(t3, ".claude", "harness.json"), cfg([FLAG_CMD])); setRed(t3, true);
  stop(t3);
  writeFileSync(join(t3, ".claude", "harness.json"), cfg([FLAG_CMD, OK])); setRed(t3, false);
  const grew = stop(t3);
  check("gate that only grew passes", grew.code === 0 && grew.out === "" && !existsSync(join(t3, ".claude", "state", "gate-smoke.json")));
}
```

- [ ] **Step 2: Run the smoke test to verify the new fixtures fail**

Run: `node template/.claude/hooks/smoke-test.mjs | grep -E 'gate-config|emptied|missing a command|only grew|passed'`
Expected: the snapshot, emptied and missing-command fixtures FAIL; `139 passed, 3 failed` (the honest-green and grew fixtures pass by accident because nothing blocks yet).

- [ ] **Step 3: Implement the check in stop-gate.mjs**

Replace lines `const gate = Array.isArray(cfg.stopGate) ? cfg.stopGate : [];` through `if (gate.length === 0) process.exit(0);` with:

```js
  const gate = Array.isArray(cfg.stopGate) ? cfg.stopGate : [];

  // Gate-CONFIG tamper check (always on, no config): a RED gate snapshots its own command
  // list; a later GREEN whose list lost a command — or an emptied gate — is refused. Once
  // rewriting the tests is closed off (stopGateTamperPaths), editing harness.json is the
  // next-cheapest way to "go green": same escape class (coleam00/skills), one door in.
  // Runs BEFORE the empty-gate exit so disarming the gate outright is caught too.
  // Best-effort like all state here: any error behaves as feature-off.
  const gsid = String(event.session_id || "nosession").slice(0, 8);
  const gateSnapPath = join(cwd, ".claude", "state", `gate-${gsid}.json`);
  let gateBefore = null;
  try { if (existsSync(gateSnapPath)) gateBefore = JSON.parse(readFileSync(gateSnapPath, "utf8")).stopGate; } catch { gateBefore = null; }
  const removed = Array.isArray(gateBefore) ? gateBefore.filter((c) => !gate.includes(c)) : [];
  if (removed.length) {
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: `Stop gate config shrank since it last went RED — removed: ${removed.join(" · ")}. Restore the command(s) in .claude/harness.json and fix the code; if the removal is legitimate, explain it to the user and get confirmation.`.slice(0, MAX_REASON),
    }));
    process.exit(0);
  }
  if (gate.length === 0) process.exit(0);
```

Then, right after the line `let verdict = failures.length ? "RED" : skipped.length ? "INCOMPLETE" : "GREEN";`, add:

```js
  try { // snapshot the gate itself ONCE on RED; an honest GREEN clears it below
    if (verdict === "RED" && !existsSync(gateSnapPath)) {
      mkdirSync(join(cwd, ".claude", "state"), { recursive: true });
      writeFileSync(gateSnapPath, JSON.stringify({ stopGate: gate }));
    }
  } catch { /* advisory scaffolding — never break the gate */ }
```

And inside the existing `if (verdict === "RED") {…} else if … else if (verdict === "TAMPER") {…}` chain, add a final branch so a clean GREEN clears the gate snapshot:

```js
  } else if (verdict === "GREEN") {
    try { if (existsSync(gateSnapPath)) unlinkSync(gateSnapPath); } catch { /* state is advisory */ }
  }
```

- [ ] **Step 4: Run the smoke test to verify everything passes**

Run: `node template/.claude/hooks/smoke-test.mjs | tail -1`
Expected: `142 passed, 0 failed`. Also run `node template/.claude/hooks/smoke-test.mjs | grep -c FAIL` → `0`.

- [ ] **Step 5: Document the escape in docs/02 and the harness.json comment**

In `docs/02-enforcement-vs-guidance.md`, in the `stop-gate.mjs` row of the enforcement table, append to the "Does" cell: `; always-on gate-config check refuses a GREEN whose `stopGate` list shrank since the last RED`. In `template/.claude/harness.json` `$comment`, after the sentence ending `Empty/absent = off.`, append: ` The gate list itself is snapshotted on every RED regardless of that setting: a GREEN reached by removing a command is refused.` (one sentence; the file stays valid JSON — run `node -e "require('./template/.claude/harness.json')"`).

Validate: `wc -l docs/02-enforcement-vs-guidance.md` → 97 (unchanged; the edit is in-cell).

- [ ] **Step 6: Sync the root and commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude docs/02-enforcement-vs-guidance.md .claude
git commit -m "feat(stop-gate): refuse a GREEN whose stopGate config shrank since the last RED — the gate cannot be disarmed by editing harness.json"
```

### Task 4: Contract claims come from raw docs, never a summarized fetch

**Files:**
- Modify: `template/.claude/references/research-and-docs.md` (new section after "Sources")
- Modify: `template/.claude/agents/research-gatherer.md` (one Discipline bullet)
- Modify: `template/.claude/references/harness-maintenance.md` (section 2 intro line)
- Modify: `AGENTS.md` (root; the "Platform claims get verified" hard rule)
- Create: `~/Dev/The Vault/agent-kb/patterns/summarized-fetch-is-not-a-source.md`; Modify: `~/Dev/The Vault/agent-kb/patterns/_index.md`

- [ ] **Step 1: Add the section to research-and-docs.md**

After the "## Sources (use BOTH, cross-referenced)" section, insert:

```markdown
## Contract claims come from raw text

A summarized fetch (WebFetch answering a prompt over a page with a small model) is fine for
"how does X work" and is NOT a source for a contract claim — a field name, a frontmatter key, a
flag, an exit-code rule, a version floor. The summarizer invents plausible names with no error
signal: on 2026-09-05 it reported the SessionStart hook field as `start_reason`; the raw page says
`source`. For any claim that ends up in a hook, a rule, or a reference:

1. Fetch the raw page — Claude Code docs serve markdown at `https://code.claude.com/docs/en/<page>.md`;
   most doc sites have an equivalent (`.md`, `?raw`, the GitHub source).
2. `grep` the exact token in that text and quote the line, with the URL and the date read.
3. No raw form available → mark the claim `unverified (summary only)` in the note and in docs/99's
   unverified table; never let it into a hook or a rule.
```

Validate: `wc -l template/.claude/references/research-and-docs.md` → ≤160 (about 75).

- [ ] **Step 2: Add the gatherer discipline line and the maintenance line**

In `template/.claude/agents/research-gatherer.md`, under `## Discipline`, add as the last bullet:

```markdown
- Contract claims (field names, frontmatter keys, flags, exit semantics, version floors) are quoted
  from the RAW page (`<page>.md` or the source file), grepped, never from a summarized fetch — the
  summarizer invents plausible names with no error signal. Say `raw:` or `summary:` per claim.
```

In `template/.claude/references/harness-maintenance.md`, change the section 2 heading line `## 2. Platform contract (exact — violations fail silently)` to `## 2. Platform contract (exact — violations fail silently; verify against the RAW docs page, `<url>.md`, never a summarized fetch)`.

Validate: `wc -l template/.claude/references/harness-maintenance.md` → 106 (≤120).

- [ ] **Step 3: Sharpen the repo hard rule**

In root `AGENTS.md`, replace the "Platform claims get verified" bullet with:

```markdown
- **Platform claims get verified — from the raw page**: anything asserting Claude Code behavior (hook schemas, frontmatter keys, load order) must match the current official docs, read as raw markdown (`https://code.claude.com/docs/en/<page>.md`) and grepped — a summarized fetch invented a hook field name on 2026-09-05. They version and drift. `paths:` not `globs:`; stdin JSON not argv.
```

- [ ] **Step 4: Record the reusable lesson in the vault (Index Law)**

Create `~/Dev/The Vault/agent-kb/patterns/summarized-fetch-is-not-a-source.md`:

```markdown
---
type: note
updated: 2026-09-05
tags:
  - agents
  - research
  - hallucination
---

# A summarized fetch is not a source

**The shape.** Any tool that answers a prompt over a page with a smaller model (WebFetch-style) returns a *paraphrase*. For prose that is fine. For a **contract claim** — a field name, a frontmatter key, a flag, an exit-code rule, a version floor — it is a hallucination vector with no error signal: the summarizer produces a plausible identifier and nothing downstream can tell it from a real one.

**Failure mode, with receipts.** [[projects/perfectHarnessEngineering/_index|perfectHarnessEngineering]], 2026-09-05: a summarized fetch of the Claude Code hooks reference reported the SessionStart input field as `start_reason` with allowed values listed. The raw `hooks.md` says `source`. A hook written from the summary would have silently never matched, which is exactly the class of bug the harness's smoke test cannot see (it tests the hook against its own fixtures, not the platform).

**The rule.** Contract claims are grepped from raw text — the docs site's `.md` endpoint, the repository source, the CLI's `--help` — and quoted with URL and date. No raw form → the claim is labelled `unverified (summary only)` and never enters a hook, a rule, or a reference. Summaries stay for understanding, not for identifiers.

**The tell.** You are about to write an identifier you first saw in a tool's answer rather than in a file. Stop and find the file.
```

In `~/Dev/The Vault/agent-kb/patterns/_index.md`, set `updated: 2026-09-05` and add before `_Suggested next filenames:`:

```markdown
- [[agent-kb/patterns/summarized-fetch-is-not-a-source|summarized-fetch-is-not-a-source]] — a WebFetch-style paraphrase is fine for understanding and a hallucination vector for identifiers: it invented a hook field name (`start_reason` for `source`) with no error signal. Contract claims are grepped from raw text (`<page>.md`, source, `--help`) and quoted with URL + date; no raw form → labelled unverified, never in a hook or rule (PHE, 2026-09-05).
```

- [ ] **Step 5: Sync the root, run the ledger, commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
node tools/context-ledger.mjs template | tail -2
git add template/.claude AGENTS.md .claude
git commit -m "docs(research): contract claims are grepped from the raw docs page — a summarized fetch invented a hook field name"
```

Expected: ledger unchanged (references are not always-loaded).

### Task 5: The handoff trigger is a number; compaction re-invokes the stage skill

**Files:**
- Modify: `template/.claude/rules/00-core.md:6` (the "Long task under context pressure" line, in place)
- Modify: `template/.claude/statusline.mjs` (context line shows tokens)
- Modify: `template/.claude/hooks/session-start.mjs` (compact branch, one line)
- Modify: `template/.claude/hooks/smoke-test.mjs` (compact fixture assertion; new statusline check)
- Modify: `docs/01-context-engineering.md:118` (the handoff row, in place)

- [ ] **Step 1: Write the failing checks**

In `smoke-test.mjs`, in the `source: "compact"` fixture, extend the check:

```js
  check("compact source re-injects snapshot + dropped-context warning + re-invoke line", res.code === 0 && ctx.includes("Compaction dropped") && ctx.includes("feature/x") && ctx.includes("re-invoke the active pipeline skill"));
```

Append a new section at the end of the file, before the summary line:

```js
console.log("statusline.mjs");
{
  // Windows now run 200k–1M, so a percentage says nothing about how many tokens are in
  // play; the handoff rule in 00-core.md is stated in tokens and reads this line.
  const input = JSON.stringify({ model: { display_name: "M" }, workspace: { current_dir: tmpdir() }, context_window: { used_percentage: 43.2, total_input_tokens: 86400, context_window_size: 200000 } });
  let out = ""; try { out = execFileSync("node", [join(HOOKS, "..", "statusline.mjs")], { input, encoding: "utf8", timeout: 10000 }).trim(); } catch (e) { out = `${e.stdout || ""}`; }
  check("statusline shows percent and absolute tokens", out.includes("ctx 43% 86k/200k"));
  const bare = JSON.stringify({ model: { display_name: "M" }, workspace: { current_dir: tmpdir() }, context_window: { used_percentage: 12 } });
  let out2 = ""; try { out2 = execFileSync("node", [join(HOOKS, "..", "statusline.mjs")], { input: bare, encoding: "utf8", timeout: 10000 }).trim(); } catch (e) { out2 = `${e.stdout || ""}`; }
  check("statusline degrades to percent only when token fields are absent", out2.includes("ctx 12%") && !out2.includes("/"));
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `node template/.claude/hooks/smoke-test.mjs | grep -E 're-invoke|statusline|passed'`
Expected: the compact fixture FAILs, `statusline shows percent and absolute tokens` FAILs, the degrade check PASSes; `142 passed, 2 failed`.

- [ ] **Step 3: Implement**

In `session-start.mjs`, in the `if (source === "compact") {…}` block, after the `lines.push("Compaction dropped: …")` line, add:

```js
    lines.push("Invoked skills were re-attached within a 25k-token budget (5k each, newest first): re-invoke the active pipeline skill (/implement, /validate, …) before continuing so its full body is back.");
```

In `statusline.mjs`, replace the two `pct` lines with:

```js
    const cw = d.context_window || {};
    const pct = cw.used_percentage; // null early in session / right after compact
    if (typeof pct === "number" && Number.isFinite(pct)) {
      const k = (n) => `${Math.round(n / 1000)}k`;
      const used = cw.total_input_tokens, size = cw.context_window_size; // absolute tokens: the handoff rule is stated in tokens
      parts.push(typeof used === "number" && typeof size === "number" ? `ctx ${Math.round(pct)}% ${k(used)}/${k(size)}` : `ctx ${Math.round(pct)}%`);
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `node template/.claude/hooks/smoke-test.mjs | tail -1`
Expected: `144 passed, 0 failed`.

- [ ] **Step 5: State the number in the rule and the doc (in place, line-neutral)**

In `template/.claude/rules/00-core.md`, replace the line beginning `- Long task under context pressure →` with:

```markdown
- Context past ~120k tokens (statusline `ctx`), or a stage boundary in a long plan → `/handoff` then `/clear` (beats compacting — that loses paths-scoped rules + subdir CLAUDE.md; windows run 200k–1M, so a percentage says nothing). Two failed corrections on one issue → stop patching; `/clear` and restart with a rewritten prompt. (traces to: 2026-09-05 — three 40–96 KB dumps read in one turn with no trigger to hand off)
```

In `docs/01-context-engineering.md`, replace the "Use when" cell of the `Full reset + handoff artifact` row (line 118) with: `Long autonomous work, and any stage past ~120k tokens (statusline \`ctx\`): resets beat compaction — compaction leaves "context anxiety" intact, and degradation is measured far below any window's limit (Chroma 2025: a 200K model degrades from ~50K), so the trigger is absolute tokens, never a percentage`.

Validate: `wc -l template/.claude/rules/00-core.md` → 44; `wc -l docs/01-context-engineering.md` → 140 (unchanged); `node tools/context-ledger.mjs template | tail -1` → under 2000.

- [ ] **Step 6: Sync the root and commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude docs/01-context-engineering.md .claude
git commit -m "feat(context): handoff at ~120k tokens (statusline shows tokens), re-invoke the stage skill after compaction"
```

### Task 6: Gate output stays out of the window

**Files:**
- Create: `template/.claude/tooling/run-check.mjs`
- Create: `cli/run-check.test.js`
- Modify: `template/.claude/skills/validate/SKILL.md` (frontmatter `allowed-tools`; step 3 first paragraph)
- Modify: `template/.claude/rules/00-core.md:5` (the "Broad exploration" line, in place)
- Modify: `package.json` (`test` script)

**Interfaces:**
- Produces: `node .claude/tooling/run-check.mjs <label> [--tail N] -- <command…>` → writes `.claude/state/checks/<label>.log`, prints `exit=<n> · log=<path> · <lines> lines` then the last N lines (default 40); exits with the command's exit code; exit 64 on bad usage.

- [ ] **Step 1: Write the failing test**

Create `cli/run-check.test.js`:

```js
#!/usr/bin/env node
'use strict';
// .claude/tooling/run-check.mjs: run ONE gate command, keep the whole output on disk,
// print only the exit line and a tail. /validate runs every gate command through it so a
// failing suite's thousands of lines never enter the context window (analysis 2026-09-05, 2.3).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'template', '.claude', 'tooling', 'run-check.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'run-check-'));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); failed++; process.exitCode = 1; }
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', [SCRIPT].concat(args), { cwd: TMP, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
const noisy = 'node -e "for (let i = 1; i <= 100; i++) console.log(\'line \' + i); process.exit(3)"';

console.log('\nrun-check: gate output stays on disk\n');

test('a failing command: exit code passes through, tail is 40 lines, log holds everything', () => {
  const r = run(['unit', '--', noisy]);
  assert.strictEqual(r.code, 3, 'exit code must be the command\'s');
  const lines = r.out.trimEnd().split('\n');
  assert.ok(/^exit=3 · log=\.claude\/state\/checks\/unit\.log · 100 lines$/.test(lines[0]), 'header line, got: ' + lines[0]);
  assert.strictEqual(lines.length, 41, 'header + 40 tail lines, got ' + lines.length);
  assert.strictEqual(lines[1], 'line 61');
  assert.strictEqual(lines[40], 'line 100');
  const log = fs.readFileSync(path.join(TMP, '.claude', 'state', 'checks', 'unit.log'), 'utf-8');
  assert.strictEqual(log.trimEnd().split('\n').length, 100, 'log must keep the full output');
});

test('a passing command exits 0 and honors --tail', () => {
  const r = run(['lint', '--tail', '2', '--', 'node -e "console.log(\'a\'); console.log(\'b\'); console.log(\'c\')"']);
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.out.trimEnd().split('\n').slice(1), ['b', 'c']);
});

test('stderr is captured into the log too', () => {
  run(['err', '--', 'node -e "console.error(\'boom\'); process.exit(1)"']);
  assert.ok(fs.readFileSync(path.join(TMP, '.claude', 'state', 'checks', 'err.log'), 'utf-8').includes('boom'));
});

test('a label is sanitized to a safe filename', () => {
  run(['npm test/../x', '--', 'node -e "0"']);
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'state', 'checks', 'npm-test-x.log')), 'label not sanitized');
});

test('missing -- separator is a usage error, exit 64', () => {
  const r = run(['nolabel']);
  assert.strictEqual(r.code, 64);
  assert.ok(/usage/.test(r.out));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node cli/run-check.test.js`
Expected: `0 passed, 5 failed` (script missing), exit 1.

- [ ] **Step 3: Write the runner**

Create `template/.claude/tooling/run-check.mjs`:

```js
#!/usr/bin/env node
// run-check: run ONE gate command, keep its whole output on disk, print only what a verdict
// needs. /validate runs every gate command through this so a failing suite's thousands of
// lines never enter the context window (tool-call offloading). Exit code = the command's.
// Traces to: 2026-09-05 — /validate read full test output into the window with no cap.
//   node .claude/tooling/run-check.mjs <label> [--tail N] -- <command…>
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1) {
  console.error("usage: run-check.mjs <label> [--tail N] -- <command…>");
  process.exit(64);
}
const label = argv[0].replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "check";
const tailIdx = argv.indexOf("--tail");
const tailN = tailIdx !== -1 && tailIdx < sep ? Math.max(1, Number(argv[tailIdx + 1]) || 40) : 40;
const cmd = argv.slice(sep + 1).join(" ");

const relDir = join(".claude", "state", "checks");
mkdirSync(join(process.cwd(), relDir), { recursive: true });
const rel = join(relDir, `${label}.log`);

// Shell execution is intentional: gate commands are repo-owner-authored (same trust as
// package.json scripts), exactly like stop-gate.mjs's stopGate entries.
const res = spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const code = res.status === null ? 1 : res.status;
const out = `${res.stdout || ""}${res.stderr || ""}`;
writeFileSync(join(process.cwd(), rel), out);
const lines = out.trimEnd() === "" ? [] : out.trimEnd().split("\n");
console.log(`exit=${code} · log=${rel} · ${lines.length} lines`);
if (lines.length) console.log(lines.slice(-tailN).join("\n"));
process.exit(code);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node cli/run-check.test.js`
Expected: `5 passed, 0 failed`. Note the sanitizer collapses `npm test/../x` to `npm-test-x`; if the fourth test disagrees on the exact name, fix the test to the observed safe name only if it contains no `/` or `..`.

- [ ] **Step 5: Wire the test, then teach /validate and the core rule to use it**

In `package.json`, append ` && node cli/run-check.test.js` to the `test` script.

In `template/.claude/skills/validate/SKILL.md`, change the frontmatter line to:

```yaml
allowed-tools: Bash(git diff *) Bash(git status *) Bash(git merge-base *) Bash(node .claude/tooling/run-check.mjs *)
```

and replace the first paragraph of `## 3 · Run every command` (`Run each gate command to completion. Capture the real exit status — no inference from output text. One row per command:`) with:

```markdown
Run each gate command to completion THROUGH the runner — `node .claude/tooling/run-check.mjs <label> -- <cmd>` — which keeps the whole output at `.claude/state/checks/<label>.log` and prints only `exit=<n>` plus the last 40 lines. Read the exit status from that line — no inference from output text. Never `cat` a log into the window: a FAIL row cites the log path and the failing tail. One row per command:
```

In `template/.claude/rules/00-core.md`, replace the line beginning `- Broad exploration (codebase survey, multi-file grep, research) →` with:

```markdown
- Broad exploration (codebase survey, multi-file grep, research) → dispatch a subagent: it burns tokens in its own window and returns a summary. In THIS window read targeted (offset/limit, `sed -n`); a whole-directory dump goes to a subagent or a scratch file you grep. `/clear` between unrelated tasks — leftover context biases the next. (traces to: 2026-09-05 — 190 KB of `cat` output in three calls)
```

Validate: `wc -l template/.claude/skills/validate/SKILL.md` → 89; `wc -l template/.claude/rules/00-core.md` → 44; `node tools/context-ledger.mjs template | tail -1` → under 2000; `node cli/skill-preview-guards.test.js` → all PASS (no `!\`` line was touched).

- [ ] **Step 6: Sync the root and commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
git add template/.claude cli/run-check.test.js package.json .claude
git commit -m "feat(validate): gate commands run through .claude/tooling/run-check.mjs — full output on disk, only exit + tail in context"
```

### Task 7: `/evolve` is mandatory between validation and any push or merge

Operator directive (2026-09-05): "an evolve should happen after validate (before push and merge pr)". The pipeline already places `/evolve` after `/review-branch` and before `superpowers:finishing-a-development-branch`; what is missing is (a) enforcement by default — the guard's evolve→push gate ships opt-in — and (b) a latent ordering bug: `/evolve` writes its marker BEFORE its own `docs(kb):` commit, so HEAD is newer than the marker and the very push it unblocks is denied again.

**Files:**
- Modify: `template/.claude/harness.json` (`requireEvolveBeforePush` → `true`; the `$comment` sentence)
- Modify: `template/.claude/skills/evolve/SKILL.md:86-88` (marker bullet becomes the LAST bullet of step 6; Output contract)
- Modify: `template/.claude/hooks/smoke-test.mjs` (push-gate fixture block: one fixture pinning the ordering)
- Modify: `template/AGENTS.md` (Pipeline table: Ship row), `README.md:81` (workflow rows 7–8), `docs/02-enforcement-vs-guidance.md:27` ("opt-in" → "default-on"), `docs/03-loops.md:8-10,21`

**Interfaces:**
- Consumes: `guard.mjs`'s existing check — a push is denied while `.claude/state/.evolve-ran` is older than HEAD's commit time (`requireEvolveBeforePush: true`). No hook code changes.

- [ ] **Step 1: Pin the ordering invariant with a fixture**

In `smoke-test.mjs`, add `utimesSync` to the `node:fs` import. In the `phe-pushgate-` fixture block, after the `check("fresh evolve marker allows push", …)` line, add:

```js
  // Ordering: /evolve used to write the marker BEFORE its docs(kb) commit, so HEAD was newer
  // than the marker and the push /evolve had just unblocked was denied again. The skill now
  // writes the marker LAST; this pins what the old order produced. The marker is aged 5s so
  // the comparison never lands inside git's 1-second commit-time granularity.
  const past = new Date(Date.now() - 5000);
  utimesSync(join(tmp, ".claude", "state", ".evolve-ran"), past, past);
  execFileSync("git", ["-C", tmp, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "docs(kb): x"]);
  const stale = runHook("guard.mjs", { ...base, cwd: tmp, tool_name: "Bash", tool_input: { command: "git push origin feat/x" } });
  check("a commit after the evolve marker re-blocks the push (the marker must be written last)", denies(stale));
```

Run: `node template/.claude/hooks/smoke-test.mjs | tail -1` → `145 passed, 0 failed` (this fixture passes against today's guard; it exists so the prose order in step 2 can never silently regress into a gate that blocks its own unblock).

- [ ] **Step 2: Reorder /evolve so the marker is written last**

In `template/.claude/skills/evolve/SKILL.md`, delete the bullet beginning `- Always — even on "none": write \`.claude/state/.evolve-ran\`` from its current position (before the kb-check bullet) and append this as the LAST bullet of `## 6. Apply selections` (after the `Any hook changed →` bullet):

```markdown
- LAST, after every commit above — even on "none": write `.claude/state/.evolve-ran` (timestamp). `guard.mjs` denies `git push` until this marker is newer than HEAD (`harness.json` `requireEvolveBeforePush`, default true); written before the `docs(kb):` commit it is stale the moment that commit lands. `.claude/state/` is gitignored by adopters.
```

In `## 7. Output contract`, change `Changes go to disk; no terminal recap of file contents. End with exactly one line:` to `Changes go to disk; no terminal recap of file contents. The push gate is open once the marker is written. End with exactly one line:`.

Validate: `wc -l template/.claude/skills/evolve/SKILL.md` → 99 (a moved bullet is line-neutral).

- [ ] **Step 3: Flip the shipped default and say why**

In `template/.claude/harness.json`, set `"requireEvolveBeforePush": true`. In its `$comment`, replace the sentence that contains `requireEvolveBeforePush` with: `requireEvolveBeforePush (default true) makes guard.mjs deny git push until /evolve has run since the last commit — the harness learns BEFORE the work ships, never after; set false to opt out.` If the `$comment` has no such sentence, append it after the `baseBranch` sentence. Validate: `node -e "const c=require('./template/.claude/harness.json'); if (c.requireEvolveBeforePush !== true) process.exit(1)"` → exit 0.

Existing adopters keep their own value on `update` (user config wins — `cli/harness-config.js`); only new installs get `true`. Say so in README (step 4).

- [ ] **Step 4: State the sequence everywhere it is drawn**

`template/AGENTS.md`, Pipeline table — insert after the `| Evolve |` row:

```markdown
| Ship | `superpowers:finishing-a-development-branch`, after `/evolve` | push / PR — `guard.mjs` denies a push until `/evolve` has run since the last commit (`requireEvolveBeforePush`, default on) |
```

Validate: `wc -l template/AGENTS.md` → 59 (≤60).

`README.md` — replace row `| 7 · Evolve | \`/evolve\` | rule/vault deltas — the harness learns |` with:

```markdown
| 7 · Evolve | `/evolve` | rule/vault deltas — the harness learns BEFORE the work ships; writes the marker the push gate reads |
| 8 · Ship | `superpowers:finishing-a-development-branch` | push / PR — `guard.mjs` denies a push until `/evolve` has run since the last commit (`requireEvolveBeforePush`, default on for new installs; existing adopters flip it in `.claude/harness.json`) |
```

`docs/02-enforcement-vs-guidance.md:27` — in the `guard.mjs` row, change `+ opt-in evolve→push gate` to `+ evolve→push gate (default on: a push needs a \`/evolve\` newer than HEAD)`.

`docs/03-loops.md` — replace lines 8–10 with:

```text
             +--------------------- OUTER: the harness learns, BEFORE the ship -------+
             |                                                                        v
  ticket --> /plan-work ---> /implement ---> /validate ---> /review-branch ---> /evolve ---> ship
```

and in the `| OUTER |` row (line 21) change the cadence cell `after every shipped item or failure` to `after review PASS and before every push/merge; also after every failure`.

Validate: `wc -l docs/03-loops.md` → 136; `wc -l docs/02-enforcement-vs-guidance.md` → 97.

- [ ] **Step 5: Sync the root and commit**

```bash
node tools/self-harness.mjs && node tools/self-harness.mjs --check
node tools/context-ledger.mjs template | tail -1
git add template/.claude template/AGENTS.md README.md docs/02-enforcement-vs-guidance.md docs/03-loops.md .claude
git commit -m "feat(evolve): mandatory before push/merge — requireEvolveBeforePush defaults on, marker written after the kb commit"
```

### Task 8: Whole-milestone verification, report, vault

**Files:**
- Create: `reports/harness-improvements-m1-implementation-report.md`
- Modify: `~/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md` (ADR-024), `_index.md`

- [ ] **Step 1: Run the full gate and the by-effect checks**

```bash
npm test 2>&1 | tail -3
node tools/context-ledger.mjs template | tail -1
node tools/context-ledger.mjs . | tail -1
node tools/self-harness.mjs --check
echo '{"session_id":"m1","cwd":"'"$PWD"'","hook_event_name":"Stop","stop_hook_active":false}' | node .claude/hooks/stop-gate.mjs; echo "root stop-gate exit=$?"
grep -rn 'CLAUDE_CODE_SUBAGENT_MODEL\b' template docs | grep -v FORCE | grep -vi 'default since 2.1.251\|before 2.1.251\|a default'
```

Expected: every suite `0 failed`, `EXIT=0`; both ledgers under 2000; `--check` matches; the root stop gate prints nothing and exits 0; the last grep prints nothing (every remaining mention of the plain variable is qualified as a default).

- [ ] **Step 2: Write the implementation report**

`reports/harness-improvements-m1-implementation-report.md`, first line `Plan: plans/harness-improvements-m1-plan.md · Item: none`, then the six-row Section table (`Task status`, `Knowledge`, `Deviations`, `Files changed`, `Follow-ups`, `Plan`) and a per-task table with the real command outputs from each task's validate step — including the manual `/context` and `/skills` observations from Task 1 step 8.

- [ ] **Step 3: Record ADR-024 and update the project index**

In the vault's `decisions.md` (newest first, `updated: 2026-09-05`), add `## ADR-024 — The framework runs under its own payload; the gate guards its own config; /evolve gates the push; contract claims come from raw text` with Date/Status/Context/Decision/Consequences in the file's existing shape, citing the analysis report and this plan. In the project `_index.md`, add a `Current focus` bullet for milestone 1 (date, the six items, the smoke-fixture count before and after) and bump `updated:`.

- [ ] **Step 4: Commit**

```bash
git add reports/harness-improvements-m1-implementation-report.md
git commit -m "docs(reports): harness improvements m1 — implementation report"
```

## End-to-end verification

The milestone is done when all of these hold, run fresh, output read:

1. `npm test` → every suite `0 failed`; smoke test `145 passed, 0 failed` (135 + 2 FORCE + 5 gate-config + 2 statusline + 1 push-gate ordering; the compact fixture is an extended assertion, not a new one).
2. `node tools/self-harness.mjs --check` → `matches`; `git status --short .claude` → clean.
3. A fresh Claude Code session in the repo: `/context` lists `.claude/rules/00-core.md`; `/skills` lists `validate`; the statusline shows `ctx N% Xk/Yk`; `cat .env` is denied by the guard.
4. In a scratch repo with `stopGate: ["false"]`: run the stop gate (RED), set `stopGate: []`, run again → blocked with "shrank".
5. `node .claude/tooling/run-check.mjs demo -- npm test` prints one `exit=` line plus ≤40 lines; the full log is at `.claude/state/checks/demo.log`.
6. `grep -rn '"autonomous"' .claude` → only the harness-init notice line and the reference's incident line (the root copy inherits the 3.3.0 change).
7. In a scratch git repo with `.claude/harness.json` = `{"requireEvolveBeforePush": true}`: commit → `git push` denied by the guard; write `.claude/state/.evolve-ran` → allowed; commit again → denied again. Then, in this repo, run `/evolve` (answer "none") and confirm `git push --dry-run origin <branch>` is not denied.

## Risks & assumptions

- **120k tokens is a starting point, not a measurement.** It sits between Chroma's ~50K-on-200K degradation and Anthropic's 40–50% anecdote; ablate it after a month by comparing `/handoff` frequency against stage failures, then adjust the number in `00-core.md` line 6 only.
- **Root copies drift by design between a template edit and the sync.** The stop gate turns that into a RED the same turn; the guard's `.claude/**` reads are unaffected. Hazard to document in AGENTS.md (done in Task 1): never edit root `.claude/` directly.
- **`preserveBeforeOverwrite` export.** Assumed present in `cli/backup-copy.js` because `cli/update.js` imports it; Task 1 step 4 says what to do if it is not.
- **The gate-config check trips on a legitimate gate rewrite within one session** (e.g. `/harness-init` re-arming). The block message asks for the user's confirmation; the snapshot is per session id and disappears with an honest GREEN, so the cost is one explanation.
- **`total_input_tokens` semantics.** The statusline doc (read 2026-09-05) defines it as tokens currently in the context window from the last API response, cache reads included; if a future version changes it the statusline degrades to percent only (Task 5's second fixture pins that path).
- **Existing adopters keep `requireEvolveBeforePush: false`.** User config wins on `update` by design (ADR: `cli/harness-config.js`); the default flips for new installs only, and README says how to opt in. Forcing it would be the config-clobber class the merge was built to end.
- **Commit-time granularity.** The guard compares the marker's mtime (ms) with HEAD's committer time (seconds); a marker written in the same second as a later commit can pass. Acceptable — the failure needs a commit within one second AFTER `/evolve` finishes, and the fixture ages the marker to stay deterministic.
- **Version.** Stays 3.3.0 on this branch; the operator decides at merge whether Tier 1 ships in 3.3.0 or a 3.4.0 that follows it.
