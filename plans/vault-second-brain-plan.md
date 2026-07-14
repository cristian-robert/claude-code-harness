---
ticket: ad-hoc
created: 2026-07-14
complexity: M
confidence: 8/10
tier: build
---

# Vault as second brain — retrieval + capture across the pipeline

## Goal

Every pipeline stage that can benefit RETRIEVEs from the Obsidian vault before acting, and confirmed knowledge flows back continuously (auto to `inbox/` + `projects/<name>/`, ask-first promotion to `wiki/`/`agent-kb/`), with the official Obsidian CLI as an optional accelerator. Spec: `docs/design/2026-07-14-vault-second-brain.md` (decisions locked by PO 2026-07-14).

## Context

- Knowledge to load first: `docs/design/2026-07-14-vault-second-brain.md` (the spec — per-stage table + write policy), `template/.claude/references/research-and-docs.md` (the existing doc-grounded loop this extends).
- Read first: `template/.claude/hooks/session-start.mjs:68-73` — harness.json read + line-push pattern the vault line joins; `template/.claude/hooks/smoke-test.mjs:319-356` — session-start fixture pattern to copy.
- Pattern to follow: `template/.claude/agents/architect-agent.md:15-20` — the vault resolution + loud degradation contract every new step reuses (via the new reference).
- Verified platform facts (do NOT re-derive): official Obsidian CLI `/usr/local/bin/obsidian`; `search:context query=<q> path=<folder> limit=<n> format=json`, `read`, `append`, `backlinks` work from a shell; CLI may be absent on adopter machines → every use falls back to file reads.
- Budgets: rules ≤45 lines, skill bodies ≤100, template CLAUDE.md/AGENTS.md ≤60 — amend lines IN PLACE where a file is at cap. References are load-on-cite (not ledger-taxed).

## Out of scope

- Reviewer vault access (`/review-branch`, `code-reviewer`) — isolation ADR preserved (PO decision).
- Vault-search MCP; universal vault-librarian agent — rejected in spec.
- Auto-writes to `wiki/`/`agent-kb/`; `/handoff` vault writes — rejected in spec.
- `/implement` changes — its wiki/stack consult already exists and is unchanged.
- CLI `init`/`update` changes — new/edited payload files ship via normal copy; no migration.

## Tasks

### Task 1: Create the vault protocol reference
- Files: Create `template/.claude/references/vault-protocol.md`
- Steps:
  1. Write the file (≤45 lines) with exactly these sections:
     - `# Vault protocol — the second brain contract` + one-line purpose.
     - `## Resolution`: AGENTS.md `## Knowledge Vault` pointer block → `.claude/harness.json` `vault.path` (shape: `{mode, path}`; only `mode: "existing"` counts). Neither → NO VAULT: skip every vault step and SAY SO (`no vault configured — skipping <step>`).
     - `## Retrieval ladder`: (1) `obsidian` CLI on PATH → `obsidian search:context query="<q>" path=<folder> limit=5` scoped to `projects/<name>/`, `wiki/`, or `agent-kb/` per the question; `obsidian read path=<note>` for a hit; (2) ANY error or CLI absent → `_index.md` navigation file reads (vault `_index.md` → folder `_index.md` → file). Never both for one lookup.
     - `## Write policy`: auto-append ONLY under `inbox/` and `projects/<name>/` (plain file write or `obsidian append path=... content=...`); every write updates that folder's `_index.md` (Index Law) and uses vault conventions (frontmatter, `[[wikilinks]]`; global `obsidian-markdown` skill is the reference when available). `wiki/`/`agent-kb/` promotion and rule changes: ask-first, `/evolve` only.
     - `## Per-stage table`: the RETRIEVE/CAPTURE table from the spec verbatim (backlog refine / plan-work / debugging / validate+qa / review-branch "none — isolated" / evolve promotion gate / architect-agent).
- Validate: `wc -l template/.claude/references/vault-protocol.md` → ≤45; `node tools/context-ledger.mjs template` → total unchanged (references are not always-loaded).
- Acceptance criteria: file exists; contains all four sections + table; review-branch row says isolated.

### Task 2: session-start vault line + smoke fixtures
- Files: Modify `template/.claude/hooks/session-start.mjs` (inside the existing `try` at lines 69-91), `template/.claude/hooks/smoke-test.mjs` (after the session-start block ending ~line 356)
- Steps:
  1. In session-start.mjs, directly after the stop-gate `lines.push(...)` (line 73), add:
     ```js
     // Vault = the agent's second brain. One line so every fresh session knows it exists;
     // the protocol reference carries the how (retrieval ladder, write policy).
     const v = cfg.vault;
     if (v && v.mode === "existing" && typeof v.path === "string" && v.path) {
       lines.push(`Vault: ${v.path} — RETRIEVE before structural work, CAPTURE after; protocol: .claude/references/vault-protocol.md`);
     }
     ```
  2. In smoke-test.mjs, add two fixtures copying the pattern at lines 341-356 (tmp dir + harness.json + runHook + assert):
     - `vault configured -> vault line present`: write `{"vault":{"mode":"existing","path":"/tmp/x-vault"}}` to `<tmp>/.claude/harness.json`; assert stdout contains `Vault: /tmp/x-vault`.
     - `no vault key -> no vault line`: harness.json `{}`; assert stdout does NOT contain `Vault:`.
     (Malformed harness.json fail-open is already covered by the existing session-start fixture — do not duplicate.)
  3. Run the smoke test.
- Validate: `node template/.claude/hooks/smoke-test.mjs` → all PASS including the 2 new fixtures.
- Acceptance criteria: vault line appears only when `vault.mode === "existing"` with a non-empty path; hook still exits 0 on malformed config.

### Task 3: /backlog refine RETRIEVEs prior art
- Files: Modify `template/.claude/skills/backlog/SKILL.md` (section `## refine <id> — BA hat drafts, PO (the human) decides`, before the AC-approval step at line 44)
- Steps:
  1. Add one numbered step at the START of the refine list: `0. RETRIEVE prior art (vault-protocol: .claude/references/vault-protocol.md): search projects/<name>/decisions.md + wiki/ for decisions touching this item's surface; surface conflicts/duplicates to the PO before drafting AC. No vault → say so and continue.`
- Validate: `node tools/context-ledger.mjs template` → skill body ≤100.
- Acceptance criteria: refine flow names the retrieval before AC drafting; cites vault-protocol.md; degrades loudly.

### Task 4: /plan-work consults agent-kb for AI-agent products
- Files: Modify `template/.claude/skills/plan-work/SKILL.md` (step `## 4. Explore the codebase`, after the external-tools bullet at line 49)
- Steps:
  1. Add bullet: `- The product under work is itself an AI agent/LLM feature → RETRIEVE agent-kb/ (patterns/, models/, tooling/) per .claude/references/vault-protocol.md before designing from scratch; cite consulted notes in the plan's Context.`
- Validate: `node tools/context-ledger.mjs template` → plan-work body ≤100 (currently ~91; +1 line fits).
- Acceptance criteria: agent-kb SOP wired into plan exploration; cited in plan Context contract.

### Task 5: debugging loop — RETRIEVE runbook, CAPTURE root cause
- Files: Modify `template/.claude/skills/debugging-this-repo/SKILL.md` (after the intro line 8, before `## Logs & observability`)
- Steps:
  1. Insert section:
     ```markdown
     ## Vault (second brain) — RETRIEVE then CAPTURE

     - BEFORE diagnosing: search the vault per `.claude/references/vault-protocol.md` — `projects/<name>/runbook.md` + failure classes (`obsidian search:context query="<error text>" path=projects/<name>` → fallback file reads). A prior incident match short-circuits hours.
     - AFTER systematic-debugging confirms a root cause: auto-append it to `projects/<name>/runbook.md` known-failure classes (symptom → cause → fix → incident) AND to the table below. Auto-write stops there — wiki/ promotion is /evolve's ask-first call.
     ```
- Validate: `node tools/context-ledger.mjs template` → within budgets (this skill's body cap note says ≤70: verify the file stays ≤70 lines; cut the two placeholder rows in `## Known failure classes` down to one if needed).
- Acceptance criteria: retrieval precedes diagnosis; confirmed root causes have an auto-capture home in BOTH repo skill and vault runbook.

### Task 6: /validate hands the runbook to qa-evaluator
- Files: Modify `template/.claude/skills/validate/SKILL.md` (the 3b dispatch sentence at line 56), `template/.claude/agents/qa-evaluator.md` (inputs list at line 18)
- Steps:
  1. In validate SKILL.md line 56, after `Plus the target URL/entrypoint.` append: `Vault configured (vault-protocol resolution) → also pass projects/<name>/runbook.md as the how-to-drive reference.`
  2. In qa-evaluator.md line 18, extend the inputs sentence with: `; optionally a vault runbook path (how to launch/drive the app) — trust it over guessing entrypoints.`
- Validate: `node tools/context-ledger.mjs template` → within budgets.
- Acceptance criteria: QA brief carries the runbook when a vault exists; agent knows to prefer it.

### Task 7: architect-agent gains agent-kb + CLI accelerator
- Files: Modify `template/.claude/agents/architect-agent.md` (resolution step 3 at lines 20-22, RETRIEVE section at line 27)
- Steps:
  1. Extend step 3: after `Never load the whole KB.` add: `Lookup accelerator: the retrieval ladder in .claude/references/vault-protocol.md (obsidian CLI search when present, file reads otherwise).`
  2. In RETRIEVE: after the `architecture.md (+ decisions.md for rationale)` sentence add: `Query about an AI-agent/LLM design → also check agent-kb/ (patterns/, models/, tooling/).`
- Validate: `node template/.claude/hooks/smoke-test.mjs` → agent frontmatter checks still PASS.
- Acceptance criteria: architect can serve agent-design queries from agent-kb; uses the shared ladder.

### Task 8: /evolve framed as the promotion gate; 00-core + AGENTS.md amended in place
- Files: Modify `template/.claude/skills/evolve/SKILL.md` (capture-table row at line 32), `template/.claude/rules/00-core.md` (Task-routing bug row), `template/AGENTS.md` (Doc-grounded bullet, line 50)
- Steps:
  1. evolve row `| Generalizes beyond this project | ...` → `| Generalizes beyond this project | Vault: inbox/raw or project wiki (agents auto-append there mid-work); promotion to wiki//agent-kb/ happens HERE and only here, ask-first — .claude/references/vault-protocol.md |`
  2. 00-core Task-routing row `| Bug, test failure, unexpected behavior | superpowers:systematic-debugging BEFORE any fix |` → `| Bug, test failure, unexpected behavior | superpowers:systematic-debugging BEFORE any fix; facts from debugging-this-repo + vault runbook (vault-protocol.md) |` (same row, no new lines).
  3. AGENTS.md line 50 doc-grounded bullet: append `Vault protocol (retrieve/capture, all stages): .claude/references/vault-protocol.md.` ONLY if the file stays ≤60 lines; else fold into the existing sentence.
- Validate: `node tools/context-ledger.mjs template` → AGENTS.md ≤60, 00-core ≤45, total ≤2000.
- Acceptance criteria: promotion path is explicit and single-homed in /evolve; routing/budgets unchanged in shape.

### Task 9: docs + full gate
- Files: Modify `docs/05-knowledge-layer.md` (add a short "Second brain loop" subsection naming the protocol file, the ladder, and the write policy — ≤10 lines, keep file ≤130)
- Steps:
  1. Write the subsection; cite the spec `docs/design/2026-07-14-vault-second-brain.md`.
  2. Run the full gate.
- Validate: `npm test` → exit 0 (all suites + smoke test); `node tools/context-ledger.mjs template` → ≤2000; `grep -rn "vault-protocol" template/ | wc -l` → ≥7 (protocol + 6 citing files).
- Acceptance criteria: docs describe the loop; every gate green.

## End-to-end verification

1. `node template/.claude/hooks/smoke-test.mjs` → PASS including both vault fixtures.
2. In THIS repo (vault configured): follow Task 5's retrieval manually — `obsidian search:context query="stop gate" path=projects/perfectHarnessEngineering limit=3` → returns runbook/decisions hits (verified working 2026-07-14); then simulate CLI absence (`PATH` without `/usr/local/bin`) and confirm the documented file-read fallback path resolves the same note.
3. `grep -n "isolated" template/.claude/references/vault-protocol.md` → review-branch row present (isolation preserved).

## Risks & assumptions

- Obsidian CLI availability varies per machine → every wired step names the fallback; nothing hard-depends on the CLI.
- `debugging-this-repo` is a per-project template (placeholders); its ≤70-line self-cap may require pruning a placeholder row — acceptable, noted in Task 5.
- Assumption: `projects/<name>` resolves via the AGENTS.md pointer block (architect-agent's existing chain); harness.json holds only `{mode, path}` — verified in `cli/vault-config.js`.
