# /evolve proposal — 2026-09-05

Branch `fix/autonomous-single-activation-path`, 31 commits over `532e0e9`. Sources: the controller's
incident brief, `reports/harness-improvements-m1-implementation-report.md` (50 follow-ups, 25 rulings),
`reports/2026-09-05-harness-deep-analysis.md` Tier 2, `git log 532e0e9..HEAD`, the vault's
`architecture.md` gap, and the still-open 2026-08-29 items M2 / m4.

**Ledger now:** `node tools/context-ledger.mjs template` → **1879 / 2000 est. tokens (94%, WARN)**.
AGENTS.md 979 · CLAUDE.md 105 · 00-core.md 733 · two skill frontmatters 62.
Additions 1–9 cost **0** always-loaded tokens (all land in references, skills, root-owned config, docs,
or the vault). Prunes 10–12 return **≈ -177** → **≈ 1702 (85%)**. Net ledger DOWN, per "adding means cutting".

---

## Candidates

1. **[validate: ratcheted grep]** Add `tools/ratchet-greps.mjs` — one grep over `template/ docs/ cli/ tools/ README.md`
   for the four vocabularies retired this session (`"autonomous":` key · `sibling[- ](review|model|tier)` ·
   the three-role `scout…build…deep` list · "opt-in evolve") — wired as a fourth `stopGate` row in the ROOT
   `.claude/harness.json` and a Commands row in the root `AGENTS.md`, so `/validate` and every turn end run it.
   Verified before proposing: **clean on this tree, 25 hits at base `532e0e9`**. Root-owned, so it never ships
   to adopters who have no such history (`harness.json` is in self-harness's `NEVER` set).
   *Note the mechanism gap it exposes:* the template's ratcheted-grep block lives in `validate/SKILL.md`, but this
   repo's `.claude/` is generated and must match the template byte-for-byte — a repo with a synced `.claude/`
   must host its greps in a repo tool named by the gate. One line in the template's validate skill (82/100) says so.
   *traces to:* Rulings 17/20/21 — three fix rounds chasing stale role lists, a `docs/99` "defeats sibling review"
   line, and README/guard comments still saying "opt-in" after `requireEvolveBeforePush` flipped to default on.

2. **[plan-template.md]** New Rules line: a task that RETIRES or RENAMES a config key, role, or vocabulary term
   carries a repo-wide **enumeration grep** in its `Validate:` command — never an enumerated file list, which
   always misses one. *traces to:* four stale three-role lists survived enumerated briefs across three fix rounds
   (`research/SKILL.md`, `harness-maintenance.md:15`, `docs/01:131`, a test comment). Reference 56 → 57 of 160 lines; **0 always-loaded tokens**.

3. **[plan-template.md]** New Rules line: a task adding a config key, model role, or required field states its
   **adopter-migration behaviour on `npx phe update`** (existing configs are kept verbatim, so a new required key
   throws for every current adopter). *traces to:* Ruling 19 — the `routine` role broke `update` for every existing
   Codex adopter until `cli/emit-codex.js` gained warn-and-fallback. **0 always-loaded tokens.**

4. **[reference: harness-maintenance]** One line under section 6 (Failure modes): a **timing-based hook fixture
   states which verdict its elapsed time produces** — a command killed by the per-check timeout is a FAILURE (RED),
   not a skip (INCOMPLETE); size the sleep to the budget and pin the margin. *traces to:* the brief's 3000 ms
   INCOMPLETE recipe produced RED; the implementer caught and corrected it. 106 → 107 of 120 lines; **0 always-loaded tokens.**

5. **[review-branch/SKILL.md]** One line in the step-4 fix loop: a **design decision surfaced during a fix round goes
   back into the plan, or is recorded as a numbered ruling with its cost-of-being-wrong, before it is implemented** —
   a mechanism invented inside a fix-round message is unreviewed. *traces to:* Ruling 14's `res.signal` timeout
   fallback shipped a false-timeout bug (signal death read as timeout), fixed in round 2 by fd-streaming.
   Body 64 → 65 of 100; **0 always-loaded tokens.**

6. **[repo: `.gitignore` + harness-init]** Add `.superpowers/` (the superpowers SDD workspace) to this
   repo's `.gitignore` and to `/harness-init`'s gitignore list, beside `.claude/state/` and `.worktrees/`.
   *traces to:* the skill's script created the workspace untracked; it was hand-excluded via `.git/info/exclude`,
   which is machine-local and does not travel. **0 always-loaded tokens.**

7. **[docs/02]** One note on the `guard.mjs` row: the guard denies any Bash command whose **text** mentions a secret
   filename, including a probe that never reads one — build such payloads programmatically. Anti-accident behaviour
   working as designed, documented rather than changed. *traces to:* two implementers blocked mid-task this session.
   **0 always-loaded tokens** (docs/02 at 97, ≤130 guideline).

8. **[vault: architecture]** Record this session's structural additions in
   `~/Dev/The Vault/projects/perfectHarnessEngineering/architecture.md` (Key modules + Integration points), with the
   folder's `_index.md` updated in the same change per the Index Law: `tools/self-harness.mjs` and the root synced
   `.claude/`; `template/.claude/tooling/run-check.mjs`; `cli/harness-config.js` `RETIRED_KEYS`; `cli/model-tiers.js`
   four-role `ROLES` + `reviewerRoleFor`; the stop-gate gate-config snapshot. **Ask-first (vault write).**
   *traces to:* ADR-023/024/025 were written today; `architecture.md` was not updated alongside them.

9. **[vault: agent-kb/patterns]** New note — *retiring a vocabulary leaks into every enumeration*: a rename ships with
   a repo-wide grep ratcheted into the gate, not an enumerated file list; the enumeration is always stale by the
   round after it is written. Generalizes past PHE to any agent harness with doctrine in prose. **Ask-first (shared store).**
   *traces to:* same incident as item 2.

10. **[prune: AGENTS.md]** M2 dedup — cut four AGENTS.md copies whose `00-core.md` twin is **strictly richer**.
    Both files always load, so a cut needs no pointer. Exact pairs:
    | Cut | Kept (richer because) | est. tok |
    |---|---|---|
    | `AGENTS.md:48` harness-maintenance FIRST | `00-core.md:42-44` — adds `node .claude/hooks/smoke-test.mjs` | −11 |
    | `AGENTS.md:49` navigate by symbol, not grep | `00-core.md:22` — adds LSP diagnostics + "if wired" | −31 |
    | `AGENTS.md:42` Done = evidence | `00-core.md:35` — adds "applies to subagent reports too; re-run, don't relay" | −23 |
    | `AGENTS.md:50` doc-grounded first clause (keep its knowledge-protocol pointer) | `00-core.md:26` — adds cache-first `wiki/stack/<tool>/` | −30 |
    Bonus: `AGENTS.md:42` is the only entry in "Hard rules (each names its enforcer)" with no enforcer.
    **≈ −95 tok.** *traces to:* 2026-08-29 M2, open across two milestones.

11. **[prune: AGENTS.md]** m4 — compress line 30's 91-word roles paragraph to the two facts
    `.claude/references/delivery-org.md` cannot carry (the user is PO **and** Stakeholder; `/review-branch` adds the
    security lens on sensitive diffs) and point at that reference for the rest of the table it restates.
    **≈ −70 of 118 tok.** *traces to:* 2026-08-29 m4, open.

12. **[prune: 00-core.md]** Drop the clause "windows run 200k–1M, so a percentage says nothing" from line 6 —
    `docs/01-context-engineering.md:118` now carries that rationale verbatim ("the trigger is absolute tokens,
    never a percentage"). Frees a line in a file at 44/45. **≈ −12 tok.**
    *traces to:* Task 5 deferred minor, plan-mandated text flagged for the next `00-core` prune.

---

## Dropped (no incident or not worth its tokens)

- **"Transcription → cheapest model" heuristic** — already fixed twice over: the rewritten
  `subagent-model-policy` memory ("the plan contains the code" never downgrades an implementer) and Task 9's
  `routine` role. A third copy in AGENTS.md would be pure tax. Its one live thread — the global
  `~/.claude/CLAUDE.md` still allowing sonnet for "small mechanical fixes" — is already flagged to the PO
  inside that memory file, and editing global config unasked is out of scope for `/evolve`.
- **Brief line numbers drift within a run** — real, but the mitigation (locate by content) is what implementers
  already did unprompted. A rule the model follows without being told is a prune candidate, not an addition.
- **`CLAUDE_CODE_SUBAGENT_MODEL` went stale between 2026-07-12 and 2026-09-05** — the raw-source rule (Task 4)
  and `docs/99`'s dated verification lines already own this. No second rule.
- **Deep-analysis Tier 2 items 7, 8, 10, 12, 13** (citation anchors, plan-confidence rubric, `/evolve` reads
  `/skill-doctor`, token-based ledger, migrations-in-CLI) — each is a pipeline batch, not an evolve line.
  They belong in the next `/plan-work`, and item 11 (M2/M3/M6) is partly discharged by 10–12 above.
- **M3 (tracking-root resolution restated 6×) and M6 (`Knowledge to load first:` checked by nothing)** — both are
  real, both need a mechanism (a shared reference; a plan-lint check), neither fits a one-line rule. Carry to the
  next milestone rather than half-fix them here.
- **The 42 remaining deferred minors** — wording, fixture tightening, and unbounded-readback items already recorded
  in the implementation report. A rule per minor would triple the always-loaded tax for defects the report already tracks.
- **Memory reconciliation (`00-core.md` step-6 duty)** — checked, nothing to do: `MEMORY.md`'s six entries are
  machine-local or cross-project PO feedback, none now covered by a team rule.

**Apply which? ("1,3" / "all" / "none")**
