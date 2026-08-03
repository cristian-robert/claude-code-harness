---
ticket: ad-hoc
created: 2026-08-03
complexity: L
confidence: 8/10
tier: build
---

# Knowledge-base Dogfood (Increment 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the harness at the PHE repo itself, then run the real `/knowledge-migrate` pipeline against the real 179-file shared store — producing a git-tracked `knowledge-base/`, a gutted-and-repointed vault, and a reconciliation report that names every decision.

**Architecture:** Two halves. First a *mechanism* half: `tools/install-local-payload.mjs` drives `cli/init.js`'s exported `backupAndCopy` against the LOCAL `template/` tree, because `npx … init` downloads the published tarball from GitHub (`cli/init.js` → `TARBALL_URL` and `downloadAndExtract` — grep for both; the line numbers `:18,128` were correct pre-increment-1 and this file gets edited above them) and would therefore never see unreleased payload changes. Then an *execution* half: the nine migration steps from the spec, run in order against `/Users/cristian-robertiosef/Dev/The Vault`, each one gated by a real command whose real output is checked before the next step starts. Nothing writes a vault byte until a tarball backup has been extracted and `diff -r`'d against the source.

**Tech Stack:** Node ≥18 (CommonJS in `cli/`, ESM `.mjs` in `tools/` and `template/.claude/hooks/`), hand-rolled `assert()` test harness, git, `tar`, `gh`, Obsidian-flavoured Markdown.

## Context

**Knowledge to load first:**

- `knowledge-base/_index.md` → `architecture.md`, `decisions.md`, `resources.md`, `runbook.md` — **does not exist at `$R` yet; this increment creates it.** Read the source it is built from instead: `$V/projects/perfectHarnessEngineering/{_index,architecture,decisions,resources,runbook}.md`.
- `docs/design/2026-08-03-project-local-knowledge-base.md` — the spec: 28 locked decisions, the nine migration steps, the Enforcement table, Known limits 1–6.
- `.claude/references/knowledge-protocol.md` (shipped by increment 1) — the two-store boundary rule and the per-stage RETRIEVE/CAPTURE table.
- `docs/05-knowledge-layer.md` — the discipline this increment dogfoods; increment 1 rewrote its `## Sources` block.

This field is the Evidence rung of the spec's Enforcement table (decision 21). `none — <reason>` is a valid answer for a plan that needs no prior knowledge; this one is not that plan.

---

## Global Constraints

- **Increments 1 and 2 MUST have shipped — verify, do not assume.** As of this plan's writing they had NOT: none of `cli/knowledge-config.js`, `cli/knowledge-migrate.js`, `tools/kb-check.mjs`, `template/.claude/references/knowledge-protocol.md`, `template/.claude/references/knowledge-base-scaffold/` or `template/.claude/skills/knowledge-migrate/SKILL.md` existed on `main`, `feat/vault-research-reuse` or `docs/project-local-knowledge-base`. **Task 0 Step 1 is the gate**: six `OK` lines and green suites, or this plan does not start. It consumes those increments; it does not define them.
- **This is the ONLY increment that touches `/Users/cristian-robertiosef/Dev/The Vault`.** Referred to below as `$V`. The repo root `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering` is `$R`.
- **The vault is 1.9 MB, 179 markdown files, and is NOT a git repo** (`ls -d "$V/.git"` → `No such file or directory`). The verified tarball is the only undo. Backup verification (Task 4) is a hard gate: no vault byte changes before `diff -r` returns clean.
- **The repo is PUBLIC** — `gh repo view cristian-robert/claude-code-harness --json visibility` → `{"visibility":"PUBLIC"}`. `knowledge-base/` is git-tracked (decision 2), so everything in it is published.
- **Leak-scan gate — must return NOTHING at the end:**
  `grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' knowledge-base/`
  (the regex is `plans/vault-bootstrap-plan.md:16` verbatim). It runs over the WRITTEN copy at `$R`
  only. The `$V` sources keep every hit they have — Task 3 Step 7c proves it — because step 0's
  gate is cleared by a recorded decision applied to the planned copy, never by rewriting the source.
- **`harness.json` shape (replaces the legacy `vault` key):**
  ```json
  "knowledge": {
    "local": "knowledge-base",
    "shared": { "mode": "existing", "path": "/Users/cristian-robertiosef/Dev/The Vault" },
    "migratedAt": null
  }
  ```
- **Ledger file:** `.claude/state/knowledge-migration.json` — `{ "status": "pending"|"in-progress"|"done", "steps": { "<n>": "done"|"failed" }, "backups": [...], "manifest": [ {from, to} ], "leakDecisions": { "<marker>": "genericize"|"redact"|"accept" }, "linksBefore": { resolved, unresolved } }`. `writeLedger` is called after EVERY step. `leakDecisions` is what clears the step-0 gate: the gate re-scans the **planned copy** with the auto-genericizations and every recorded decision applied, and passes when nothing is left unresolved — the shared store is NEVER rewritten to satisfy it (spec step 0). `linksBefore` is written by `detect`'s green run and frozen from step 6 onwards.
- **CommonJS in `cli/`** — `require`/`module.exports`, `var`, no arrow functions in exported code (copy `cli/vault-config.js` exactly). ESM `.mjs` only under `template/.claude/hooks/` and `tools/`.
- **Tests are hand-rolled** — a local `assert(name, condition)` counting `passed`/`failed`, printing `PASS: …`/`FAIL: …`, ending with `"<n> passed, <n> failed"` and `process.exit(failed > 0 ? 1 : 0)`. Copy `cli/vault-config.test.js:14-19,84-85`. **NO jest, NO mocha, NO node:test.**
- **No edit under `template/.claude/hooks/` in this increment.** If one becomes necessary, `node template/.claude/hooks/smoke-test.mjs` must stay green AND a NEW fixture must be added — the repo's hard rule (`CLAUDE.md:32`).
- **Budgets, measured by `tools/context-ledger.mjs`:** payload `CLAUDE.md`/`AGENTS.md` ≤60 lines, rules ≤45, skill BODIES ≤100 (frontmatter excluded). `template/AGENTS.md` is at **58/60** after increment 1 and `template/.claude/rules/00-core.md` at **45/45** — adding a line there means cutting one. This increment adds nothing to either.
- **Baselines to hold (recorded at Task 0 Step 1, never copied from here):** `node tools/context-ledger.mjs template` → `TOTAL <LEDGER>`, `Status: WARN — <LEDGER> / 2000 est. tokens (83%)`. `node template/.claude/hooks/smoke-test.mjs` → `<SMOKE>`. `npm test` → `<SMOKE>`, ~7 s.
- **Conventional commits:** `feat:` / `fix:` / `refactor:` / `docs:` / `chore:` / `test:`.
- **Never commit on `main`/`master`** — `guard.mjs:26` enforces it once the payload is installed. All work lands on `feat/knowledge-base-dogfood`.
- **`guard.mjs:25` blocks recursive deletes** (`RECURSIVE_RM` — defined at `:25`, enforced at `:173`; `rm -rf`, `find -delete`, `git clean -d`). Every removal in this plan is a `mv` into an `archive/` folder or a single-file `rm` — by design, not by accident.
- **Every task ends with a real command and its real expected output.** "Looks done" is not a state.

---

## File Structure

### Created in `$R` (git-tracked)

| Path | Single responsibility |
|---|---|
| `tools/install-local-payload.mjs` | Install the **local** `template/` payload into a target repo by driving `cli/init.js`'s `backupAndCopy`, bypassing the GitHub download. |
| `tools/install-local-payload.test.mjs` | Hand-rolled asserts for the installer: copies, backups, `settings.local.json` immunity, non-git refusal, idempotency. |
| `AGENTS.md` | PHE's own canonical harness contract (60 lines) — replaces the knowledge-vault pointer block with the `knowledge-base/` contract. |
| `knowledge-base/_index.md` | Contents map + START HERE SOP for PHE's knowledge (Index Law root). |
| `knowledge-base/architecture.md` | Four-layer model + payload map, repointed at the two-store boundary rule. |
| `knowledge-base/decisions.md` | ADR log ADR-001…ADR-016, genericized and re-linked. |
| `knowledge-base/resources.md` | Where everything lives; credentials **index** only (pointers, never values). |
| `knowledge-base/runbook.md` | Verify / measure / run the loop / adopt — every claim re-derived by running the command. |
| `knowledge-base/inbox/_index.md` | Raw untriaged project capture; Index Law stub with a real SOP. |
| `knowledge-base/research/_index.md` | The five imported briefs + the pointer for the one deliberately left shared. |
| `knowledge-base/research/aidf-v08.md` | AIDF v0.8 deep read — cited by `docs/04-model-policy.md`. |
| `knowledge-base/research/anthropic-agents-more.md` | Anthropic agent-engineering distillation — cited by `docs/04-model-policy.md`. |
| `knowledge-base/research/claude-code-docs.md` | Claude Code platform contracts — cited by `docs/05-knowledge-layer.md`. |
| `knowledge-base/research/second-brain-starter.md` | Cole Medin second-brain-starter deep read — cited by `docs/05-knowledge-layer.md`. |
| `knowledge-base/research/v3-agile-layer.md` | v3 agile-layer brief — cited by `docs/06-delivery-org.md` + `docs/99-sources.md`. |
| `reports/knowledge-migration-dryrun.md` | Spec step 4's DRY-RUN PLAN — the three tables a human approves before any byte moves. |
| `reports/knowledge-reconciliation.md` | Every decision, every backup path, every unresolved link, the whole manifest. |
| `.claude/` (full payload) | The installed harness — hooks, rules, skills, agents, references, `harness.json`, `settings.json`, `statusline.mjs`. **Git-tracked**: Task 2 Step 9 runs `git add -A .claude` and commits it. `.claude/state/`, `.claude/agent-memory/` and `.claude/settings.local.json` are gitignored *inside* it. |

### Created in `$R` (gitignored)

| Path | Single responsibility |
|---|---|
| `.claude/state/knowledge-migration.json` | The resumable per-step migration ledger — including `leakDecisions` (what clears the step-0 gate) and `linksBefore`. |
| `.claude/state/detect-run{0,1}.json` | `knowledge-migrate detect`'s two payloads: the red leak-gate run and the green post-decision one. Read by Task 3 Steps 1 and 7b instead of re-deriving. |
| `.claude/agent-memory/` | Per-agent memory the harness writes. Operator-local; gitignored by Task 2 Step 6 because this repo is PUBLIC. |
| `.claude/settings.local.json` | The operator's local settings — never installed over, never committed. |

### Modified in `$R`

| Path | Change |
|---|---|
| `CLAUDE.md` | Becomes the template's 13-line `@AGENTS.md` shim; the real content moves to `AGENTS.md`. Original preserved at `CLAUDE.md.backup`. |
| `.gitignore` | Adds `.claude/state/`, `.claude/agent-memory/`, `.worktrees/`, `knowledge-base/.obsidian/`. |
| `package.json` | Adds `tools/install-local-payload.test.mjs` to `test` and `test:cli`. |
| `docs/04-model-policy.md:98,100,101` | Research-brief citations repointed from the vault path to `knowledge-base/research/…`. |
| `docs/05-knowledge-layer.md` (grep for the literal paths — increment 1 rewrote this file) | Same. |
| `docs/06-delivery-org.md:125` | Same. |
| `docs/99-sources.md:77` | Same. |

### Modified in `$V` (the shared store)

| Path | Change |
|---|---|
| `$V/CLAUDE.md:38` | Doctrine location 1 — `projects/` is no longer "the single source of truth for project knowledge". |
| `$V/projects/_index.md:12` | Doctrine location 2 — same shift, registry-scoped. |
| `$V/projects/_index.md:23` | Registry row for PHE marked `migrated` (not deleted). |
| `$V/projects/_index.md:30-35` | Doctrine location 3 — "Start a new project" forks on whether the repo is harnessed. |
| `$V/projects/_index.md:39-42` | Doctrine location 4 — Agent SOP learns what a `migrated` row means. |
| `$V/system/pointer-block.md` | Doctrine location 5 — the pointer block itself becomes two-store. |
| `$V/agent-kb/patterns/filesystem-containment.md:16,18` | Inbound wikilinks repointed at the repo KB. |
| `$V/agent-kb/patterns/_index.md:15` | Inbound prose reference repointed. |
| `$V/inbox/research/phe-harness/_index.md:4,12,20,21,24,25,39` | Inbound wikilink repointed; the five moved briefs become pointer lines. |
| `$V/inbox/research/_index.md:15` | Contents entry updated for the split folder. |

### Moved in `$V`

| From | To |
|---|---|
| `$V/projects/perfectHarnessEngineering/` (5 files) | `$V/projects/archive/perfectHarnessEngineering/` |
| `$V/inbox/research/phe-harness/{aidf-v08,anthropic-agents-more,claude-code-docs,second-brain-starter,v3-agile-layer}.md` | `$V/inbox/research/archive/` |

### Created in `$V`

| Path | Single responsibility |
|---|---|
| `$V/projects/archive/_index.md` | One-line archive stub (the Index Law's documented exception). |
| `$V/inbox/research/archive/_index.md` | One-line archive stub. |

### Created outside both trees

| Path | Single responsibility |
|---|---|
| `~/.phe-backups/` | The mandatory pre-migration tarball + its verification extraction. Refused by `backup()` if it ever resolves inside `$R` or `$V`. |

---

## Task 0: Preconditions and baselines — nothing else runs until this is green

**Files:** none. This task measures; it writes no code.

**Interfaces:**
- Consumes: increment 1's and increment 2's shipped artifacts.
- Produces: `<SMOKE>`, `<LEDGER>`, `<HARDENING>` — the literals every later task substitutes wherever it would otherwise pin a number. (`<ROOT_LEDGER>` is recorded later, at Task 2 Step 5, because it can only be measured after the payload is installed.)

- [ ] **Step 1: Gate on increments 1 and 2, then record the baselines.** When this plan was written, **neither increment had shipped** — none of the six paths below existed on `main`, `feat/vault-research-reuse` or `docs/project-local-knowledge-base`. Prove they exist now:
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && for p in cli/knowledge-config.js cli/knowledge-migrate.js tools/kb-check.mjs template/.claude/references/knowledge-protocol.md template/.claude/references/knowledge-base-scaffold template/.claude/skills/knowledge-migrate/SKILL.md; do test -e "$p" && echo "OK  $p" || echo "MISSING $p"; done
  ```
  Expected: six `OK` lines and zero `MISSING`. **Any `MISSING` ends this plan here** — increment 1 or 2 has not shipped, and every task below consumes them. Then measure:
  ```bash
  cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node template/.claude/hooks/smoke-test.mjs | tail -1 && node tools/context-ledger.mjs template | tail -1 && node cli/cli-hardening.test.js | tail -1
  ```
  Record all three verbatim as `<SMOKE>`, `<LEDGER>`, `<HARDENING>` and substitute them wherever this plan writes a pinned number. Expected after increment 1: `106 passed, 0 failed`, `Status: WARN — 1654 / 2000 est. tokens (83%)`, `19 passed, 0 failed`. At `$R` increment 2 has also shipped, so `cli-hardening.test.js` reads `21 passed, 0 failed`, not 19. A different value is not automatically wrong — but a value you did not measure is.

- [ ] **Step 2: Confirm the two increments' own suites are green.**
  ```bash
  node cli/knowledge-config.test.js | tail -1
  node cli/kb-check.test.js | tail -1
  node cli/knowledge-migrate.test.js | tail -1
  ```
  Expected: `26 passed, 0 failed`, `12 passed, 0 failed`, `105 passed, 0 failed`. A red suite here is an increment-1/2 defect — report it, do not work around it.

---

## Task 1: `tools/install-local-payload.mjs` — install the LOCAL payload

**Files:**
- Create: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/tools/install-local-payload.mjs`
- Create (test): `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/tools/install-local-payload.test.mjs`
- Modify: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/package.json` (lines 18 and 20 — the `test:cli` and `test` script strings)

**Interfaces:**
- Consumes: `cli/init.js` → `backupAndCopy(sourceDir, targetDir, projectRoot) -> { created, updated, backedUp, backedUpFiles[] }` (exported from `cli/init.js` — grep, do not trust a line number: increment 1 edits this file above the export); `cli/claude-md-copy.js` → `copyClaudeMdWithBackup(sourcePath, destPath, options) -> { created, updated, backedUp, backedUpFiles[] }` (exported at `cli/claude-md-copy.js:91`); `cli/harness-config.js` → `installHarnessConfig(projectRoot, templateHarnessPath) -> { created, updated }` (exported at `cli/harness-config.js:179`); `cli/harness-targets.js` → `writeHarnessTargets(projectRoot, targets) -> void`.
- Produces: `installLocalPayload(repoRoot, targetDir) -> { created, updated, backedUp, backedUpFiles }` — named ESM export consumed by `tools/install-local-payload.test.mjs` and by Task 2's CLI run.

- [ ] **Step 1: Write the failing test file.** Create `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/tools/install-local-payload.test.mjs` with exactly this content:

```js
// tools/install-local-payload.test.mjs
//
// Tests the local-payload installer: it must copy template/.claude into a target
// repo, back up (never clobber) pre-existing instruction files, leave the user's
// settings.local.json alone, and refuse a target that is not a git repo.

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { installLocalPayload } from "./install-local-payload.mjs";

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEST_DIR = join(tmpdir(), 'install-local-payload-test-' + randomUUID());

console.log('installLocalPayload into a fresh git repo:');
const T = join(TEST_DIR, 'fresh');
mkdirSync(join(T, '.git'), { recursive: true });
mkdirSync(join(T, '.claude'), { recursive: true });
writeFileSync(join(T, '.claude', 'settings.local.json'), '{"mine":true}');
writeFileSync(join(T, 'CLAUDE.md'), '# my own project notes\n');
const stats = installLocalPayload(REPO_ROOT, T);

assert('settings.json installed', existsSync(join(T, '.claude', 'settings.json')));
assert('guard hook installed', existsSync(join(T, '.claude', 'hooks', 'guard.mjs')));
assert('rules installed', existsSync(join(T, '.claude', 'rules', '00-core.md')));
assert('harness.json installed', existsSync(join(T, '.claude', 'harness.json')));
assert('harness.json has stopGate', 'stopGate' in JSON.parse(readFileSync(join(T, '.claude', 'harness.json'), 'utf-8')));
assert('harness targets recorded as claude', JSON.stringify(JSON.parse(readFileSync(join(T, '.claude', 'harness.json'), 'utf-8')).harness) === '["claude"]');
assert('settings.local.json untouched', readFileSync(join(T, '.claude', 'settings.local.json'), 'utf-8') === '{"mine":true}');
assert('AGENTS.md installed', existsSync(join(T, 'AGENTS.md')));
assert('pre-existing CLAUDE.md backed up verbatim', readFileSync(join(T, 'CLAUDE.md.backup'), 'utf-8') === '# my own project notes\n');
assert('CLAUDE.md replaced by the shim', readFileSync(join(T, 'CLAUDE.md'), 'utf-8').indexOf('@AGENTS.md') === 0);
assert('created count is positive', stats.created > 0);

console.log('re-run is idempotent and never re-backs-up:');
writeFileSync(join(T, 'CLAUDE.md'), '# framework shim edited by hand\n');
installLocalPayload(REPO_ROOT, T);
assert('backup still holds the ORIGINAL bytes', readFileSync(join(T, 'CLAUDE.md.backup'), 'utf-8') === '# my own project notes\n');
assert('settings.local.json still untouched', readFileSync(join(T, '.claude', 'settings.local.json'), 'utf-8') === '{"mine":true}');

console.log('refuses a target that is not a git repo:');
const NG = join(TEST_DIR, 'nogit');
mkdirSync(NG, { recursive: true });
var threw = false;
try { installLocalPayload(REPO_ROOT, NG); } catch (e) { threw = true; }
assert('throws when the target has no .git', threw);
assert('nothing installed into the non-git target', !existsSync(join(NG, '.claude')));

console.log('refuses a repoRoot without template/.claude:');
var threw2 = false;
try { installLocalPayload(join(TEST_DIR, 'notaframework'), T); } catch (e) { threw2 = true; }
assert('throws when template/.claude is missing', threw2);

console.log('backup dir default is outside the repo:');
assert('installer never writes outside the target', !existsSync(join(REPO_ROOT, '.claude', 'harness.json.backup')));

rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the test and see it fail.**
  ```bash
  node tools/install-local-payload.test.mjs
  ```
  Expected output (stderr): `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/tools/install-local-payload.mjs'` — exit code 1.

- [ ] **Step 3: Write the implementation.** Create `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/tools/install-local-payload.mjs` with exactly this content:

```js
#!/usr/bin/env node
// Install the LOCAL template/ payload into a target repo.
//
// Why this exists: `npx perfect-harness-engineering init` downloads the PUBLISHED
// tarball from GitHub (cli/init.js — grep for TARBALL_URL and downloadAndExtract;
// increment 1 edits this file above them), so a
// local, unreleased template/ edit is invisible to it. Dogfooding PHE against its
// own payload therefore has to drive init.js's copiers directly.
//
// Deliberately narrower than `init`: no prompts, no download, no examples/, no
// .mcp.json/.lsp.json, no Codex emit. It installs .claude/, AGENTS.md and the
// CLAUDE.md shim, installs-or-merges harness.json, and records the harness target.
//
// Usage: node tools/install-local-payload.mjs [targetDir]   (default: this repo)
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function installLocalPayload(repoRoot, targetDir) {
  const templateDir = join(repoRoot, "template");
  if (!existsSync(join(templateDir, ".claude"))) {
    throw new Error(templateDir + "/.claude does not exist — " + repoRoot + " is not a PHE checkout.");
  }
  // A target without .git is almost always a typo'd path. Installing a harness
  // whose guard/stop-gate hooks all shell out to git into a non-repo would wire
  // enforcement that can never fire, silently.
  if (!existsSync(join(targetDir, ".git"))) {
    throw new Error(targetDir + " is not a git repository — refusing to install the harness there.");
  }

  const { backupAndCopy } = require(join(repoRoot, "cli", "init.js"));
  const { copyClaudeMdWithBackup } = require(join(repoRoot, "cli", "claude-md-copy.js"));
  const { installHarnessConfig } = require(join(repoRoot, "cli", "harness-config.js"));
  const { writeHarnessTargets } = require(join(repoRoot, "cli", "harness-targets.js"));

  const stats = backupAndCopy(join(templateDir, ".claude"), join(targetDir, ".claude"), targetDir);

  // harness.json is skipped by backupAndCopy (the `entry.name === 'harness.json'` branch) because it is USER
  // config: a fresh target gets the template file, an existing one keeps its own
  // keys and gains only newly-shipped ones.
  const harnessDelta = installHarnessConfig(targetDir, join(templateDir, ".claude", "harness.json"));
  stats.created += harnessDelta.created;
  stats.updated += harnessDelta.updated;
  writeHarnessTargets(targetDir, ["claude"]);

  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const delta = copyClaudeMdWithBackup(join(templateDir, name), join(targetDir, name), { backupLabel: name });
    stats.created += delta.created;
    stats.updated += delta.updated;
    stats.backedUp += delta.backedUp;
    for (const f of delta.backedUpFiles) stats.backedUpFiles.push(f);
  }

  return stats;
}

const HERE = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const repoRoot = dirname(HERE);
  const targetDir = process.argv[2] ? resolve(process.argv[2]) : repoRoot;
  const stats = installLocalPayload(repoRoot, targetDir);
  console.log("Installed local payload into " + targetDir);
  console.log("  Created:   " + stats.created + " files");
  console.log("  Updated:   " + stats.updated + " files");
  console.log("  Backed up: " + stats.backedUp + " files (saved as .backup)");
  for (const f of stats.backedUpFiles) console.log("    " + f);
}
```

- [ ] **Step 4: Run the test and see it pass.**
  ```bash
  node tools/install-local-payload.test.mjs
  ```
  Expected last line: `17 passed, 0 failed` — exit code 0.

- [ ] **Step 5: Wire the test into `npm test`.** In `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/package.json`, append ` && node tools/install-local-payload.test.mjs` to the END of the `test:cli` value (line 18). In the `test` value (line 20), **insert** `node tools/install-local-payload.test.mjs && ` immediately BEFORE `node template/.claude/hooks/smoke-test.mjs` — the smoke test stays last so `npm test | tail -1` is always its summary.

- [ ] **Step 6: Run the full suite.**
  ```bash
  npm test
  ```
  Expected: the new block `installLocalPayload into a fresh git repo:` with 11 PASS lines, then four more blocks, ending `17 passed, 0 failed`, then the hook smoke test's `<SMOKE>`, exit code 0.

- [ ] **Step 7: Branch and commit.**
  ```bash
  git checkout -b feat/knowledge-base-dogfood
  git add tools/install-local-payload.mjs tools/install-local-payload.test.mjs package.json
  git commit -m "feat(tools): install-local-payload — drive backupAndCopy against local template/"
  ```
  Expected: `3 files changed`.

---

## Task 2: Dogfood the payload at `$R`

**Files:**
- Run: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/tools/install-local-payload.mjs`
- Create: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/AGENTS.md` (60 lines)
- Modify: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/.gitignore` (append 8 lines)
- Modify: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/.claude/harness.json` (`stopGate`, `knowledge`)
- Modify (generated): `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/CLAUDE.md` → the `@AGENTS.md` shim; original preserved as `CLAUDE.md.backup`

**Interfaces:**
- Consumes: `installLocalPayload(repoRoot, targetDir) -> { created, updated, backedUp, backedUpFiles }` (Task 1); `cli/knowledge-config.js` → `writeKnowledgeConfig(projectRoot, { mode, sharedPath }) -> void` (merges into `harness.json`; THROWS on malformed; always re-reads and PRESERVES `migratedAt`, so it can never set it) and `readKnowledgeConfig(projectRoot) -> knowledge | null` (never throws).
- Produces: a wired `$R/.claude/` (hooks live, gate armed) and `$R/.claude/harness.json` carrying the `knowledge` key with `migratedAt: null` — the precondition for every later task.

- [ ] **Step 1: Record the pre-install state (the failing check).**
  ```bash
  ls -1 .claude/ ; node tools/context-ledger.mjs .
  ```
  Expected — exactly this, and nothing else:
  ```
  agent-memory
  settings.local.json
  Context ledger — always-loaded tax for /Users/cristian-robertiosef/Dev/perfectHarnessEngineering

  file       lines  est.tok
  -------------------------
  CLAUDE.md     46      529
  -------------------------
  TOTAL                 529

  Status: OK — 529 / 2000 est. tokens (26%)
  ```
  No `AGENTS.md`, no `harness.json`, no wired hooks — the spec's dogfood acceptance is unrunnable in this state.

- [ ] **Step 2: Install the local payload.**
  ```bash
  node tools/install-local-payload.mjs
  ```
  Expected: `Installed local payload into /Users/cristian-robertiosef/Dev/perfectHarnessEngineering`, `Created:` ≥ 50 files, `Backed up: 1 files (saved as .backup)` listing `CLAUDE.md`.

- [ ] **Step 3: Verify the hooks are live.**
  ```bash
  echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"},"cwd":"'"$PWD"'"}' | node .claude/hooks/guard.mjs
  ```
  Expected (one line of JSON): `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Recursive/forced deletion is blocked by the harness guard. Delete specific files explicitly, or ask the user to run this themselves."}}`

- [ ] **Step 4: Write `$R/AGENTS.md`.** The installed `AGENTS.md` is the template placeholder; replace it wholesale with PHE's real contract. Content, verbatim (the `## Knowledge Vault` block from `CLAUDE.md.backup:5-20` is deliberately GONE — `## Knowledge base` replaces it):

```markdown
# Perfect Harness Engineering (PHE)

The harness-engineering framework for Claude Code. `template/` is the shippable payload, `cli/` the npm installer, `docs/` the discipline, `knowledge-base/` this project's knowledge. The three coleam00 clones are read-only reference material.

## Commands

| Task | Command |
|---|---|
| Unit tests | `npm test` |
| Hook smoke tests | `node template/.claude/hooks/smoke-test.mjs` |
| Payload context ledger | `node tools/context-ledger.mjs template` |
| Knowledge-base gate | `node tools/kb-check.mjs` |
| Re-install the local payload here | `node tools/install-local-payload.mjs` |
| Full gate | `/validate` runs all of the above and reports GATE GREEN/RED |

## Knowledge base

Project knowledge lives in `knowledge-base/` **in this repo**: `_index.md` first, then `architecture.md`, `decisions.md`, `resources.md`, `runbook.md`, `research/`. Read it before architecture, design or planning work; capture back into it mid-work; `/evolve` commits it. Generalized knowledge lives in the shared store at `.claude/harness.json` → `knowledge.shared.path`; promotion **MOVES** a fact there and leaves a pointer line — never a copy. Protocol: `.claude/references/knowledge-protocol.md`.

## Pipeline (PIV+E)

| Stage | Command | Writes to disk |
|---|---|---|
| Plan | `/plan-work <brain dump>` | `plans/<slug>-plan.md` |
| Implement | `/implement plans/<slug>-plan.md` | code + `reports/<slug>-implementation-report.md` |
| Validate | `/validate` | verdict (GATE GREEN/RED) |
| Review | `/review-branch` | `reports/<slug>-review.md` |
| Evolve | `/evolve` | rule + `knowledge-base/` updates (ask-first) |

Plan and Implement run in **separate sessions** (`/clear` between). Plans must pass the no-prior-knowledge test. Execution discipline inside every stage is the superpowers plugin (brainstorming → writing-plans → subagent-driven-development → TDD → verification-before-completion → requesting-code-review → finishing-a-development-branch); bugs start with `superpowers:systematic-debugging`, never with a fix. On conflict, THIS repo's rules win.

## Hard rules (each names its enforcer — do not work around them)

- **Hooks change → smoke test runs**: any edit under `template/.claude/hooks/` (or the installed copies in `.claude/hooks/`) requires `node template/.claude/hooks/smoke-test.mjs` green, with a NEW fixture for the new behaviour.
- **Platform claims get verified**: anything asserting Claude Code behaviour (hook schemas, frontmatter keys, load order) must match the current official docs — they version and drift. `paths:` not `globs:`; stdin JSON not argv.
- **Budgets are enforced content design**: payload CLAUDE.md/AGENTS.md ≤60 lines, rules ≤45, skill bodies ≤100 (measured by `tools/context-ledger.mjs`); docs ≤130 as a review guideline. Adding means cutting.
- **Ratchet + prune**: every rule added to `template/` cites a traceable incident; every change considers what to remove.
- **Dogfood the pipeline**: non-trivial changes go through `/plan-work → /implement → /validate → /review-branch → /evolve`.
- **Secrets**: never read/write `.env*` or key files — enforced by `.claude/hooks/guard.mjs` + permission denies.
- **No recursive deletes** (`rm -rf`, `find -delete`, `git clean -d`) — enforced by `guard.mjs`. Delete specific files explicitly.
- **Never commit/push on `main`** — enforced by `guard.mjs`. Branch first: `{type}/{description}`.
- **A turn cannot end with the stop gate red** — enforced by `.claude/hooks/stop-gate.mjs` running `.claude/harness.json` `stopGate`.
- **Done = evidence**: show the command run and its real output. "Looks done" is not a state.

## Context tiers (don't preload — lazy context loads itself)

- Path-scoped rules and subdirectory `AGENTS.md` auto-load on matching file reads.
- Knowledge skills: **architecture-map** BEFORE placing new code; **debugging-this-repo** BEFORE diagnosing any bug or test failure. Both are thin pointers into `knowledge-base/`.
- Touching the harness itself (hooks/rules/skills)? Read `.claude/references/harness-maintenance.md` FIRST.

## Structure map (details: README.md)

| Area | Owner |
|---|---|
| Shippable project harness | `template/` (AGENTS.md + CLAUDE.md + .claude/*) |
| npm installer | `cli/` (CommonJS; `var`, no arrow functions in exported code) |
| Global (~/.claude) hardening | `global/` (opt-in, never auto-applied) |
| Measurement | `tools/context-ledger.mjs`, `tools/kb-check.mjs` |
| Discipline docs | `docs/00…06, 99` |
| Project knowledge | `knowledge-base/` |
```

- [ ] **Step 5: Verify the root ledger.**
  ```bash
  node tools/context-ledger.mjs .
  ```
  Expected: `Status: OK — <ROOT_LEDGER> / 2000 est. tokens`, no `!! WARN`, no `!! HARD`, `AGENTS.md` 60 lines, `.claude/rules/00-core.md` 45 lines. Record `<ROOT_LEDGER>` here at Task 2 Step 5; Task 9 must reproduce it exactly. Do NOT pin the per-file token column: increment 1 rewrites two `00-core.md` rows, so the total drifts from the pre-increment measurement.

- [ ] **Step 6: Extend `.gitignore`.** Append these eight lines (the first is a blank separator) to `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/.gitignore`. `.claude/agent-memory/` is load-bearing: `.claude/agent-memory/code-reviewer/MEMORY.md` already exists locally, is not currently ignored, and this repo is PUBLIC — Step 9's `git add -A .claude` would publish it.
  ```

  # Harness runtime state, per-agent memory, in-repo worktrees — never committed (this repo is PUBLIC)
  .claude/state/
  .claude/agent-memory/
  .worktrees/

  # Obsidian workspace over knowledge-base/ — the operator's, never shipped (decision 24)
  knowledge-base/.obsidian/
  ```

- [ ] **Step 7: Arm the stop gate and write the `knowledge` key.**
  ```bash
  node -e 'var fs=require("fs"),p=".claude/harness.json",c=JSON.parse(fs.readFileSync(p,"utf-8"));c.stopGate=["npm test"];fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");'
  node -e 'require("./cli/knowledge-config.js").writeKnowledgeConfig(process.cwd(),{mode:"existing",sharedPath:"/Users/cristian-robertiosef/Dev/The Vault"});'
  node -e 'console.log(JSON.stringify(require("./cli/knowledge-config.js").readKnowledgeConfig(process.cwd())));'
  ```
  Expected third line exactly:
  `{"local":"knowledge-base","shared":{"mode":"existing","path":"/Users/cristian-robertiosef/Dev/The Vault"},"migratedAt":null}`

- [ ] **Step 8: Verify the stop gate reports armed.**
  ```bash
  echo '{"source":"startup","cwd":"'"$PWD"'"}' | node .claude/hooks/session-start.mjs | node -e 'var s="";process.stdin.on("data",function(d){s+=d}).on("end",function(){console.log(JSON.parse(s).hookSpecificOutput.additionalContext)})'
  ```
  Expected to contain the line: `Stop gate: 1 check(s) armed — the turn cannot end red.`

- [ ] **Step 9: Commit.**
  ```bash
  git add -A .claude AGENTS.md CLAUDE.md .gitignore
  git status --porcelain .claude | grep -E 'agent-memory|settings\.local|state/' ; echo "leak-check exit=$?"
  git status --porcelain | grep -c '^A\|^M'
  git commit -m "feat(harness): dogfood the payload at the repo root"
  ```
  Expected: the `leak-check` grep prints **no output** and `leak-check exit=1` — `.claude/state/`, `.claude/agent-memory/` and `.claude/settings.local.json` are all gitignored by Step 6 and must not be staged. **This repo is PUBLIC and `.claude/agent-memory/code-reviewer/MEMORY.md` already exists locally**, so a hit here would publish it: unstage and fix `.gitignore` before committing. `CLAUDE.md.backup` is untracked noise — leave it, it is the operator's undo.

---

## Task 3: Steps 0/1/2/2b — leak gate, detect, confirm, disposition (read-only)

**Files:**
- Create: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/reports/knowledge-reconciliation.md` (sections 1–4; sections 5–8 land in Tasks 4–9)
- Create (gitignored): `.claude/state/detect-run0.json` (the red gate run) and `.claude/state/detect-run1.json` (the green one); `.claude/state/knowledge-migration.json` gains `leakDecisions` and `linksBefore`
- Read-only: `$V/projects/perfectHarnessEngineering/*.md`, `$V/inbox/research/phe-harness/*.md` — **nothing under `$V` is written in this task, or by the leak gate, ever**

**Interfaces:**
- Consumes: `cli/knowledge-migrate.js` → `detectCandidates(projectRoot, sharedPath) -> { shared, local: [ { path, mdCount, tracked, verdict } ] }` with `verdict` one of `"likely" | "maybe" | "unlikely"`; `leakScan(filePaths) -> { autoGenericizable: [ {file, line, match} ], needsDecision: [ {file, line, match} ] }`. CLI forms: `knowledge-migrate detect` (steps 0+1; on the leak path returns `ok:false` with `data.reason === "leak gate"`, records `steps:{"0":"failed"}`, and writes NOTHING under `--dry-run`) and `knowledge-migrate decide <marker> <genericize|redact|accept>` (writes `ledger.leakDecisions[<marker lowercased>]`; refuses any other resolution).
- Produces: the confirmed import set (11 candidate files → 10 imported), the four resolved human decisions, a `leakDecisions` map that clears the step-0 gate over the PLANNED COPY (leaving `$V` byte-identical), the `linksBefore` snapshot `detect` writes on its green run, and `reports/knowledge-reconciliation.md` sections 1–4 — consumed by Tasks 5, 6, 7 and 9.

- [ ] **Step 0: Drive the real pipeline entry points, not the library.** Everything in Tasks 3-9
  that has a CLI subcommand MUST go through it; `node -e` on an exported function is a unit
  test, not a dogfood. A `node -e` survives in this plan ONLY where one of three things is true, and
  each surviving one says which:
  1. **It reads back JSON the CLI just produced** — Steps 1 and 7b below, Task 4 Step 3's ledger
     re-shape, Task 5 Step 12 / Task 6 Step 11's manifest echo, End-to-end check 7.
  2. **No subcommand exists for the operation** — `writeKnowledgeConfig`/`stampMigratedAt`
     (Task 2 Step 7, Task 9 Step 3), and the 11-file scoped `leakScan` at Step 3 below, whose import
     set is the CONFIRMED one and therefore narrower than `detect`'s.
  3. **Going through the CLI would corrupt the ledger** — Task 4 Steps 1 and 2 prove `backup()`
     THROWS on a bad destination; `knowledge-migrate backup` catches that throw and writes
     `steps:{"3":"failed"}` before re-raising, poisoning the ledger with a failure from a test.
     Task 7 Steps 1/4/5 are the same class: `verify-links` compares `ledger.linksBefore`, which
     `detect` snapshots over everything it DETECTED rather than what step 2 CONFIRMED, and it writes
     `steps:{"6b":"failed"}` — reasoning in full at Task 7 Step 5.
  ```bash
  mkdir -p .claude/state
  node cli/index.js knowledge-migrate status
  node cli/index.js knowledge-migrate detect > .claude/state/detect-run0.json ; echo "detect exit=$?"
  node -e 'var d=require("./.claude/state/detect-run0.json");console.log(JSON.stringify({reason:d.reason,shared:d.detected.shared,localDirs:d.detected.local.length,files:d.files,auto:d.leaks.autoGenericizable.length,needsDecision:d.leaks.needsDecision.length},null,2));'
  ```
  Expected: `"no migration ledger at .claude/state/knowledge-migration.json …"`, then `detect exit=1`,
  then a summary whose `shared.path` ends in `/projects/perfectHarnessEngineering` and whose
  `shared.mdCount` is `5` (NOT 179 — the whole-vault count; see Step 1's note below), with
  `reason` `"leak gate"` and `needsDecision` non-empty, so `ok` is false and the process exits 1.
  `detect` with no `--shared` is the production path: it reads `knowledge.shared.path` from the
  harness.json Task 2 Step 7 wrote.
  A `mdCount` of 179 means increment 2's `sharedProjectFolder` derivation is missing — STOP.
  An exit **0** on this FIRST run means `leakScan` classified nothing as `needsDecision`, which this
  repo's content makes implausible — read `leaks` before believing it.
  **The gate is cleared at Step 7b by RECORDING decisions, never by editing `$V`.** Per spec step 0
  the gate evaluates the planned copy — the import set as it will be written, with genericization
  and any recorded decisions applied — so the shared store stays byte-identical through step 0.
  Keep `.claude/state/detect-run0.json`: Steps 1 and 7b read it instead of re-deriving it.

- [ ] **Step 1: Read the real candidate list out of Step 0's JSON.** DETECT already ran; calling
  `detectCandidates` by hand would be a unit test of the same function against a different argument.
  ```bash
  node -e 'console.log(JSON.stringify(require("./.claude/state/detect-run0.json").detected,null,2));'
  ```
  *`mdCount`/`tracked` for `plans/` and `reports/` are re-derived at run time — this increment's own plan and reports live there. The other seven rows are exact.*

  Expected `local` rows (order may vary; verified 2026-08-03):
  | path | mdCount | tracked |
  |---|---|---|
  | `cole-medin-ai-coding` | 15 | 0 |
  | `docs` | 14 | 14 |
  | `global` | 1 | 2 |
  | `harness-engineering-demo` | 21 | 0 |
  | `loop` | 2 | 3 |
  | `plans` | 11 | 11 |
  | `reports` | 3+ | 3+ |
  | `second-brain-starter` | 11 | 0 |
  | `template` | 71 | 92 |

  `cli` and `tools` contain zero markdown and must NOT appear. `shared` must resolve to `/Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering` with `mdCount: 5` — the shared **project folder** derived from the configured vault root, never the vault root itself. `mdCount: 179` means increment 2's `sharedProjectFolder` derivation is missing: STOP, that would import `wiki/` and `agent-kb/`.

- [ ] **Step 2: Determine the cited briefs mechanically — do not trust the folder listing.**
  ```bash
  grep -rn "aidf-v08.md\|anthropic-agents-more.md\|anthropic-context-engineering.md\|anthropic-harness-design.md\|claude-code-docs.md\|cole-medin-ai-coding.md\|community-harness.md\|global-claude.md\|harness-engineering-demo.md\|obsidian-vault.md\|second-brain-starter.md\|v2-agent-architecture.md\|v2-local-patterns.md\|v2-platform-capabilities.md\|v2-progressive-disclosure.md\|v3-agile-layer.md" docs/ | grep -v "2026-08-03"
  ```
  Expected exactly 8 lines, naming 6 distinct briefs (the table below abbreviates each match to `path:line -> brief`; grep prints the full source line, and the file order varies):
  ```
  docs/04-model-policy.md:98   -> aidf-v08.md
  docs/04-model-policy.md:100  -> obsidian-vault.md
  docs/04-model-policy.md:101  -> anthropic-agents-more.md
  docs/05-knowledge-layer.md:115 -> obsidian-vault.md
  docs/05-knowledge-layer.md:118 -> second-brain-starter.md
  docs/05-knowledge-layer.md:119 -> claude-code-docs.md
  docs/06-delivery-org.md:125  -> v3-agile-layer.md
  docs/99-sources.md:77        -> v3-agile-layer.md
  ```
  The three `docs/05-knowledge-layer.md` line numbers above are pre-increment-1 values; increment 1 rewrote that file's `## Sources` block, so take them from the grep output rather than from this table. The COUNTS are the gate: **8 lines naming 6 distinct briefs**.
  Real line counts (`wc -l`): `aidf-v08.md` **357**, `anthropic-agents-more.md` **578**, `claude-code-docs.md` **1580**, `obsidian-vault.md` **540**, `second-brain-starter.md` **410**, `v3-agile-layer.md` **449**. The ten uncited briefs stay in the shared inbox (decision 19).

- [ ] **Step 3: Run the LEAK GATE over the import set (step 0 — read-only).**
  ```bash
  node -e 'var m=require("./cli/knowledge-migrate.js");var V="/Users/cristian-robertiosef/Dev/The Vault";var P=V+"/projects/perfectHarnessEngineering/";var B=V+"/inbox/research/phe-harness/";var f=["_index","architecture","decisions","resources","runbook"].map(function(n){return P+n+".md"}).concat(["aidf-v08","anthropic-agents-more","claude-code-docs","obsidian-vault","second-brain-starter","v3-agile-layer"].map(function(n){return B+n+".md"}));var r=m.leakScan(f);console.log("auto="+r.autoGenericizable.length+" needsDecision="+r.needsDecision.length);'
  ```
  Expected: the gate FIRES — `needsDecision` is non-empty, so per spec step 0 nothing may proceed until every hit is resolved. **Do not pin the auto/needsDecision split**: it depends on increment 2's classification rule, and this plan does not get to assume it. Record the two numbers you actually get. The RAW grep below is the authority for how much there is to resolve — it is also what the acceptance scan re-runs:
  ```bash
  grep -rncE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' "/Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/" "/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/aidf-v08.md" "/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/anthropic-agents-more.md" "/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/claude-code-docs.md" "/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md" "/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/second-brain-starter.md" "/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/v3-agile-layer.md"
  ```
  Expected per-file hit counts (verified 2026-08-03). `grep -rnc` on macOS walks with `fts`, so the
  ORDER of these eleven lines is not stable — match them as a SET, by filename, never by position:
  ```
  /Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/resources.md:2
  /Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/runbook.md:1
  /Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/_index.md:2
  /Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/decisions.md:3
  /Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/architecture.md:0
  /Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/aidf-v08.md:3
  /Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/anthropic-agents-more.md:0
  /Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/claude-code-docs.md:2
  /Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md:55
  /Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/second-brain-starter.md:1
  /Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness/v3-agile-layer.md:0
  ```
  **The gate FIRES.** Per spec step 0 it must refuse to proceed while any `needsDecision` hit is unresolved — and "unresolved" means *no decision recorded in the ledger*, not *still present in the source*. The gate evaluates the PLANNED COPY; the shared store is never rewritten to satisfy it. Nothing is rewritten here or anywhere under `$V`. Step 7b clears it, Step 7c proves `$V` is untouched.

- [ ] **Step 4: Present DECISION A (`obsidian-vault.md`) to the human and record the answer.** The token breakdown in that one file, verified with `grep -noE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' … | cut -d: -f2 | sort | uniq -c`:
  `12 /Users/`, `12 cristian`, `26 bzroo`, `25 Monitoro`, `10 SentrOS`. Lines 25-43 are a verbatim file inventory of two *other* products' vault folders.
  - **A1 (recommend):** DO NOT import. It stays in the shared inbox. Rationale: it is a survey of the operator's private vault including two unrelated production projects; genericizing 85 hits would gut the brief, and importing it into a PUBLIC, git-tracked `knowledge-base/` publishes another product's structure. `knowledge-base/research/_index.md` carries a prose pointer (NOT the literal folder name — `phe-harness` is itself in the leak regex).
  - **A2:** hand-write a ≤30-line redacted extract covering only the two cited claims. Cost: authoring time plus a permanent re-leak risk on every later edit.
  Record the chosen option and its one-line rationale.

- [ ] **Step 5: Present DECISION B (`decisions.md` names bzroo/SentrOS) and record the answer.** Three lines:
  `decisions.md:49` (a `phe-harness` wikilink), `decisions.md:57` (`SentrOS already proved the delegation pattern in production`), `decisions.md:113` (`lived practice (bzroo, SentrOS moved to "vault is sole source of truth…")`).
  Context the human needs: `bzroo` and `SentrOS` **already appear in the published repo** — `docs/05-knowledge-layer.md:11`, `docs/04-model-policy.md:86,99`, `docs/99-sources.md:59`. `Monitoro` does not appear anywhere in the repo.
  - **B1 (recommend):** genericize in the IMPORTED COPY ONLY (spec step 5: "source files are never rewritten by the leak gate"). `SentrOS` → `a production security-audit repo`; `bzroo, SentrOS` → `two of the operator's production repos`. This is what the acceptance leak re-scan requires — the gate is not narrowed to fit the content.
  - **B2:** delete the three context clauses. Cost: the ADRs lose their evidence chain.

- [ ] **Step 6: Present DECISION F (`aidf-v08.md:88` owner handle) and record the answer.** The hit is `https://github.com/cristian-robert/AIDevelopmentFramework/archive/refs/heads/main.tar.gz` — a public GitHub URL, not a home path, so it is `needsDecision`, not auto-genericizable.
  - **F1 (recommend):** rewrite to `https://github.com/<owner>/AIDevelopmentFramework/archive/refs/heads/main.tar.gz`. The handle is already public in `package.json:13`, so this is hygiene, and it keeps the acceptance scan a single unweakened regex.
  - **F2:** keep it and narrow the KB scan regex. **Reject** — weakening the gate to fit the content is exactly what the gate exists to prevent.

- [ ] **Step 7: Present DECISION D (step 2b disposition) and record the answer.**
  - **D1 (recommend): archive+move.** `mv "$V/projects/perfectHarnessEngineering" "$V/projects/archive/perfectHarnessEngineering"` and `mv` the five imported briefs into `$V/inbox/research/archive/`. Rationale: `guard.mjs:25` (`RECURSIVE_RM`, enforced at `:173`) denies `rm -rf`, the vault has no git and no other undo, and `mv` is reversible with one command.
  - **D2: move (delete after copy).** Blocked by `guard.mjs:25` for the folder; would need ten single-file `rm`s and destroys the in-vault undo.
  - **D3: copy (leave the vault folder in place).** **Reject** — that is the mirror ADR-001 forbade and the new boundary rule forbids; two copies of one fact.

- [ ] **Step 7b: Record the leak decisions, then re-run the gate and watch it pass.** Step 0's
  `detect` exited 1 with `reason: "leak gate"`. It is cleared by RECORDING a resolution for every
  `needsDecision` **marker** — never by rewriting `$V`. Per spec step 0 the gate evaluates the
  **planned copy**: the import set as it will be written, with the `autoGenericizable` rewrites and
  every recorded decision applied. `leakScan`'s `match` is always one of six literal tokens
  (`cristian`, `roby248`, `bzroo`, `SentrOS`, `Monitoro`, `phe-harness`), so `ledger.leakDecisions`
  is keyed by marker, lowercased — one call clears every hit of that marker.
  ```bash
  node -e 'var h=require("./.claude/state/detect-run0.json").leaks.needsDecision;var s={};h.forEach(function(x){var k=x.match.toLowerCase();s[k]=(s[k]||0)+1});console.log(JSON.stringify(s,null,2));'
  ```
  Record ONE decision per marker the command above actually printed — **never for a marker it did
  not report**. The mapping from the human answers in Steps 4-7:
  | marker | resolution | comes from |
  |---|---|---|
  | `sentros` | `genericize` | DECISION B1 — `SentrOS` → "a production security-audit repo" |
  | `bzroo` | `genericize` | DECISION B1 — `bzroo, SentrOS` → "two of the operator's production repos" |
  | `cristian` | `genericize` | DECISION F1 — `<owner>` in the AIDF tarball URL; `<sibling AIDF checkout>` / `<repo root>` / `<home>` in the brief headers (Task 6 Steps 2-4) |
  | `phe-harness` | `genericize` | Task 5 Step 6 rewrites `decisions.md:49` to `[[research/v3-agile-layer\|v3-agile-layer]]`; every prose pointer names the shared store, never the folder |
  | `monitoro` | `accept` | DECISION A1 — its only carrier, `obsidian-vault.md`, is NOT imported, so no hit reaches the planned copy |
  | `roby248` | `accept` | same rationale, **only if reported** |
  ```bash
  # exactly one line per marker the command above printed — no more, no fewer
  node cli/index.js knowledge-migrate decide sentros genericize
  node cli/index.js knowledge-migrate decide bzroo genericize
  node cli/index.js knowledge-migrate decide cristian genericize
  node cli/index.js knowledge-migrate decide phe-harness genericize
  # add `decide monitoro accept` and/or `decide roby248 accept` ONLY if the scan reported them
  node cli/index.js knowledge-migrate detect > .claude/state/detect-run1.json ; echo "detect exit=$?"
  node -e 'var d=require("./.claude/state/detect-run1.json");console.log("resolved="+d.links.resolved+" unresolved="+d.links.unresolved.length+" frozen="+d.linksBeforeFrozen);'
  node cli/index.js knowledge-migrate status
  ```
  Expected: each `decide` echoes the updated `leakDecisions` map; then `detect exit=0`; then a
  `linksBefore` summary; then a ledger reading `"status":"in-progress"` with `steps` `"0":"done"`
  and `"1":"done"`, a `leakDecisions` object, and a `linksBefore` snapshot. Steps 0 and 1 being
  `done` — and `linksBefore` existing — is what makes Task 4 onward producible at all: without it
  `knowledge-migrate verify-links` throws `No pre-migration link snapshot`.
  **`decide <marker> <genericize|redact|accept>` is increment 2's CLI form**: it writes
  `ledger.leakDecisions[<marker lowercased>]` and refuses any resolution outside those three. If the
  subcommand does not exist, increment 2 shipped without the leak-gate decision path — **STOP and
  report it; do not clear the gate by editing `$V`.**
  Note in the report: `detect` classifies over what it DETECTED, not what step 2 CONFIRMED, so most
  of these hits sit in files this migration never imports (`plans/`, `template/`, the three
  gitignored clones). Recording one decision per marker is still the only correct way to clear the
  gate; the over-scope is an increment-2 limitation, not a reason to narrow the regex.

- [ ] **Step 7c: Prove the shared store was NOT rewritten to clear the gate.** Re-run Step 3's raw
  `grep -rncE` command verbatim.
  Expected: the SAME eleven per-file counts as Step 3, matched as a set by filename. The gate is
  green and every `$V` source file still carries every hit — that is the evidence that the planned
  copy, not the source, is what the gate evaluated, and that `$V` is byte-identical through step 0.
  Any count that DROPPED means something rewrote a source file: stop, restore from the Task 4
  backup (which does not exist yet — so at this point, stop and diagnose before taking one).
  Paste both runs side by side into `## 4. Leak gate (step 0)`.

- [ ] **Step 8: Confirm the local candidates (step 2) — the human picks, nothing is auto-moved.** For each row from Step 1, record the verdict and the reason:
  | Candidate | Import? | Reason |
  |---|---|---|
  | `docs/` (14 md, tracked) | **No** | The framework's published discipline layer — shipped in `package.json:15` `files`, read by adopters. Not project-scoped knowledge. |
  | `plans/` (work artifacts) | **No** | Travel with the code branch (`work-tracking.md:23`); `knowledge-base/` sits beside them (decision 23). |
  | `reports/` (3 md, tracked) | **No** | Same. |
  | `template/` (71 md, tracked) | **No** | The shippable payload. |
  | `loop/`, `global/` | **No** | Code + opt-in hardening, not knowledge. |
  | `cole-medin-ai-coding/`, `harness-engineering-demo/`, `second-brain-starter/` (47 md, untracked) | **No** | Read-only upstream clones, gitignored (`.gitignore:24-26`); re-cloneable from GitHub. |
  Result: **zero confirmed local candidates.** The import set is the shared project folder (5 files) plus the cited briefs.

- [ ] **Step 9: Write `reports/knowledge-reconciliation.md` sections 1–4.** Create the file with:
  - `## 1. Scope` — `$R`, `$V`, the branch, the date, and "the repo is PUBLIC (`gh repo view` → PUBLIC); `knowledge-base/` is git-tracked, therefore published".
  - `## 2. Detect (step 1)` — the exact candidate table from Step 1 plus the confirm verdicts from Step 8.
  - `## 3. Cited briefs (decision 19)` — the 8 citation lines from Step 2, the 6 distinct briefs, their real line counts, and the ten uncited briefs left shared.
  - `## 4. Leak gate (step 0)` — the per-file hit counts from Step 3 **and** the identical re-run from Step 7c (side by side: the proof the source was never rewritten), the `obsidian-vault.md` token breakdown from Step 4, the `leakDecisions` map recorded at Step 7b with the marker → resolution → deciding-DECISION mapping, the note that `detect` classifies over what it DETECTED rather than what step 2 CONFIRMED, then **four `### DECISION <letter> — <one-line title>` subsections** (A, B, F, D), each naming the option chosen and its one-line rationale.

- [ ] **Step 10: Verify the report exists and names every decision.**
  ```bash
  grep -c "^### DECISION" reports/knowledge-reconciliation.md
  ```
  Expected: `4`.

- [ ] **Step 11: Commit.**
  ```bash
  git add reports/knowledge-reconciliation.md
  git commit -m "docs(knowledge): leak-gate classification and decisions for the PHE import set"
  ```

---

## Task 4: Step 3 — the mandatory, verified backup

**Files:**
- Create: `~/.phe-backups/` (tarball + `backup-result.json` + `verify-2026-08-03/`)
- Create: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/.claude/state/knowledge-migration.json` (gitignored)

**Interfaces:**
- Consumes: `cli/knowledge-migrate.js` → `backup(srcPaths, destDir, projectRoot) -> { archives: [ {src, dest, bytes, files} ] }` (THROWS if `destDir` is inside the repo — which is why `projectRoot` is passed — or inside the shared store); `writeLedger(projectRoot, patch) -> void`; `readLedger(projectRoot) -> ledger | null`. CLI forms: `knowledge-migrate backup --dest <dir>` (sources from `knowledge.shared.path` plus any `--candidate`; records `steps:{"3":"done"}` and the archive; records `"3":"failed"` and re-raises on a throw) and `knowledge-migrate record <step> <done|failed> [--status …] [--from … --to …]`.
- Produces: `~/.phe-backups/<archive>` verified byte-for-byte against `$V`, and the opened ledger at `status: "in-progress"` with `steps` 0/1/2/2b/3 `done` — the precondition every later task checks.

- [ ] **Step 1: Prove the backup guard refuses an in-repo destination (the failing test).**
  ```bash
  node -e 'var m=require("./cli/knowledge-migrate.js");try{m.backup(["/Users/cristian-robertiosef/Dev/The Vault"], process.cwd()+"/.phe-backups", process.cwd());console.log("NO THROW — BUG");}catch(e){console.log("REFUSED: "+e.message);}'
  ```
  Expected: a line starting `REFUSED: ` — never `NO THROW — BUG`.

- [ ] **Step 2: Prove it also refuses a destination inside the shared store.**
  ```bash
  node -e 'var m=require("./cli/knowledge-migrate.js");try{m.backup(["/Users/cristian-robertiosef/Dev/The Vault"],"/Users/cristian-robertiosef/Dev/The Vault/.phe-backups", process.cwd());console.log("NO THROW — BUG");}catch(e){console.log("REFUSED: "+e.message);}'
  ```
  Expected: a line starting `REFUSED: `.

- [ ] **Step 3: Take the real backup.** Only the shared store is backed up: Task 3 Step 8 confirmed **zero** local candidates, and everything in `$R` is git-tracked with a live remote (`git remote -v` → `origin https://github.com/cristian-robert/claude-code-harness.git`), so git IS the fallback there. The vault has none.
  Exactly ONE archive is taken, by the CLI, and it is the one Steps 4 and 5 verify — no second,
  never-verified backup. `backup` takes its source from `knowledge.shared.path` in the harness.json
  Task 2 Step 7 wrote (no `--candidate` is passed: there are none), and it records step 3 plus the
  archive object into the ledger itself.
  ```bash
  mkdir -p ~/.phe-backups
  node cli/index.js knowledge-migrate backup --dest "$HOME/.phe-backups"
  node -e 'var m=require("./cli/knowledge-migrate.js");var b=m.readLedger(process.cwd()).backups[0];require("fs").writeFileSync(require("os").homedir()+"/.phe-backups/backup-result.json", JSON.stringify({archives:[b]},null,2)+"\n");console.log(JSON.stringify(b,null,2));'
  ```
  Expected: the CLI prints `{"backups":[…]}` with exactly one entry, then the `node -e` echoes that
  same entry — `src` is `/Users/cristian-robertiosef/Dev/The Vault`, `dest` is under `~/.phe-backups/`,
  `bytes` > 200000, `files` ≥ 179. The `node -e` only re-shapes the ledger's own record into
  `~/.phe-backups/backup-result.json` (`{archives:[…]}`) so Steps 4 and 5 can read `.archives[0].dest`
  without re-deriving it; it takes no backup of its own.

- [ ] **Step 4: Verify the archive holds the whole markdown corpus.**
  ```bash
  ARCHIVE=$(node -e 'console.log(require(require("os").homedir()+"/.phe-backups/backup-result.json").archives[0].dest)')
  echo "$ARCHIVE"
  tar -tzf "$ARCHIVE" | grep -c '\.md$'
  find "/Users/cristian-robertiosef/Dev/The Vault" -type f -not -path '*/.obsidian/*' | wc -l
  ```
  Expected: the last two numbers are **both `179`**. If they differ, STOP — do not proceed to Task 5.

- [ ] **Step 5: Restore the archive and diff it against the source — the real verification.**
  ```bash
  ARCHIVE=$(node -e 'console.log(require(require("os").homedir()+"/.phe-backups/backup-result.json").archives[0].dest)')
  mkdir -p ~/.phe-backups/verify-2026-08-03
  tar -xzf "$ARCHIVE" -C ~/.phe-backups/verify-2026-08-03
  RESTORED=$(dirname "$(find ~/.phe-backups/verify-2026-08-03 -name CLAUDE.md | head -1)")
  echo "restored root: $RESTORED"
  diff -r -x .obsidian "/Users/cristian-robertiosef/Dev/The Vault" "$RESTORED" && echo "BACKUP VERIFIED — IDENTICAL"
  ```
  Expected final line, and nothing before it: `BACKUP VERIFIED — IDENTICAL`. (`find "$V" -name CLAUDE.md | wc -l` is `1`, so `$RESTORED` is unambiguous.)
  **The extraction directory is deliberately NOT deleted**: `guard.mjs:25` (definition; enforced at `:173`) denies `rm -rf` and `find -delete`. Cleaning `~/.phe-backups/verify-2026-08-03` is the operator's manual step, after the migration is accepted.

- [ ] **Step 6: Record the human decisions (steps 2 and 2b) in the ledger.**
  ```bash
  node cli/index.js knowledge-migrate record 2 done
  node cli/index.js knowledge-migrate record 2b done
  node cli/index.js knowledge-migrate status
  ```
  Expected: `"status": "in-progress"` with steps `0,1,2,2b,3` all `done`, `backups` holding **exactly one** archive object — the one Step 3 took and Steps 4/5 verified — and `leakDecisions` holding the map Task 3 Step 7b recorded. Steps 0/1 were recorded by `detect`'s SECOND run (Task 3 Step 7b), which returned `ok:true` because every `needsDecision` marker then had a recorded resolution; step 3 was recorded by `knowledge-migrate backup` at Step 3 above, so there is one backup and it is the verified one. 2/2b are the human decisions from Task 3.

- [ ] **Step 7: Confirm the ledger file is gitignored.**
  ```bash
  git check-ignore -v .claude/state/knowledge-migration.json
  ```
  Expected: `.gitignore:<n>:.claude/state/	.claude/state/knowledge-migration.json`.

- [ ] **Step 8: Append the backup section to the report and commit.** Add `## 5. Backup (step 3)` to `reports/knowledge-reconciliation.md` with the archive path, `bytes`, `files`, the two verification commands and their real output (`179`/`179`, `BACKUP VERIFIED — IDENTICAL`), and the note that the verification extraction is left in place because recursive delete is guard-denied.
  ```bash
  git add reports/knowledge-reconciliation.md
  git commit -m "chore(knowledge): verified backup of the shared store before migration"
  ```

---

## Task 5: Steps 4/5 — scaffold `knowledge-base/` and reconcile the five core files

**Files:**
- Create: `reports/knowledge-migration-dryrun.md` (spec step 4's DRY-RUN PLAN — written before anything else in this task)
- Create: `knowledge-base/_index.md`, `knowledge-base/architecture.md`, `knowledge-base/decisions.md`, `knowledge-base/resources.md`, `knowledge-base/runbook.md`, `knowledge-base/inbox/_index.md`
- Read-only source: `$V/projects/perfectHarnessEngineering/{_index,architecture,decisions,resources,runbook}.md`
- Consumes scaffold: `.claude/references/knowledge-base-scaffold/` (installed by Task 2)

**Interfaces:**
- Consumes: `writeLedger(projectRoot, patch) -> void`; `tools/kb-check.mjs` (exit 0 green / exit 1 red).
- Produces: `knowledge-base/` with six files written and every command-backed claim re-derived (`research/_index.md` is deliberately still the scaffold until Task 6 Step 6) — the input to Tasks 6, 7 and 9.

- [ ] **Step 0: Produce the DRY-RUN PLAN (spec step 4) — nothing is written until a human has read it.**
  Spec step 4 is a real step with a real artifact; Task 5 Step 2 calls itself "step 4's plan applied",
  and Step 12 records `"4":"done"`, so the plan has to exist. If increment 2's `--dry-run` is
  implemented (it must write NOTHING — not even the ledger), produce it by running
  `node cli/index.js knowledge-migrate detect --dry-run` first and pasting its JSON above the
  tables. Verify the "writes nothing" claim rather than assuming it: `md5 .claude/state/knowledge-migration.json`
  before and after must match. If `--dry-run` is missing, that is an increment-2 defect — report it
  and hand-write the tables; the artifact, not the JSON header, is what a human approves. Then write
  `reports/knowledge-migration-dryrun.md` with that JSON and exactly three tables:
  1. **Imports** — one row per file that will be created under `knowledge-base/`:
     `| source | destination | lines | genericization edits |` — the 5 core files from
     `$V/projects/perfectHarnessEngineering/` plus the 5 cited briefs Task 6 imports.
  2. **Shared-store changes** — one row per `$V` path Task 8 touches:
     `| path | change |` — the 5 doctrine locations, the registry row, the 4 repointed inbound
     links, the 2 `mv`s, the 2 archive stubs.
  3. **Repo changes outside `knowledge-base/`** — `| path | change |`: the 8 `docs/` citations,
     `.gitignore`, `package.json`, `AGENTS.md`, `CLAUDE.md`, the reconciliation report, the ledger.
  ```bash
  grep -c '^| ' reports/knowledge-migration-dryrun.md
  ```
  Expected: **≥ 25** table rows. Fewer means a table is incomplete — and the plan is the thing a
  human approves before any byte moves, so an incomplete one fails the step. Nothing in Tasks 5–8
  may run until this file exists and has been read.

- [ ] **Step 1: Run the KB gate and see it fail.**
  ```bash
  node tools/kb-check.mjs ; echo "exit=$?"
  ```
  Expected: a finding that `knowledge-base/` does not exist, and `exit=1`.

- [ ] **Step 2: Copy the scaffold, then the sources over it (step 4's plan applied).**
  ```bash
  cp -R .claude/references/knowledge-base-scaffold knowledge-base
  V="/Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering"
  for f in _index architecture decisions resources runbook; do cp "$V/$f.md" "knowledge-base/$f.md"; done
  ls -1 knowledge-base knowledge-base/inbox knowledge-base/research
  ```
  Expected: `knowledge-base/` holds `_index.md architecture.md decisions.md inbox research resources.md runbook.md`; `inbox/` and `research/` each hold `_index.md`.

- [ ] **Step 3: RE-DERIVE every command-backed claim — run the commands, do not pick a side.** Run all five and write the outputs down; they drive Steps 4–8. These numbers go into the knowledge base verbatim. Do not copy them from this plan — run each command and paste its output. That is the entire point of spec step 5.
  ```bash
  node template/.claude/hooks/smoke-test.mjs | tail -1
  ls -1 template/.claude/hooks/*.mjs | wc -l
  grep -cE '^## [0-9]+ · ' docs/99-sources.md
  git remote -v | head -1
  gh repo view cristian-robert/claude-code-harness --json visibility
  ```
  Expected, exactly (verified 2026-08-03):
  ```
  <SMOKE>
         7
  17
  origin	https://github.com/cristian-robert/claude-code-harness.git (fetch)
  {"visibility":"PUBLIC"}
  ```
  The resolution table this produces — the whole point of spec step 5's re-derivation rule:
  | Imported claim | Source | Command | Truth |
  |---|---|---|---|
  | "49/49 hook fixtures" | `_index.md:41` | `node template/.claude/hooks/smoke-test.mjs` | **`<SMOKE>`** |
  | "19+ fixtures" | `runbook.md:23` | same | **`<SMOKE>`** |
  | "4 tested Node hooks" | `_index.md:13` | `ls template/.claude/hooks/*.mjs` → 7 files | **6 hooks + smoke-test** |
  | "11 sources" | `_index.md:13` | `grep -cE '^## [0-9]+ · ' docs/99-sources.md` | **17** |
  | "local git, no remote yet" | `resources.md:17` | `git remote -v` | **remote exists, repo is PUBLIC** |
  | "6 tested hooks" | `architecture.md:25` | `ls template/.claude/hooks/*.mjs` | correct — no change |
  | "13+ adversarial rounds, composite 92" | `_index.md:42` | *none* | carried over verbatim, flagged in the report (Known limit 5) |
  | "4 hooks, 5 skills, 1 agent, ~4 rules" | `decisions.md:106` (ADR-002) | *historical* | left as recorded — an ADR states what was decided then |

- [ ] **Step 4: Rewrite `knowledge-base/_index.md` in full.** Replace the copied file with exactly:

```markdown
---
type: project-index
status: active
kind: library
repo: .
updated: 2026-08-03
tags:
  - project
---

# Perfect Harness Engineering (PHE) — knowledge base

A harness-engineering framework for Claude Code: a shippable `template/` payload (AGENTS.md + two-tier rules + 6 tested Node hooks + PIV+E pipeline skills wired to the superpowers plugin), an npm installer (`cli/`), an autonomous loop driver, a context-tax ledger, an opt-in global hardening layer, and a `docs/` layer distilling the discipline from 17 sources (`docs/99-sources.md`).

> [!info] At a glance
> - **Status:** active
> - **Kind:** library (framework / template payload)
> - **Repo:** this repository — `github.com/<owner>/claude-code-harness`, **PUBLIC**
> - **Deploy:** npm `perfect-harness-engineering`; adopters run `npx perfect-harness-engineering init`

## START HERE (agent SOP)

Read this `_index.md` first, then:

1. [[architecture]] — the four-layer model and repo layout.
2. [[decisions]] — the ADRs behind every load-bearing design call.
3. [[resources]] — source-material locations; pointers only, no credentials.
4. [[runbook]] — smoke tests, ledger, loop driver, adoption steps.
5. [[research/_index|research]] — the research briefs `docs/` cites.

Knowledge that generalizes past PHE does NOT live here. It lives in the shared store configured at `.claude/harness.json` → `knowledge.shared.path`, under its `wiki/` and `agent-kb/` folders. Promotion **MOVES** a fact there and leaves a pointer line under "Promoted" below — exactly one copy of any fact exists.

## Contents

- [[architecture]] — four layers, template payload map.
- [[decisions]] — ADR log, ADR-001…ADR-016, newest first.
- [[resources]] — repo, reference clones, research provenance.
- [[runbook]] — verify / measure / run the loop / adopt.
- [[inbox/_index|inbox]] — raw project capture, untriaged.
- [[research/_index|research]] — the five briefs `docs/` cites.

## Promoted to the shared store

_(none yet — `/evolve` appends one pointer line here every time it MOVES a fact out)_

## Current focus

- [x] v0.1 core + v0.2 (compaction survival, knowledge skills, agent trio, statusline) + v0.3 (agile delivery-org layer) built and smoke-verified: `node template/.claude/hooks/smoke-test.mjs` → `<SMOKE>` (re-derived 2026-08-03; the imported copies claimed "49/49" and "19+" — both wrong).
- [x] Confidence hardening: 13+ adversarial 4-lens evaluator rounds, converged to zero blockers across all four lenses (round 13, composite 92). No command stands behind these numbers — carried over as recorded.
- [ ] Harvest generalizable harness lessons into the shared `agent-kb/` (four of its five folders are still empty scaffolds).
- [ ] Decide whether PHE's template becomes AIDF v1.0's payload or stays a standalone framework.

> [!warning] Index Law
> Add/rename/move/delete any file under `knowledge-base/` → update this `_index.md`. New subfolder → new `_index.md`. Mechanically gated by `node tools/kb-check.mjs`.
```

- [ ] **Step 5: Apply four edits to `knowledge-base/architecture.md`.** Keep everything else byte-identical to the source.
  1. Frontmatter: `updated: 2026-07-14` → `updated: 2026-08-03`.
  2. Line 17, replace `this vault for knowledge` with: `` `knowledge-base/` in-repo for project knowledge, the shared store for what generalizes ``.
  3. The Layer-4 table row (line 29), replace the whole row with:
     `| `knowledge-base/` + `.claude/references/knowledge-protocol.md` | Layer 4 — knowledge | Two stores, one boundary rule: project-scoped facts local, generalized facts shared, promotion MOVES. The protocol carries the per-stage RETRIEVE/CAPTURE table and the two retrieval ladders. `/evolve` is the bridge; the reviewer now READS `knowledge-base/` (ADR-015 reverses ADR-012's isolation for the KB only) |`
     The imported row's "cited by 9 template files" count is dropped, not re-guessed — the file it counted (`vault-protocol.md`) no longer exists.
  4. The mermaid block, **line 44 only**: replace `    E --> VLT[(vault: wiki / agent-kb)]` with the two lines
     `    E --> KB[(knowledge-base/)]` and `    E --> SH[(shared store: wiki / agent-kb)]`.
  5. Integration points (line 51), replace the `**This vault**` bullet with:
     `- **Knowledge stores** — project-scoped facts in `knowledge-base/` (this repo, git-tracked, reviewed); generalized facts in the shared store at `.claude/harness.json` → `knowledge.shared.path`. Promotion to `wiki/`/`agent-kb/` is ask-first via `/evolve` under the Index Law, and it MOVES.`

- [ ] **Step 6: Apply three genericization edits to `knowledge-base/decisions.md`** (DECISION B1 and the `phe-harness` wikilink; the SOURCE file in `$V` is never touched).
  1. Frontmatter: `updated: 2026-07-14` → `updated: 2026-08-03`.
  2. Line 49: `[[inbox/research/phe-harness/v3-agile-layer|v3-agile-layer]]` → `[[research/v3-agile-layer|v3-agile-layer]]`.
  3. Line 57: `SentrOS already proved the delegation pattern in production` → `A production security-audit repo already proved the delegation pattern`.
  4. Line 113: `lived practice (bzroo, SentrOS moved to "vault is sole source of truth; repo docs locate code only")` → `lived practice (two of the operator's production repos moved to "vault is sole source of truth; repo docs locate code only")`.

- [ ] **Step 7: Confirm the three doctrine ADRs arrived with the copy.** Increment 1 wrote them
  into the vault file this KB was copied from, so they should already be here:
  ```bash
  grep -n "^## ADR-01[456]" knowledge-base/decisions.md
  ```
  Expected: three lines — `## ADR-016 …`, `## ADR-015 …`, `## ADR-014 …`. If any one is MISSING,
  insert only that one from the block below, immediately after the intro paragraph (before
  `## ADR-013`). Never insert one that is already present — duplicate ADR headings are worse
  than a missing one.

```markdown
## ADR-016 — ADR-010's tracking root does not cover `knowledge-base/`

- **Date:** 2026-08-03
- **Status:** accepted (amends ADR-010; spec: `docs/design/2026-08-03-project-local-knowledge-base.md`)
- **Context:** ADR-010 put `backlog/` + `sprints/` in the primary checkout only, and `guard.mjs:220` permits base-branch commits that stage ONLY those two paths. A new top-level knowledge folder needs an explicit side of that line, or the guard's narrow exception gets stretched by whoever hits the deny first.
- **Decision:** `knowledge-base/` is a WORK ARTIFACT, like `plans/` and `reports/` (`work-tracking.md:23`): it travels with the code branch and merges with the PR. It is NOT a tracking-root file. Consequently `guard.mjs` needs no change — staging `knowledge-base/*` on the base branch is denied at `guard.mjs:224`, which is the correct behaviour.
- **Consequences:** Mid-work knowledge writes dirty the tree during `/implement`; `/evolve` stages them as one `docs(kb):` commit on the feature branch. A finding on an abandoned branch dies with it — the same property `plans/` and `reports/` already have, accepted as the cost.

## ADR-015 — Reviewer isolation reversed for `knowledge-base/` (base-branch read)

- **Date:** 2026-08-03
- **Status:** accepted (reverses the scope of ADR-003/ADR-012 for the KB only)
- **Context:** ADR-012 kept the reviewer vault-free so fresh eyes stay fresh. That was correct when knowledge sat in an external store the reviewer could not cheaply reach. With the KB in-repo, the reviewer is the only actor positioned to catch a diff that contradicts a recorded decision.
- **Decision:** The reviewer brief gains "read `knowledge-base/decisions.md` + `architecture.md`; flag any diff that contradicts a recorded decision." Because `/review-branch` diffs `<base>...HEAD` at pipeline step 5 and the KB commit lands at step 7, the reviewer reads the BASE-branch KB (`git show <base>:knowledge-base/…`) — not the branch's own in-flight edits, which would let the branch grade its own homework.
- **Consequences:** Contradiction-with-a-decision becomes a reviewable defect class. Isolation from the SHARED store is unchanged. Decision 2's "reviewed" still means human PR review.

## ADR-014 — Two stores, one boundary rule: project knowledge lives in the repo (reverses ADR-001)

- **Date:** 2026-08-03
- **Status:** accepted (reverses ADR-001; spec: `docs/design/2026-08-03-project-local-knowledge-base.md`)
- **Context:** ADR-001 made the vault the sole cross-project store and forbade mirrors because "duplicated knowledge drifts". Its own recorded downside — "absolute-path pointer breaks on other machines/CI" — is what actually bit: the pointer is unportable, the knowledge is unreviewable in a PR, it does not survive a clone, and `sources:` paths in it are unverifiable. Four of five `agent-kb/` folders are still empty, so the shared store did not buy the harvest it promised either.
- **Decision:** Two stores with one boundary rule. Project-scoped facts live in `<repo>/knowledge-base/`, git-tracked and reviewed. Generalized facts live in the shared store (`wiki/`, `agent-kb/`, `wiki/stack/<tool>/`). **Promotion MOVES**: `/evolve` deletes the local file and leaves a one-line pointer in `knowledge-base/_index.md`. Exactly one copy of any fact exists, which is why this is not the mirror ADR-001 forbade.
- **Consequences:** Knowledge is portable, clone-surviving, reviewable, and its relative `sources:` paths are verifiable. Cost: it does NOT fix harvest — `/evolve` stays ask-first — and findings on abandoned branches are lost (ADR-016).
```

- [ ] **Step 8: Rewrite `knowledge-base/resources.md` in full.** Replace the copied file with exactly:

```markdown
---
type: reference
project: perfectHarnessEngineering
updated: 2026-08-03
tags:
  - resources
---

# Resources — Perfect Harness Engineering

Where everything lives. No deploy secrets, no credentials — this is a framework/template repo published to npm.

## Links

| What | Where |
|---|---|
| Code repo | this repository — `github.com/<owner>/claude-code-harness`, **PUBLIC** (`git remote -v`, `gh repo view`, re-derived 2026-08-03) |
| Package | npm `perfect-harness-engineering`; adopters run `npx perfect-harness-engineering init` |
| Reference sources | coleam00/{harness-engineering-demo, cole-medin-ai-coding, second-brain-starter} on GitHub — cloned into the repo root, gitignored, read-only source material |
| Provenance ledger | `docs/99-sources.md` — 17 numbered sources with what was taken from each (re-derived 2026-08-03; the imported copy said 11) |
| Sibling framework | `<sibling AIDF checkout>` (AIDF v0.8, branch `refactor/framework-v0.8`) — its defect history informed PHE's design; deep read in `research/aidf-v08.md` |
| Shared knowledge store | `.claude/harness.json` → `knowledge.shared.path`, folders `wiki/` and `agent-kb/` |

## Infrastructure

- **Hosting:** none. The repo is the product; adopters install the payload via npm.
- **Database:** none.
- **Third-party services:** the superpowers plugin (soft dependency — every pipeline skill has an inline fallback).

## Credentials index

> [!danger] Pointers only — never paste a secret value into `knowledge-base/`
> PHE handles no secrets of its own. Its guard hook and permission denies exist to keep agents OUT of `.env*`/key files in ADOPTING projects; real values are always user-managed outside the repo. `node tools/kb-check.mjs` scans this folder for secret-shaped strings on every `/validate` and again in `/evolve`'s apply step.

| Secret | Lives in | Notes |
|---|---|---|
| (none) | — | The framework has no credentials of its own |

## External references

- Anthropic: engineering/harness-design-long-running-apps · engineering/effective-context-engineering-for-ai-agents · engineering/claude-code-best-practices · engineering/building-effective-agents · engineering/writing-tools-for-agents · engineering/multi-agent-research-system
- Official contracts: code.claude.com/docs/en/{hooks,hooks-guide,memory,settings,sub-agents,skills,plugins} — versioned; re-verify on every Claude Code upgrade.
- Community: ghuntley.com/ralph · github.com/humanlayer/12-factor-agents · humanlayer.dev/blog/brief-history-of-ralph · github.com/obra/superpowers · github.com/disler/claude-code-hooks-mastery · github.com/Wirasm/PRPs-agentic-eng · addyosmani.com/blog/agent-harness-engineering
```

- [ ] **Step 9: Rewrite `knowledge-base/runbook.md` in full.** Replace the copied file with exactly:

````markdown
---
type: note
project: perfectHarnessEngineering
updated: 2026-08-03
tags:
  - runbook
---

# Runbook — Perfect Harness Engineering

How to verify, measure and adopt the framework. Commands you would otherwise re-derive under pressure. Every number below was produced by running the command on 2026-08-03.

## Local setup

```bash
node --version   # needs >= 18; hooks, tools and the loop driver are dependency-free
```

## Test (always after touching hooks)

```bash
npm test                                     # full suite: cli/*.test.js + the hook smoke test
node template/.claude/hooks/smoke-test.mjs   # the full fixture corpus (<SMOKE>) piped through every hook via the real stdin contract
```

Last measured: `<SMOKE>`. The imported vault copies claimed "49/49" and "19+"; both were stale, and both were replaced by running the command rather than by picking a side.

## Measure (always after touching AGENTS.md / rules / skills)

```bash
node tools/context-ledger.mjs template   # payload always-loaded tax; flags the globs: footgun
node tools/context-ledger.mjs .          # this repo's own always-loaded tax (dogfood)
node tools/kb-check.mjs                  # knowledge-base gate: _index.md per folder, no scaffold leftovers, no secret shapes
```

Last measured: payload `<LEDGER> / 2000 (83%) WARN`; repo root `<ROOT_LEDGER> / 2000 OK`.

## Re-install the payload into this repo (dogfood)

```bash
node tools/install-local-payload.mjs     # drives cli/init.js backupAndCopy against LOCAL template/
```

`npx perfect-harness-engineering init` downloads the PUBLISHED tarball (`cli/init.js` → `TARBALL_URL` — grep for it, do not trust a line number), so it cannot see unreleased `template/` edits. Use the line above after every payload change, or the installed `.claude/` silently drifts from `template/`.

## Adopt into another project

```bash
cd <project> && npx perfect-harness-engineering init
```

Then run `/harness-init` in the agent: it fits the payload to the stack, arms the gate, configures work tracking, and routes to `/knowledge-migrate` when the project already has knowledge somewhere.

## Run the autonomous loop

```bash
cp loop/PROMPT.template.md loop/PROMPT.md    # fill Goal + numbered Spec Items
node loop/loop.mjs --max-iter 10 --worktree  # DONE.txt existence is the only stop authority
tail -f loop/loop.log
```

## Common ops

- New rule → must cite its incident; run the ledger; consider what to cut.
- Model upgrade → ablation pass: remove one harness component at a time on a known task (`docs/03-loops.md`).
- Framework work itself → dogfood the pipeline: `/plan-work → /implement → /validate → /review-branch → /evolve`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Hook never fires | Wrong matcher, not in settings.json, or the script reads argv | `smoke-test.mjs`; check the `/hooks` menu shows it |
| Rule ignored | File too long or ambiguous; or `globs:` instead of `paths:` | The ledger warns on `globs:`; prune the file |
| Stop gate loops | `stop_hook_active` not honored (regression) | The smoke test covers it; the platform force-ends after 8 blocks anyway |
| Gate never runs | `stopGate` empty in `.claude/harness.json` | Arm it; the session-start hook reports gate status every session |
| `.claude/` differs from `template/` | Someone edited `template/` without re-installing | `node tools/install-local-payload.mjs` |
| `kb-check` red on a scaffold file | A `knowledge-base/` file is still byte-identical to the shipped placeholder | Fill it in — that is the check working |
| Loop never converges | Spec items are not mechanically verifiable | Rewrite PROMPT.md spec items as checkable statements |
````

- [ ] **Step 10: Fill `knowledge-base/inbox/_index.md`.** The scaffold copy is byte-identical to the shipped placeholder and therefore fails `kb-check` (b). Replace it with exactly:

```markdown
---
type: index
folder: knowledge-base/inbox
updated: 2026-08-03
tags:
  - index
---

# knowledge-base / inbox

**Raw project capture, untriaged.** Anything learned mid-work about PHE that does not yet belong in `architecture.md`, `decisions.md`, `resources.md` or `runbook.md` lands here first. Project-scoped only — tool/library research staging stays in the SHARED store's research inbox (decision 13).

## Contents

_(empty — nothing captured yet)_

## Agent SOP

1. Capture as `<topic>.md`. One file per topic; no subfolders unless a topic outgrows one file (then it needs its own `_index.md` — Index Law, gated by `node tools/kb-check.mjs`).
2. `/evolve` triages: promote into the four core files, MOVE to the shared store if it generalizes, or delete.
3. Update this Contents list on every add, rename, move or delete.
```

- [ ] **Step 11: Run the KB gate — it must be RED on exactly one file.**
  ```bash
  node tools/kb-check.mjs ; echo "exit=$?"
  ```
  Expected: `exit=1` with exactly ONE finding, and it must name `knowledge-base/research/_index.md` as still byte-identical to the shipped scaffold placeholder — Task 6 Step 6 is what rewrites it. This is deterministic: nothing in Task 5 touched that file. `exit=0`, or any other finding, means STOP and diagnose — the six files just written are not what this step assumed.

- [ ] **Step 12: Record the manifest and step 4/5 status in the ledger.**
  ```bash
  node cli/index.js knowledge-migrate record 4 done
  V="/Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering"
  for f in _index architecture decisions resources runbook; do
    node cli/index.js knowledge-migrate record 5 done --from "$V/$f.md" --to "knowledge-base/$f.md"
  done
  node -e 'console.log(JSON.stringify(require("./cli/knowledge-migrate.js").readLedger(process.cwd()).manifest,null,2));'
  ```
  Expected: `4` recorded `done`, five `record 5 done` payloads each echoing their `from`/`to`, then five `{from, to}` pairs printed. `record --from/--to` appends ONE manifest entry per call (increment 2 ships both flags; `--from` without `--to` is a refusal), so the manifest is written by the same command that records the step — no raw `writeLedger` anywhere in this plan.

- [ ] **Step 13: Commit.**
  ```bash
  git add knowledge-base reports/knowledge-migration-dryrun.md
  git commit -m "feat(knowledge): knowledge-base/ core files migrated and re-derived"
  ```
  Expected: 8 files changed (the six written above, the still-scaffold `knowledge-base/research/_index.md` which Task 6 Step 6 rewrites, and the dry-run plan). `reports/knowledge-migration-dryrun.md` is declared git-tracked in the File Structure table — this is the step that stages it.

---

## Task 6: Step 5 (cont.) — import the cited briefs and repoint `docs/`

**Files:**
- Create: `knowledge-base/research/aidf-v08.md`, `anthropic-agents-more.md`, `claude-code-docs.md`, `second-brain-starter.md`, `v3-agile-layer.md`
- Rewrite: `knowledge-base/research/_index.md`
- Modify: `docs/04-model-policy.md` (lines 98, 100, 101), `docs/05-knowledge-layer.md` (the three `## Sources` bullets — grep for the literal paths; increment 1 rewrote this file, so its line numbers are not 115/118/119 any more), `docs/06-delivery-org.md` (line 125), `docs/99-sources.md` (line 77)

**Interfaces:**
- Consumes: DECISIONS A1, F1 from Task 3; `writeLedger(projectRoot, patch) -> void`.
- Produces: `knowledge-base/research/` with 5 briefs + an `_index.md`, and `docs/` citations that resolve to repo-relative paths — the input to Task 7's link verification and Task 9's leak re-scan.

- [ ] **Step 1: Copy the five briefs.** `obsidian-vault.md` is deliberately excluded (DECISION A1).
  ```bash
  B="/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness"
  for f in aidf-v08 anthropic-agents-more claude-code-docs second-brain-starter v3-agile-layer; do cp "$B/$f.md" "knowledge-base/research/$f.md"; done
  wc -l knowledge-base/research/*.md
  ```
  Expected: `357 aidf-v08.md`, `578 anthropic-agents-more.md`, `1580 claude-code-docs.md`, `410 second-brain-starter.md`, `449 v3-agile-layer.md` (plus the scaffold `_index.md`).

- [ ] **Step 2: Genericize `knowledge-base/research/aidf-v08.md`** — three edits, on the IMPORTED COPY only.
  1. Line 3: `Source: \`/Users/cristian-robertiosef/Dev/AIDevelopmentFramework-1\`` → `` Source: `<sibling AIDF checkout, branch refactor/framework-v0.8>` ``.
  2. Line 4: `Comparison baseline: \`/Users/cristian-robertiosef/Dev/AIDevelopmentFramework\`` → `` Comparison baseline: `<sibling AIDF checkout, released v0.7.0 on main>` ``.
  3. Line 88 (DECISION F1): `https://github.com/cristian-robert/AIDevelopmentFramework/archive/refs/heads/main.tar.gz` → `https://github.com/<owner>/AIDevelopmentFramework/archive/refs/heads/main.tar.gz`.

- [ ] **Step 3: Genericize `knowledge-base/research/second-brain-starter.md`** — one edit.
  Line 3: `Source: \`/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/second-brain-starter\` (local clone of \`github.com/coleam00/second-brain-starter\`)` → `` Source: `<repo root>/second-brain-starter` (gitignored local clone of `github.com/coleam00/second-brain-starter`) ``.

- [ ] **Step 4: Genericize `knowledge-base/research/claude-code-docs.md`** — two edits inside the SessionStart fixture JSON.
  Line 374: `"transcript_path": "/Users/.../.claude/projects/.../00893aaf-....jsonl",` → `"transcript_path": "<home>/.claude/projects/<project>/00893aaf-….jsonl",`
  Line 375: `"cwd": "/Users/...",` → `"cwd": "<project root>",`

- [ ] **Step 5: Confirm `anthropic-agents-more.md` and `v3-agile-layer.md` need no edit.**
  ```bash
  grep -cE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' knowledge-base/research/anthropic-agents-more.md knowledge-base/research/v3-agile-layer.md
  ```
  Expected: `knowledge-base/research/anthropic-agents-more.md:0` and `knowledge-base/research/v3-agile-layer.md:0`.

- [ ] **Step 6: Rewrite `knowledge-base/research/_index.md` in full.** Note that the literal string `phe-harness` must NOT appear — it is in the leak regex. The `docs/05-knowledge-layer.md:NNN` citations in the block below are pre-increment-1 line numbers: substitute the real ones from Task 3 Step 2's grep output before writing the file.

```markdown
---
type: index
folder: knowledge-base/research
updated: 2026-08-03
tags:
  - index
  - research
---

# knowledge-base / research

The research briefs `docs/` cites, imported from the shared store on 2026-08-03 (decision 19: **only the cited briefs travel; uncited ones stay shared**). Written by research agents 2026-07-07/08. Raw distillations — when a conclusion stabilizes into framework doctrine it belongs in [[decisions]] or the shared `agent-kb/`, not here.

## Contents

- [[research/aidf-v08|aidf-v08]] (357 lines) — AIDF v0.8 working-tree deep read: pipeline, rules, hooks, defect history. Cited by `docs/04-model-policy.md:98`.
- [[research/anthropic-agents-more|anthropic-agents-more]] (578 lines) — Claude Code best practices, building-effective-agents, tools, the multi-agent research system (the ~15× token figure). Cited by `docs/04-model-policy.md:101`.
- [[research/claude-code-docs|claude-code-docs]] (1580 lines) — exact platform contracts: hooks, memory, settings, subagents, skills, plugins. Cited by `docs/05-knowledge-layer.md:119`.
- [[research/second-brain-starter|second-brain-starter]] (410 lines) — memory routing, SOUL/MEMORY files, guardrail patterns. Cited by `docs/05-knowledge-layer.md:118`.
- [[research/v3-agile-layer|v3-agile-layer]] (449 lines) — agile delivery-org layer: BMAD deep dive, rival role systems, GitHub-issues vs file-backlog mechanics, ceremony distillation. Cited by `docs/06-delivery-org.md:125` and `docs/99-sources.md:77`.

## Left in the shared store, deliberately

- **The vault-conventions brief** (540 lines) — cited by `docs/04-model-policy.md:100` and `docs/05-knowledge-layer.md:115`, but NOT imported. It is a file-by-file survey of the operator's private knowledge store including two unrelated production products; 85 personal-marker hits, most of them another product's folder structure. This repo is PUBLIC and `knowledge-base/` is git-tracked, so importing it would publish that structure. It stays in the shared store's research inbox — reach it through `.claude/harness.json` → `knowledge.shared.path`. Recorded as DECISION A in `reports/knowledge-reconciliation.md`.
- Ten further briefs in the same shared folder are cited by nothing in `docs/` and stay there under decision 19.

## Agent SOP

1. Working on PHE design? Read the relevant brief here before re-deriving from primary sources.
2. A brief is RAW. Any claim with a command behind it gets re-derived by running the command, never quoted from the brief.
3. New brief arrives (a `docs/` line starts citing it) → import it, genericize it, add a Contents row here (Index Law, gated by `node tools/kb-check.mjs`).
```

- [ ] **Step 7: Repoint the eight `docs/` citations.** Exact replacements:
  - `docs/04-model-policy.md:98`: `` `~/Dev/The Vault/inbox/research/phe-harness/aidf-v08.md`). `` → `` `knowledge-base/research/aidf-v08.md`). ``
  - `docs/04-model-policy.md:99-100`: replace the two-line bullet
    `- The Vault, SentrOS \`dev-workflow-and-tooling.md\` — explicit-dispatch discipline, security-framing` / `  gotcha (research brief: \`~/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md\`).`
    with
    `- The Vault, SentrOS \`dev-workflow-and-tooling.md\` — explicit-dispatch discipline, security-framing` / `  gotcha (research brief in the SHARED store's research inbox — see \`knowledge-base/research/_index.md\`).`
  - `docs/04-model-policy.md:101`: `(research: \`anthropic-agents-more.md\`)` → `(research: \`knowledge-base/research/anthropic-agents-more.md\`)`
  - `docs/05-knowledge-layer.md`, the `obsidian-vault.md` bullet: replace `` Research brief:\n  `~/Dev/The Vault/inbox/research/phe-harness/obsidian-vault.md`. `` with `` Research brief in the SHARED store's research inbox — see `knowledge-base/research/_index.md`. ``
  - same file, the `second-brain-starter` bullet: `` Research brief: `second-brain-starter.md`. `` → `` Research brief: `knowledge-base/research/second-brain-starter.md`. ``
  - same file, the Claude Code docs bullet: `` `~/Dev/The Vault/inbox/research/phe-harness/claude-code-docs.md`. `` → `` `knowledge-base/research/claude-code-docs.md`. ``
  - `docs/06-delivery-org.md:125`: `` - v3 research brief — vault `inbox/research/phe-harness/v3-agile-layer.md` `` → `` - v3 research brief — `knowledge-base/research/v3-agile-layer.md` ``
  - `docs/99-sources.md:77`: `` Full brief in the vault: `inbox/research/phe-harness/v3-agile-layer.md`. `` → `` Full brief: `knowledge-base/research/v3-agile-layer.md`. ``

- [ ] **Step 8: Verify every repointed citation resolves to a file that exists.**
  ```bash
  grep -rhoE 'knowledge-base/research/[a-z0-9-]+\.md' docs/ | sort -u | while read -r p; do test -f "$p" && echo "OK  $p" || echo "MISSING $p"; done
  ```
  Expected exactly five `OK ` lines and zero `MISSING`:
  ```
  OK  knowledge-base/research/aidf-v08.md
  OK  knowledge-base/research/anthropic-agents-more.md
  OK  knowledge-base/research/claude-code-docs.md
  OK  knowledge-base/research/second-brain-starter.md
  OK  knowledge-base/research/v3-agile-layer.md
  ```

- [ ] **Step 9: Verify no vault-path citation survives in `docs/`.**
  ```bash
  grep -rn "inbox/research/phe-harness" docs/ | grep -v "2026-08-03" ; echo "exit=$?"
  ```
  Expected: no output and `exit=1` (grep found nothing).

- [ ] **Step 10: Run the KB gate and the leak scan.**
  ```bash
  node tools/kb-check.mjs ; echo "kb-check exit=$?"
  grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' knowledge-base/ ; echo "leak exit=$?"
  ```
  Expected: `kb-check exit=0`, no leak output, `leak exit=1`.

- [ ] **Step 11: Extend the ledger manifest and commit.**
  One `record` per move — `--from`/`--to` append exactly one manifest entry each, so the manifest is
  built by the same command that records the step, never by a raw `writeLedger`.
  ```bash
  B="/Users/cristian-robertiosef/Dev/The Vault/inbox/research/phe-harness"
  for f in aidf-v08 anthropic-agents-more claude-code-docs second-brain-starter v3-agile-layer; do
    node cli/index.js knowledge-migrate record 5 done --from "$B/$f.md" --to "knowledge-base/research/$f.md"
  done
  node -e 'console.log(require("./cli/knowledge-migrate.js").readLedger(process.cwd()).manifest.length);'
  git add knowledge-base docs
  git commit -m "feat(knowledge): import the 5 cited research briefs; repoint docs/ citations"
  ```
  Expected: five `record` payloads each echoing their `from`/`to`, then `10`; the commit touches 10 files.

---

## Task 7: Steps 6/6b — rewrite wikilinks KB-relative, then verify none regressed

**Files:**
- Modify: `knowledge-base/_index.md` (wikilinks on the lines carried over from the source `_index.md:25-28,30,34-37,43,47`)
- Verify: every file under `knowledge-base/`

**Interfaces:**
- Consumes: `cli/knowledge-migrate.js` → `resolveLinks(files) -> { resolved: [...], unresolved: [...] }` (fence-aware, honors escaped pipe); `verifyLinks(before, after) -> { regressed: [ {file, link} ] }`; `writeLedger(projectRoot, patch) -> void`.
- Produces: a `regressed` array holding exactly ONE entry — the accepted, explained drop of `[[projects/_index|projects/_index]]` — and a documented `unresolved` list; both quoted verbatim into the report by Task 9.

- [ ] **Step 1: Capture the BEFORE resolution over the source files (still untouched in `$V`).**
  ```bash
  node -e 'var m=require("./cli/knowledge-migrate.js");var V="/Users/cristian-robertiosef/Dev/The Vault/";var P=V+"projects/perfectHarnessEngineering/";var B=V+"inbox/research/phe-harness/";var f=["_index","architecture","decisions","resources","runbook"].map(function(n){return P+n+".md"}).concat(["aidf-v08","anthropic-agents-more","claude-code-docs","second-brain-starter","v3-agile-layer"].map(function(n){return B+n+".md"}));var r=m.resolveLinks(f);require("fs").writeFileSync(".claude/state/links-before.json",JSON.stringify(r,null,2)+"\n");console.log("resolved="+r.resolved.length+" unresolved="+r.unresolved.length);'
  ```
  Expected: `resolved=13 unresolved=3`. The 13 are the 12 wikilinks in the source `_index.md` (`:25-28`, `:30` ×2, `:34-37`, `:43`, `:47`) plus `decisions.md:49` (1) — run the cross-check below rather than trusting the count. This snapshot is scoped to the **confirmed** 11-file import set; `ledger.linksBefore` (written by `detect` at Task 3) is deliberately broader — see Step 5.
  ```bash
  grep -noE '\[\[[^]]+\]\]' "/Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/"*.md | wc -l
  ```
  Expected: `13`.

- [ ] **Step 2: Read the 3 unresolved entries and confirm they are NOT links.**
  ```bash
  node -e 'console.log(JSON.stringify(require("./.claude/state/links-before.json").unresolved,null,2));'
  ```
  Expected three entries, all inline-code bracket expressions that a fence-aware resolver cannot distinguish from a wikilink:
  - `aidf-v08.md:144` → `[[:<:]]` — a POSIX word-boundary atom in inline backticks.
  - `aidf-v08.md:144` → `[[:>:]]` — same.
  - `claude-code-docs.md:669` → `[[ $- == *i* ]]` — a bash test in inline backticks.
  `claude-code-docs.md:602` (`if [[ "$FILE_PATH" == *"$pattern"* ]]`) must NOT appear — it sits inside a fenced block and the resolver skips it. If it DOES appear, the resolver's fence handling is broken and this is a bug report against increment 2, not something to patch here.
  Per spec step 6 these are **reported, never guessed**. No rewrite.

- [ ] **Step 3: Rewrite the wikilinks in `knowledge-base/_index.md`.** Task 5 Step 4 already wrote this file with KB-relative links; this step verifies rather than edits. The mapping applied was:
  | Source link | KB-relative form |
  |---|---|
  | `[[projects/perfectHarnessEngineering/architecture\|architecture]]` | `[[architecture]]` |
  | `[[projects/perfectHarnessEngineering/decisions\|decisions]]` | `[[decisions]]` |
  | `[[projects/perfectHarnessEngineering/resources\|resources]]` | `[[resources]]` |
  | `[[projects/perfectHarnessEngineering/runbook\|runbook]]` | `[[runbook]]` |
  | `[[wiki/_index\|wiki]]`, `[[agent-kb/_index\|agent-kb]]` | **not links** — cross-store targets; rewritten as prose naming `.claude/harness.json` → `knowledge.shared.path` (step 6's "report, never guess": a wikilink that cannot resolve inside the KB must not pretend to) |
  | `[[projects/_index\|projects/_index]]` | **dropped** — the Index Law warning now names `knowledge-base/` and `node tools/kb-check.mjs` |
  And in `decisions.md:49`: `[[inbox/research/phe-harness/v3-agile-layer\|v3-agile-layer]]` → `[[research/v3-agile-layer\|v3-agile-layer]]` (Task 5 Step 6).

- [ ] **Step 4: Capture the AFTER resolution over `knowledge-base/`.**
  ```bash
  node -e 'var m=require("./cli/knowledge-migrate.js");var g=require("fs");var files=[];(function walk(d){for(var e of g.readdirSync(d,{withFileTypes:true})){var p=d+"/"+e.name;if(e.isDirectory())walk(p);else if(e.name.endsWith(".md"))files.push(p);}})("knowledge-base");var r=m.resolveLinks(files);g.writeFileSync(".claude/state/links-after.json",JSON.stringify(r,null,2)+"\n");console.log("files="+files.length+" resolved="+r.resolved.length+" unresolved="+r.unresolved.length);'
  ```
  Expected: `files=12 resolved=17 unresolved=3` — 11 from `knowledge-base/_index.md`, 5 from `research/_index.md`, 1 from `decisions.md:49`, plus the same three inline-code bracket expressions from Step 2.

- [ ] **Step 5: Run the link verifier (step 6b) — the gate.** This is the ONE place Task 3 Step 0's
  "go through the CLI" rule is deliberately suspended, and the exemption is narrow and reasoned:
  `knowledge-migrate verify-links` compares `ledger.linksBefore` — which `detect` snapshots over its
  **full** import set, i.e. the shared project folder plus EVERY repo root dir holding markdown
  (`plans/` alone carries ~96 wikilink occurrences — re-derive it, it drifts every time a plan is
  edited; `template/` 56) — against `knowledge-base/` alone.
  Every one of those links would key-miss and be reported as regressed, drowning the single real
  signal. Task 3 Step 8 confirmed **zero** local candidates, so the correct BEFORE set is the
  11-file confirmed import set captured in Step 1, and the comparison below is scoped to it.
  Record this in `## 7. Links` as a real increment-2 limitation: `detect` snapshots what it
  DETECTED, not what step 2 CONFIRMED.
  ```bash
  node -e 'var m=require("./cli/knowledge-migrate.js");var f=require("fs");var b=JSON.parse(f.readFileSync(".claude/state/links-before.json","utf-8"));var a=JSON.parse(f.readFileSync(".claude/state/links-after.json","utf-8"));var v=m.verifyLinks(b,a);console.log(JSON.stringify(v,null,2));process.exit(v.regressed.length?1:0);'
  ```
  ```
  Expected: exactly ONE regression, and it must be the deliberately dropped link:
    { "regressed": [ { "file": "…/projects/perfectHarnessEngineering/_index.md", "link": "[[projects/_index|projects/_index]]" } ] }
  This is the ACCEPTED, EXPLAINED drop from Step 3 (a vault-registry link with no KB target;
  spec step 6's "report, never guess"). Exit code 1 here is correct. ANY OTHER entry, or more
  than one, FAILS the migration — stop and fix before Task 8. Paste this JSON verbatim into
  `## 7. Links` and name the drop as accepted.

  Also record, in the same report section: `verifyLinks` keys links by `<basename>#<index>`,
  and the KB has three files named `_index.md`. Collisions can only HIDE a regression, never
  invent one — so this gate is weaker at `$R` than its green looks. Cross-check by eye that
  all 11 links in `knowledge-base/_index.md` appear in `links-after.json`'s `resolved`.
  ```

- [ ] **Step 6: Record steps 6 and 6b in the ledger.**
  ```bash
  node cli/index.js knowledge-migrate record 6 done
  node cli/index.js knowledge-migrate record 6b done
  node cli/index.js knowledge-migrate status
  ```
  Expected: a JSON object containing `"6":"done"` and `"6b":"done"`. `6b` is recorded `done` **by hand** because Step 5's single regression is the ACCEPTED, EXPLAINED drop — the human closes 6b here, not the tool. If you ran `knowledge-migrate verify-links` at any point it will have written `"6b":"failed"` first; this `record` is the documented override, and the acceptance must be named in `## 7. Links`.

- [ ] **Step 7: Commit.**
  ```bash
  git add knowledge-base
  git commit -m "fix(knowledge): rewrite wikilinks KB-relative; verify no link regressed"
  ```
  Expected: `nothing to commit, working tree clean` is an ACCEPTABLE outcome here — Tasks 5 and 6 already wrote the rewritten links, and this task's product is the verification evidence, which lands in the report at Task 9. If files DID change, commit them.

---

## Task 8: Step 7 — vault cleanup

**Files (all under `$V`):**
- Modify: `CLAUDE.md:38`; `projects/_index.md:12,23,30-35,39-42`; `system/pointer-block.md`; `agent-kb/patterns/filesystem-containment.md:16,18`; `agent-kb/patterns/_index.md:4,15`; `inbox/research/phe-harness/_index.md:4,12,20,21,24,25,39`; `inbox/research/_index.md:4,15`
- Create: `projects/archive/_index.md`, `inbox/research/archive/_index.md`
- Move: `projects/perfectHarnessEngineering/` → `projects/archive/perfectHarnessEngineering/`; five briefs → `inbox/research/archive/`

**Interfaces:**
- Consumes: DECISION D1 (archive+move) from Task 3; `writeLedger(projectRoot, patch) -> void`.
- Produces: a shared store with zero PHE project knowledge, a registry row reading `migrated`, and every inbound link repointed — the precondition for setting `migratedAt` in Task 9.

**ORDERING CONSTRAINT — read before starting.** Every edit in this task writes under `$V/projects/**`. **Increment 1's** `guard.mjs` deny on `Write(<shared>/projects/**)` (not increment 2's — the hook ships with the payload) is armed only once `knowledge.migratedAt` is non-null; it is still `null` (Task 2 Step 7), which is exactly why `/knowledge-migrate` can clean the shared store up at all. **This task MUST complete before Task 9 Step 3 sets `migratedAt`.** Doing it in the other order denies your own cleanup writes.

- [ ] **Step 1: Prove the deny is not yet armed (the precondition check).**
  ```bash
  echo '{"tool_name":"Write","tool_input":{"file_path":"/Users/cristian-robertiosef/Dev/The Vault/projects/_index.md"},"cwd":"'"$PWD"'"}' | node .claude/hooks/guard.mjs ; echo "exit=$?"
  ```
  Expected: no output (the hook allows silently) and `exit=0`. If a `"permissionDecision":"deny"` appears, `migratedAt` is already set — unset it before continuing.

- [ ] **Step 2: Doctrine location 1 — `$V/CLAUDE.md:38`.** Replace the whole `projects/` bullet with:
  ```
  - **`projects/`** — Stage 2 working knowledge for products whose repo has NO local `knowledge-base/`. `projects/_index.md` is the **project registry** (status of every project, including ones marked `migrated`). Harness-managed repos keep project-scoped knowledge in their own `knowledge-base/`; this store holds what generalizes. A fact lives in exactly ONE store — promotion MOVES it, never copies it.
  ```

- [ ] **Step 3: Doctrine location 2 — `$V/projects/_index.md:12`.** Replace with:
  ```
  **Stage 2 — working knowledge.** One subfolder per product whose repo has no local `knowledge-base/`. A repo running the PHE harness keeps project-scoped knowledge in its OWN `knowledge-base/` and reaches this store only for `wiki/` and `agent-kb/` — see [[system/pointer-block|pointer-block]]. Exactly one copy of any fact exists.
  ```

- [ ] **Step 4: Mark the registry row `migrated` — `$V/projects/_index.md:23`.** Replace with:
  ```
  | Perfect Harness Engineering (PHE) | library | migrated | in-repo `knowledge-base/` — `github.com/<owner>/claude-code-harness` |
  ```
  The row is **marked, not deleted** (spec step 7). Also bump the frontmatter `updated:` to `2026-08-03`.

- [ ] **Step 5: Doctrine location 3 — `$V/projects/_index.md:30-35`, the "Start a new project" section.** Replace the whole section with:
  ```
  ## Start a new project

  **Repo runs the PHE harness?** It gets a `knowledge-base/` in the repo instead of a folder here. Run `/knowledge-migrate` there, then add a registry row with status `migrated` pointing at the repo. Do not create a folder under `projects/`.

  **Otherwise:**
  1. Copy `system/templates/project-template/` → `projects/<name>/`.
  2. Fill in `<name>/_index.md` frontmatter (`status`, `kind`, `repo`) and overview.
  3. **Add a row to the Registry above** and bump `updated:` (Index Law).
  4. Paste [[system/pointer-block|system/pointer-block.md]] into the code repo's `CLAUDE.md`, filled in for `<name>`.
  ```

- [ ] **Step 6: Doctrine location 4 — `$V/projects/_index.md`, the Agent SOP list.** Replace the four numbered items with:
  ```
  1. A registry row with status `migrated` means the knowledge lives in that repo's `knowledge-base/` — **go there**. Do not re-create a folder here; that would recreate the mirror the boundary rule forbids.
  2. Landing here from a non-migrated repo? Find the project row, open its wiki `_index.md` — that is the START HERE for the product.
  3. Read the project's `_index.md` before its `architecture.md` / `decisions.md` / `resources.md` / `runbook.md`.
  4. On any structural change to a project, update **both** the project's own `_index.md` **and** this registry.
  5. Shipped or dead project → update `status:`; cold → move the folder to `projects/archive/`.
  ```

- [ ] **Step 7: Doctrine location 5 — `$V/system/pointer-block.md`.** Insert this paragraph immediately after line 10 (`This is the **one source** for how a code repo reaches this vault. To connect a project:`), before the numbered list:
  ```
  > [!important] Two stores since 2026-08-03
  > A repo running the PHE harness does NOT get a folder under `projects/`. Its project-scoped knowledge lives in its own `knowledge-base/`, and it reaches this store only for `wiki/` and `agent-kb/` — configured in `.claude/harness.json` → `knowledge.shared.path`, not by pasting a path into `CLAUDE.md`. The block below is for UNHARNESSED repos only.
  ```
  Note in `## 6. Vault cleanup` of the report: this store keeps `system/pointer-block.md` and
  `system/templates/project-template/` for UNHARNESSED repos, while
  `template/.claude/references/vault-scaffold/` (what new adopters receive) no longer ships either.
  That divergence is deliberate and permanent; do not "sync" them.

- [ ] **Step 8: Repoint the inbound links from `agent-kb/patterns/`.** In `$V/agent-kb/patterns/filesystem-containment.md`:
  - line 16: `[[projects/perfectHarnessEngineering/_index|perfectHarnessEngineering]]` → `perfectHarnessEngineering (`github.com/<owner>/claude-code-harness`, knowledge in-repo at `knowledge-base/`)`
  - line 18: `see ADR-013 in [[projects/perfectHarnessEngineering/decisions|decisions]]` → `see ADR-013 in that repo's `knowledge-base/decisions.md``
  - bump frontmatter `updated:` to `2026-08-03`.
  In `$V/agent-kb/patterns/_index.md`:
  - line 15: `(traces to perfectHarnessEngineering 2026-07-14 incident, ADR-013)` → `(traces to the perfectHarnessEngineering 2026-07-14 incident, ADR-013 — now in that repo's `knowledge-base/decisions.md`)`
  - bump frontmatter `updated:` to `2026-08-03`.

- [ ] **Step 9: Repoint the inbound link from the research inbox.** In `$V/inbox/research/phe-harness/_index.md`:
  - line 12: `Research briefs behind [[projects/perfectHarnessEngineering/_index|Perfect Harness Engineering]].` → `Research briefs behind Perfect Harness Engineering (`github.com/<owner>/claude-code-harness`; its project knowledge lives in-repo at `knowledge-base/`).`
  - bump frontmatter `updated:` to `2026-08-03`.

- [ ] **Step 10: Create the two archive stubs.** `$V/CLAUDE.md`'s Index Law grants `**/archive/` a one-line stub. Create `$V/projects/archive/_index.md`:
  ```markdown
  # projects / archive

  Cold or migrated project wikis. Nothing here is authoritative — a `migrated` project's knowledge lives in its own repo's `knowledge-base/`.
  ```
  and `$V/inbox/research/archive/_index.md`:
  ```markdown
  # inbox / research / archive

  Briefs that have been imported into a repo's `knowledge-base/research/`. Kept for one restore cycle; the repo copy is authoritative.
  ```

- [ ] **Step 11: Move the project folder and the five briefs (DECISION D1).**
  ```bash
  V="/Users/cristian-robertiosef/Dev/The Vault"
  mv "$V/projects/perfectHarnessEngineering" "$V/projects/archive/perfectHarnessEngineering"
  for f in aidf-v08 anthropic-agents-more claude-code-docs second-brain-starter v3-agile-layer; do mv "$V/inbox/research/phe-harness/$f.md" "$V/inbox/research/archive/$f.md"; done
  ls -1 "$V/projects" "$V/inbox/research/phe-harness" "$V/inbox/research/archive"
  ```
  Expected: `projects/` no longer lists `perfectHarnessEngineering`; `phe-harness/` holds 12 files (`_index.md` + 11 briefs: the 10 uncited ones plus `obsidian-vault.md`, cited but deliberately not imported); `archive/` holds `_index.md` + the 5 moved briefs.
  `mv`, not `rm -rf`: `guard.mjs:25` (definition; enforced at `:173`) denies recursive deletion, and the vault has no other undo.

- [ ] **Step 12: Update the two Contents indexes for the moved briefs (Index Law).**
  In `$V/inbox/research/phe-harness/_index.md`, replace each of the five moved briefs' Contents rows (lines 20, 21, 24, 25, 39) with a pointer line of the form:
  `- **aidf-v08** — MOVED 2026-08-03 to the PHE repo's `knowledge-base/research/aidf-v08.md`; a restore copy sits in [[inbox/research/archive/aidf-v08|archive]].`
  (…and the same shape for `anthropic-agents-more`, `claude-code-docs`, `second-brain-starter`, `v3-agile-layer`.) Leave the other eleven rows untouched.
  In `$V/inbox/research/_index.md:15`, replace the Contents entry with:
  `- [[inbox/research/phe-harness/_index|phe-harness/]] — research briefs behind the Perfect Harness Engineering framework. Five cited briefs moved into that repo's `knowledge-base/research/` on 2026-08-03; eleven remain here.`
  and bump its frontmatter `updated:` to `2026-08-03`.

- [ ] **Step 13: Verify the vault has no dangling link to the moved folder.**
  ```bash
  grep -rn "projects/perfectHarnessEngineering" "/Users/cristian-robertiosef/Dev/The Vault" --include="*.md" | grep -v "/projects/archive/"
  echo "exit=$?"
  ```
  Expected: no output and `exit=1`. Every remaining occurrence lives inside the archived copy itself, which is inert.

- [ ] **Step 14: Verify the registry row survives as `migrated`.**
  ```bash
  grep -n "Perfect Harness Engineering" "/Users/cristian-robertiosef/Dev/The Vault/projects/_index.md"
  ```
  Expected: one line containing `| library | migrated |` — the row is present, not deleted.

- [ ] **Step 15: Record step 7 in the ledger and commit the (repo-side) report note.**
  ```bash
  node cli/index.js knowledge-migrate record 7 done
  node cli/index.js knowledge-migrate status
  ```
  Then add `## 6. Vault cleanup (step 7)` to `reports/knowledge-reconciliation.md` listing all five doctrine locations with their file:line, the registry row's new value, the four repointed inbound links, and both `mv` operations with their destinations.
  ```bash
  git add reports/knowledge-reconciliation.md
  git commit -m "refactor(knowledge): vault cleanup — doctrine, registry, inbound links, archive"
  ```
  Note: `$V` is not a git repo, so nothing under it is committed — the report IS the record of what changed there.

---

## Task 9: Steps 8/9 — close the ledger, set `migratedAt`, finish the report, run the full gate

**Files:**
- Modify: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/.claude/harness.json` (`knowledge.migratedAt`)
- Modify: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/.claude/state/knowledge-migration.json` (`status: "done"`)
- Modify: `/Users/cristian-robertiosef/Dev/perfectHarnessEngineering/reports/knowledge-reconciliation.md` (sections 7 and 8)

**Interfaces:**
- Consumes: `cli/knowledge-config.js` → `stampMigratedAt(projectRoot, iso) -> void` (the ONE writer of `migratedAt`; `writeKnowledgeConfig` deliberately re-reads and preserves it, so it cannot set it), `readKnowledgeConfig(projectRoot) -> knowledge | null`; `cli/knowledge-migrate.js` → `readLedger`, `writeLedger`; `tools/kb-check.mjs`; `tools/context-ledger.mjs`.
- Produces: the finished increment — every acceptance criterion in the spec, checked with real output.

- [ ] **Step 1: Run the four acceptance gates BEFORE flipping anything, and see them green.**
  ```bash
  node tools/kb-check.mjs ; echo "kb-check exit=$?"
  node tools/context-ledger.mjs template | tail -3
  node template/.claude/hooks/smoke-test.mjs | tail -1
  grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' knowledge-base/ ; echo "leak exit=$?"
  ```
  Expected, exactly:
  ```
  kb-check exit=0
  Status: WARN — <LEDGER> / 2000 est. tokens (83%)
  <SMOKE>
  leak exit=1
  ```
  (The ledger's blank/`TOTAL` lines precede the Status line; the number must equal `<LEDGER>` recorded at Task 0. Any other value is a regression: this increment adds nothing always-loaded to `template/`.)

- [ ] **Step 2: Run the whole test suite.**
  ```bash
  npm test
  ```
  Expected final lines: `17 passed, 0 failed` (install-local-payload) then `<SMOKE>` (hooks), exit 0.

- [ ] **Step 3: Set `migratedAt` — this arms the shared-store write deny.**
  ```bash
  node -e 'var k=require("./cli/knowledge-config.js");k.stampMigratedAt(process.cwd(),new Date().toISOString());console.log(JSON.stringify(k.readKnowledgeConfig(process.cwd())));'
  ```
  Expected: the same object as Task 2 Step 7 but with `"migratedAt":"2026-08-03T…Z"` instead of `null`.

- [ ] **Step 4: Prove the deny is now armed.**
  ```bash
  echo '{"tool_name":"Write","tool_input":{"file_path":"/Users/cristian-robertiosef/Dev/The Vault/projects/perfectHarnessEngineering/architecture.md"},"cwd":"'"$PWD"'"}' | node .claude/hooks/guard.mjs | grep -c '"permissionDecision":"deny"'
  ```
  Expected: `1`. This is the enforcement rung of the spec's Enforcement table, verified against the real shared-store path.

- [ ] **Step 5: Prove the secret-shape deny on `knowledge-base/` is armed.**
  ```bash
  echo '{"tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/knowledge-base/resources.md","content":"api_key: sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF"},"cwd":"'"$PWD"'"}' | node .claude/hooks/guard.mjs | grep -c '"permissionDecision":"deny"'
  ```
  Expected: `1`.

- [ ] **Step 6: Close the ledger.**
  ```bash
  node cli/index.js knowledge-migrate record 8 done --status done
  node cli/index.js knowledge-migrate record 9 done
  node cli/index.js knowledge-migrate status
  ```
  Expected: `"status": "done"`, `steps` holding `0,1,2,2b,3,4,5,6,6b,7,8,9` all `"done"`, `backups` holding one archive object, `manifest` holding **10** `{from,to}` pairs, `leakDecisions` holding the Task 3 Step 7b map, and `linksBefore` present. `0` and `1` are `"done"` because Task 3 Step 7b's second `detect` run cleared the leak gate over the planned copy — if either reads `"failed"`, the decisions were never recorded and Task 3 Step 7b was skipped.

- [ ] **Step 7: Finish `reports/knowledge-reconciliation.md`.** Append:
  - `## 7. Links (steps 6, 6b)` — the before/after resolve counts, the `verifyLinks` JSON with its ONE accepted regression (the deliberately dropped `[[projects/_index|projects/_index]]`) named as accepted, the `<basename>#<index>` collision caveat, and the three unresolved entries with the one-line explanation that they are POSIX/bash bracket expressions in inline code (`aidf-v08.md:144` ×2, `claude-code-docs.md:669`), reported and not guessed. Note that `claude-code-docs.md:602` was correctly skipped as fenced.
  - `## 8. Re-derived claims (step 5)` — the eight-row resolution table from Task 5 Step 3, including the two claims left as recorded because no command stands behind them (`13+ adversarial rounds`, ADR-002's historical surface counts).
  - `## 9. Manifest` — the ten `{from, to}` pairs from the ledger.
  - `## 10. Acceptance` — every command from Steps 1, 2, 4, 5 of this task with its real output pasted verbatim.
  - `## 11. Known limits carried forward` — Known limits 1–6 from the spec, each with one line on how it shows up in THIS migration (limit 5 is now closed for the fixture count and open for the adversarial-round counts).

- [ ] **Step 8: Verify the report is complete.**
  ```bash
  grep -c "^## " reports/knowledge-reconciliation.md
  grep -c "^### DECISION" reports/knowledge-reconciliation.md
  ```
  Expected: `11` and `4`.

- [ ] **Step 9: Final full-repo verification.**
  ```bash
  npm test | tail -1
  node tools/kb-check.mjs ; echo "kb-check exit=$?"
  node tools/context-ledger.mjs template | tail -1
  node tools/context-ledger.mjs . | tail -1
  grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' knowledge-base/ ; echo "leak exit=$?"
  git status --porcelain knowledge-base | wc -l
  ```
  Expected:
  ```
  <SMOKE>
  kb-check exit=0
  Status: WARN — <LEDGER> / 2000 est. tokens (83%)
  Status: OK — <ROOT_LEDGER> / 2000 est. tokens
  leak exit=1
  0
  ```

- [ ] **Step 9b: Run `/validate` — the increment's stated deliverable (spec `:222`, `:233`).** Every
  gate above was run by hand; the spec's acceptance is that the PIPELINE command reports them. In
  the agent session at `$R`:
  ```
  /validate
  ```
  Expected: `GATE GREEN`, with each check named and its real output shown — `npm test`,
  `node template/.claude/hooks/smoke-test.mjs` → `<SMOKE>`, `node tools/context-ledger.mjs template`
  → `<LEDGER>`, `node tools/context-ledger.mjs .` → `<ROOT_LEDGER>`, and `node tools/kb-check.mjs`
  → exit 0. A RED verdict fails the increment: fix the cause, never the gate. If `/validate` does
  not run `kb-check`, that is an increment-1 defect (spec `:140`) — report it, do not patch it here.
  Paste the verdict block verbatim into `## 10. Acceptance` of `reports/knowledge-reconciliation.md`.

- [ ] **Step 10: Commit.**
  ```bash
  git add reports/knowledge-reconciliation.md
  git commit -m "docs(knowledge): reconciliation report; close the migration ledger"
  git log --oneline -10
  ```
  Expected: eight or nine commits on `feat/knowledge-base-dogfood` (nine only if Task 7 Step 7 had something to commit), none on `main`.

---

## End-to-end verification

1. `npm test` → `<SMOKE>` (hooks) preceded by `17 passed, 0 failed` (install-local-payload); exit 0.
2. `node tools/kb-check.mjs` → exit 0, no findings.
3. `node tools/context-ledger.mjs template` → `Status: WARN — <LEDGER> / 2000 est. tokens (83%)` — identical to the `<LEDGER>` baseline recorded at Task 0 Step 1, no regression.
4. `node tools/context-ledger.mjs .` → `Status: OK — <ROOT_LEDGER> / 2000 est. tokens`, no `!! WARN`, no `!! HARD` — must reproduce the `<ROOT_LEDGER>` recorded at Task 2 Step 5 exactly.
5. `grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' knowledge-base/` → **no output**, exit 1.
6. `test -f reports/knowledge-reconciliation.md && grep -c "^### DECISION" reports/knowledge-reconciliation.md` → `4`.
7. `node -e 'console.log(require("./cli/knowledge-migrate.js").readLedger(process.cwd()).status)'` → `done`.
8. `grep -n "migrated" "/Users/cristian-robertiosef/Dev/The Vault/projects/_index.md"` → the PHE registry row, present and marked.
9. `diff -r -x .obsidian` between `$V` and the restored backup is expected to FAIL now (the vault changed) — that is the proof the migration actually ran. The backup tarball itself is untouched and still restores the pre-migration state.

---

## Risks & assumptions

- **The vault has no git.** Every mitigation in this plan routes through one verified tarball (Task 4) and `mv`-not-`rm` (Task 8). If Task 4 Step 5 does not print `BACKUP VERIFIED — IDENTICAL`, nothing after it may run.
- **Installing the harness at `$R` replaces the root `CLAUDE.md`.** `copyClaudeMdWithBackup` (`cli/claude-md-copy.js:36-41`) preserves the original at `CLAUDE.md.backup` and refuses to overwrite an existing backup. Task 2 Step 4 hand-carries its content into `AGENTS.md`; the backup file stays untracked as the operator's undo.
- **The three coleam00 clones are untracked and gitignored** (`.gitignore:24-26`). Task 3 Step 8 deliberately declines to import them; they carry 47 markdown files that would otherwise look like a legacy KB.
- **`obsidian-vault.md` stays shared (DECISION A1),** so the brief itself is still reached only through `.claude/harness.json` → `knowledge.shared.path`. The two citations that named it — `docs/04-model-policy.md:99-100` and the `obsidian-vault` bullet in `docs/05-knowledge-layer.md`'s `## Sources` (**grep for it**; increment 1 rewrote that block, so no line number here is trustworthy) — are BOTH repointed by Task 6 Step 7 at `knowledge-base/research/_index.md`, which carries the prose pointer into the shared store's research inbox. `docs/04-model-policy.md:99-100` therefore now points at `knowledge-base/research/_index.md`, not at a vault path. That is a zero-delta continuation of today's state, not a new leak; the pointer wording avoids the literal folder name because `phe-harness` is itself in the leak regex.
- **Hard dependency: increment 2 ships `knowledge-migrate decide <marker> <genericize|redact|accept>` and a `leakDecisions`-aware step-0 gate.** Without it `detect` can never return `ok:true` at `$R` — DECISION B1 genericizes the imported copy only, so `$V`'s four leaky sources keep their hits by design — and with `steps 0/1` never `done` and `linksBefore` never written, `verify-links` throws and Task 9 Step 6's `0,1,…` ledger assertion is unproducible. Task 3 Step 7b is the gate on that dependency: if the subcommand is missing, STOP and report an increment-2 defect. **Never** clear the gate by editing `$V` — that would rewrite the source the whole boundary rule says is never rewritten, and Task 3 Step 7c exists to catch it.
- **`detect` classifies and snapshots over what it DETECTED, not what step 2 CONFIRMED.** Both `leaks` and `linksBefore` therefore cover `plans/`, `template/` and the three gitignored clones, none of which this migration imports. It makes the leak decisions broader than they need to be (harmless — one decision per marker) and `ledger.linksBefore` useless as a 6b baseline here (Task 7 Step 5 scopes its own). Record it in the report as an increment-2 limitation; do not narrow the regex or the detector to fit.
- **Assumption: increment 2's `leakScan` classifies a GitHub owner handle as `needsDecision`, not `autoGenericizable`.** Task 3 Step 3 deliberately does NOT pin the auto/needsDecision split — the spec's classification rule (home paths auto, everything else decides) is not a measurement. Whatever the shipped implementation reports, the RAW grep counts in the same step are the authority — they are what the acceptance scan re-runs.
- **Assumption: `resolveLinks` is fence-aware but not inline-code-aware.** Task 7 Step 2 states both the expected 3 false positives and the one entry (`claude-code-docs.md:602`) whose appearance would mean the fence handling is broken. Either outcome is diagnosable from the printed JSON.
- **Ordering is load-bearing:** Task 8 (vault cleanup) writes under `$V/projects/**`; Task 9 Step 3 arms the deny on exactly that path. Reversing them denies the cleanup.
