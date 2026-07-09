# Vault Bootstrap (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bundled, generic Obsidian-vault scaffold in the payload and teach `/harness-init` to create a convention-correct vault (and add context7 to `.mcp.json`) when a project doesn't already have one — so the Phase-1 research-reuse loop has somewhere to land on a fresh install.

**Architecture:** A `template/.claude/references/vault-scaffold/` directory holds the genericized vault skeleton (root `CLAUDE.md` + `_index.md`, all folder `_index.md` files, `system/` templates + schema + pointer block, and the new `wiki/stack/`), copied from the reference vault at `~/Dev/The Vault` with all personal content stripped. `/harness-init` gains a scaffold step that copies this into the user's chosen vault location and wires the pointer block, plus an offer to add context7 to `.mcp.json`.

**Tech Stack:** Claude Code harness payload — Markdown assets + one skill edit. No executable code. The reference vault is the concrete copy source.

## Global Constraints

- **This is Phase 2 of 3.** Phase 1 (research-reuse core) is committed on this branch. Phase 3 (AIDF port) is a separate plan. Spec: `docs/design/2026-07-08-vault-research-reuse.md`.
- **Branch:** `feat/vault-research-reuse` (PHE repo). Never commit to `main`.
- **PUBLIC REPO — zero personal content.** `claude-code-harness` is public. The scaffold MUST contain no home paths, no username/email, and no real project/research names. **Leak-scan gate (must return NOTHING):**
  `grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' template/.claude/references/vault-scaffold/`
- **Copy source (clean, verified):** `~/Dev/The Vault`. Its root `CLAUDE.md` and `_index.md` are already generic (no personal markers). Personal content is ONLY in: `projects/_index.md` (registry rows), `system/pointer-block.md` (paths), and any `_index.md` Contents that list real notes (`inbox/research/`, `inbox/raw/`). Real project dirs (`projects/bzroo`, `projects/MonitoroSecurityAudit`, `projects/perfectHarnessEngineering`) and `inbox/research/phe-harness/` are NEVER copied.
- **Ledger:** `node tools/context-ledger.mjs template` stays clean, `< 2000`, no warnings. (The ledger does not scan `.claude/references/`, so scaffold files add nothing — confirm anyway.)
- **`/harness-init` body ≤100 lines** after edits (it is 68 now).
- **Commits:** conventional, one per task, trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

New scaffold assets under `template/.claude/references/vault-scaffold/` (each folder gets its `_index.md` — Index Law):
- `CLAUDE.md`, `_index.md` (root vault manual + map)
- `inbox/_index.md`, `inbox/raw/_index.md`, `inbox/research/_index.md`, `inbox/snippets/_index.md`
- `wiki/_index.md`, `wiki/stack/_index.md` (**new** — the tool-research cache root)
- `agent-kb/_index.md` + `agent-kb/{evals,models,patterns,prompts,tooling}/_index.md`
- `projects/_index.md`
- `system/_index.md`, `system/pointer-block.md`, `system/schemas/_index.md`, `system/schemas/frontmatter.md`, `system/templates/_index.md`, `system/templates/index-template.md`, `system/templates/project-template/{_index,architecture,decisions,resources,runbook}.md`

Edited: `template/.claude/skills/harness-init/SKILL.md`.

---

## Task 1: Copy the generic skeleton into the scaffold

**Files:**
- Create: `template/.claude/references/vault-scaffold/**` (copied from `~/Dev/The Vault`)

**Interfaces:**
- Produces: the raw scaffold tree. Task 2 genericizes/augments it.

- [ ] **Step 1: Copy exactly the clean skeleton files** (run from `template/.claude/references/`, i.e. `cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering/template/.claude/references`). Use a whitelist copy — never a blanket `cp -R` of the vault (that would pull real projects/notes):

```bash
V="/Users/cristian-robertiosef/Dev/The Vault"
D="vault-scaffold"
mkdir -p "$D"/inbox/raw "$D"/inbox/research "$D"/inbox/snippets \
         "$D"/wiki/stack "$D"/agent-kb/evals "$D"/agent-kb/models "$D"/agent-kb/patterns \
         "$D"/agent-kb/prompts "$D"/agent-kb/tooling "$D"/projects \
         "$D"/system/schemas "$D"/system/templates/project-template
# root
cp "$V/CLAUDE.md" "$D/CLAUDE.md"
cp "$V/_index.md" "$D/_index.md"
# inbox
cp "$V/inbox/_index.md"          "$D/inbox/_index.md"
cp "$V/inbox/raw/_index.md"      "$D/inbox/raw/_index.md"
cp "$V/inbox/research/_index.md" "$D/inbox/research/_index.md"
cp "$V/inbox/snippets/_index.md" "$D/inbox/snippets/_index.md"
# wiki (stack/_index.md is authored fresh in Task 2, not copied)
cp "$V/wiki/_index.md" "$D/wiki/_index.md"
# agent-kb
cp "$V/agent-kb/_index.md" "$D/agent-kb/_index.md"
for s in evals models patterns prompts tooling; do cp "$V/agent-kb/$s/_index.md" "$D/agent-kb/$s/_index.md"; done
# projects (registry only — NO real project dirs)
cp "$V/projects/_index.md" "$D/projects/_index.md"
# system
cp "$V/system/_index.md"                                   "$D/system/_index.md"
cp "$V/system/pointer-block.md"                            "$D/system/pointer-block.md"
cp "$V/system/schemas/_index.md"                           "$D/system/schemas/_index.md"
cp "$V/system/schemas/frontmatter.md"                      "$D/system/schemas/frontmatter.md"
cp "$V/system/templates/_index.md"                         "$D/system/templates/_index.md"
cp "$V/system/templates/index-template.md"                 "$D/system/templates/index-template.md"
cp "$V/system/templates/project-template/_index.md"        "$D/system/templates/project-template/_index.md"
cp "$V/system/templates/project-template/architecture.md"  "$D/system/templates/project-template/architecture.md"
cp "$V/system/templates/project-template/decisions.md"     "$D/system/templates/project-template/decisions.md"
cp "$V/system/templates/project-template/resources.md"     "$D/system/templates/project-template/resources.md"
cp "$V/system/templates/project-template/runbook.md"       "$D/system/templates/project-template/runbook.md"
```

- [ ] **Step 2: Verify the structure — every folder has an `_index.md`**

Run (from the repo root, `cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering`):
```bash
D=template/.claude/references/vault-scaffold
comm -23 <(find $D -type d | sort) <(find $D -name _index.md -exec dirname {} \; | sort)
```
Expected: **empty** (every directory contains an `_index.md`). If a dir prints, it lacks an index — fix before proceeding.

- [ ] **Step 3: Pre-genericization leak scan (informational)**

Run: `grep -rlnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' template/.claude/references/vault-scaffold/`
Expected at THIS stage: only `system/pointer-block.md`, `projects/_index.md`, and possibly `inbox/research/_index.md` / `inbox/raw/_index.md`. These are genericized in Task 2. (If any OTHER file appears — e.g. an agent-kb `_index.md` — read it and note it for Task 2.)

- [ ] **Step 4: Commit**

`/commit` (or `git -C <repo> add template/.claude/references/vault-scaffold && git commit`) staging only the scaffold dir. Message:
`feat: bundle raw vault-scaffold skeleton (pre-genericization)`

---

## Task 2: Genericize personal content + augment for research-reuse

**Files:**
- Modify: `vault-scaffold/system/pointer-block.md`, `vault-scaffold/projects/_index.md`, `vault-scaffold/inbox/research/_index.md`, `vault-scaffold/inbox/raw/_index.md` (+ any file Task 1 Step 3 flagged), `vault-scaffold/system/schemas/frontmatter.md`, `vault-scaffold/CLAUDE.md`, `vault-scaffold/wiki/_index.md`
- Create: `vault-scaffold/wiki/stack/_index.md`

**Interfaces:**
- Produces: the final, public-safe, research-reuse-aware scaffold.

- [ ] **Step 1: Genericize the pointer block.** In `vault-scaffold/system/pointer-block.md`, replace every occurrence of `/Users/cristian-robertiosef/Dev/The Vault` with `<ABSOLUTE_VAULT_PATH>` (there are ~6: the symlink note, and the copy-block's vault path + navigation reads + reusable-knowledge paths). The `<project-name>` placeholders already present stay. Result: the block is a fill-in template `/harness-init` completes.

- [ ] **Step 2: Empty the projects registry.** In `vault-scaffold/projects/_index.md`, replace the three real registry rows:

```
| Bzroo Marketplace | app | active | [[projects/bzroo/_index\|bzroo]] |
| MonitoroSecurityAudit (SentrOS) | app | active | [[projects/MonitoroSecurityAudit/_index\|MonitoroSecurityAudit]] |
| Perfect Harness Engineering (PHE) | library | active | [[projects/perfectHarnessEngineering/_index\|perfectHarnessEngineering]] |
```

with a single placeholder row:

```
| _(no projects yet)_ | — | — | — |
```

(Keep the existing `<!-- Add a row per project. Example: ... -->` comment and the "Start a new project" section as-is.)

- [ ] **Step 3: Empty inbox Contents that list real notes.** In `vault-scaffold/inbox/research/_index.md`, replace the Contents entry that links `phe-harness/` with the generic empty state:

```
_Empty. One note (or subfolder) per topic — filename `<topic>.md`, or `<topic>/` with its own `_index.md` for larger investigations._
```

In `vault-scaffold/inbox/raw/_index.md`, if its Contents lists any real note, replace with `_Empty. Drop unstructured captures here._`. (Read the file first; keep Purpose + Agent SOP.)

- [ ] **Step 4: Add `doc-sources:` + tool-research fields to the schema.** In `vault-scaffold/system/schemas/frontmatter.md`, in the `type` values table, change the `research` and `reference` rows' "Extra fields" to name `doc-sources`:

```
| `research` | A deep-dive brief in `inbox/research/` | `doc-sources` (URL+version), `sources` (optional) |
| `reference` | Evergreen reference in `wiki/`/`agent-kb/` | `doc-sources`, `researched-version` (for `wiki/stack/`) |
```

Then append this section before `## Example`:

```
## Tool research (`wiki/stack/<tool>/`)

External-tool docs cached for cross-project reuse. Folder `_index.md`: `covers:` (aspect list),
`versions:` (majors documented + where), `aliases:` (package/service name variants + context7 id).
Pages: `researched-version:`, `verified: true|low-confidence`, `doc-sources:` (URL+version), `related:`.
`doc-sources:` is documentation provenance — distinct from `sources:` (repo file paths).
```

- [ ] **Step 5: Create `vault-scaffold/wiki/stack/_index.md`** with exactly this content:

```markdown
---
type: index
folder: wiki/stack
updated: 2026-01-01
tags:
  - index
---

# wiki / stack

**Stage 3 — evergreen, tool-keyed.** One subfolder per external tool/library/service
(`<tool>/`), holding the durable cross-project answer to "how do we use `<tool>`?". This is the
cache the `/research` loop checks first and distils into — populated by using `/research <tool>`,
not by hand.

## Contents

_Empty. Each tool gets `<tool>/` with its own `_index.md` (Index Law), carrying `covers:` (aspects
documented), `versions:` (majors + where), and `aliases:` (name variants + context7 id)._

## Agent SOP

1. Before researching or coding against an external tool, look here first: `<tool>/_index.md`.
2. Fresh + version-matched + covers your aspect → use it, don't re-research.
3. Missing / stale / wrong major / uncovered aspect → run `/research <tool>[@version] [focus]`; it
   fetches current docs (context7 + official) and extends this folder.
4. New tool folder → create its `_index.md` and update this index (Index Law).
```

- [ ] **Step 6: Mention `wiki/stack/` + `doc-sources` in the scaffold's `CLAUDE.md` and `wiki/_index.md`.**
  In `vault-scaffold/CLAUDE.md`, in the `## Wiki Doctrine (evergreen)` section, append:
  `External-tool/library docs live tool-keyed under `wiki/stack/<tool>/`, cached and reused across projects via `/research` (see the repo's `.claude/references/research-and-docs.md`).`
  In `vault-scaffold/CLAUDE.md`, in `## Taxonomy (frontmatter)`, append a bullet:
  `- `doc-sources:` — documentation provenance (URL+version) for `research`/`reference` notes; distinct from `sources:` (repo file paths).`
  In `vault-scaffold/wiki/_index.md`, add to Contents: `- [[wiki/stack/_index|stack/]] — tool-keyed external-docs cache (populated by /research).`

- [ ] **Step 7: LEAK-SCAN GATE (must pass)**

Run: `grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness' template/.claude/references/vault-scaffold/`
Expected: **NOTHING** (empty output, exit 1 from grep = no matches). If anything prints, genericize it and re-run. This gate is mandatory before commit — the repo is public.

- [ ] **Step 8: Re-verify structure**

Run: `find template/.claude/references/vault-scaffold -name _index.md | wc -l`
Expected: **18** (root 1, inbox 4 [_index/raw/research/snippets], wiki 2 [_index/stack], agent-kb 6 [_index + evals/models/patterns/prompts/tooling], projects 1, system 4 [system/_index, schemas/_index, templates/_index, project-template/_index]). Confirm `wiki/stack/_index.md` exists.

- [ ] **Step 9: Commit**

`/commit` staging the modified + new scaffold files. Message:
`feat: genericize vault-scaffold + add wiki/stack cache and doc-sources schema`

---

## Task 3: Teach `/harness-init` to scaffold the vault + offer context7

**Files:**
- Modify: `template/.claude/skills/harness-init/SKILL.md`

**Interfaces:**
- Consumes: `vault-scaffold/` (Tasks 1–2). After install it sits at `.claude/references/vault-scaffold/`.

- [ ] **Step 1: Extend interview question 5 + add context7.** In section `## 2 · INTERVIEW`, replace this line:

```
5. Vault wiring: offer the pointer block (The Vault: `system/pointer-block.md`) or skip.
```

with:

```
5. Vault: detect one (a pasted pointer block, or ask for its path). None + wanted → offer to scaffold a fresh vault from `.claude/references/vault-scaffold/` at a path they choose. Existing → just wire the pointer block. Or skip vault wiring entirely.
6. Docs: add the context7 MCP to `.mcp.json` for live doc-fetch in `/research`? (default yes; it needs `npx`.)
```

and renumber the existing `6. Work tracking…` line to `7.`.

- [ ] **Step 2: Add the GENERATE steps.** In section `## 3 · GENERATE`, immediately AFTER the `.gitignore` bullet (`- \`.gitignore\`: add \`.claude/state/\`…`), insert:

```
- Vault (from question 5): scaffold chosen → copy `.claude/references/vault-scaffold/` to the target path, then in that copy's `system/pointer-block.md` replace `<ABSOLUTE_VAULT_PATH>` with the target's absolute path; paste that pointer block's fenced content into the repo `CLAUDE.md` (the marked slot), filling `<project-name>`. Existing vault → just paste + fill its pointer block. Index Law already holds in the scaffold. Skipped → leave the `CLAUDE.md` vault comment as-is.
- context7 (from question 6): yes → add `"context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }` to `.mcp.json` `mcpServers`. No → leave `.mcp.json` as-is (codebase-search only).
```

- [ ] **Step 3: Verify budget + frontmatter**

Run: `cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node tools/context-ledger.mjs template`
Expected: clean, `< 2000`, no warnings. harness-init has `disable-model-invocation: true`, so its body isn't always-loaded; confirm its body line count with `sed '1,/^---$/d; 1,/^---$/d' template/.claude/skills/harness-init/SKILL.md | wc -l` → **≤ 100**.

- [ ] **Step 4: Commit**

`/commit` staging `template/.claude/skills/harness-init/SKILL.md`. Message:
`feat: /harness-init scaffolds a vault + offers context7`

---

## Task 4: End-to-end verification

**Files:** none.

- [ ] **Step 1: Ledger clean**

Run: `cd /Users/cristian-robertiosef/Dev/perfectHarnessEngineering && node tools/context-ledger.mjs template`
Expected: exit clean, `< 2000`, NO warnings.

- [ ] **Step 2: Smoke test unaffected**

Run: `node template/.claude/hooks/smoke-test.mjs`
Expected: all pass (62/62 or current count) — no hooks or agents changed in Phase 2.

- [ ] **Step 3: FULL leak-scan (public-repo gate)**

Run: `grep -rnE '/Users/|cristian|roby248|bzroo|SentrOS|Monitoro|phe-harness|The Vault' template/.claude/references/vault-scaffold/`
Expected: **NOTHING**. (Note the added `The Vault` marker — the generic scaffold must not name the operator's specific vault folder.)

- [ ] **Step 4: Structure completeness**

Run:
```bash
D=template/.claude/references/vault-scaffold
comm -23 <(find $D -type d | sort) <(find $D -name _index.md -exec dirname {} \; | sort)
```
Expected: **empty** (every folder has an `_index.md`).

- [ ] **Step 5: harness-init read-through (no-prior-knowledge test)**

Read `template/.claude/skills/harness-init/SKILL.md`: confirm the vault question (5) and context7 question (6) both have matching GENERATE steps, the scaffold source path is `.claude/references/vault-scaffold/`, the `<ABSOLUTE_VAULT_PATH>` replacement is specified, and the work-tracking question renumbered to 7 with no dangling references to "question 6" meaning work-tracking elsewhere in the file. Fix any mismatch inline, then re-run Step 1.

- [ ] **Step 6: Branch + tree**

Run: `git -C /Users/cristian-robertiosef/Dev/perfectHarnessEngineering status -sb`
Expected: on `feat/vault-research-reuse`; clean tree; Phase 2 commits present.

## End-to-end verification (feature proof)

Phase 2 "works" when: the scaffold is a complete, Index-Law-correct, **personal-content-free** vault skeleton (Steps 3–4 green); `/harness-init` can create it and wire the pointer block (Step 5 read-through); and the ledger + smoke test stay green. A fresh install with no vault can now run `/harness-init`, get a working vault at a chosen path, and immediately use `/research` to populate `wiki/stack/`.

**Manual smoke (optional):** copy `vault-scaffold/` to a scratch dir, confirm it opens as a valid Obsidian vault, every folder navigates via its `_index.md`, and `system/pointer-block.md` reads as a fillable template.

## Out of scope (Phase 2)

- Any AIDF-repo change (incl. teaching `cli/init.js` to ship `vault-scaffold/`, and making `cli/file-size-check.js` skip it) — **Phase 3**.
- Seeding real `wiki/stack/<tool>/` tool pages — content, produced by `/research`.
- Changing the Phase-1 `/research` skill or `research-and-docs.md` — done in Phase 1.
