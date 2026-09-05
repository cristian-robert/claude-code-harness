# /evolve applied — 2026-09-05

Branch `fix/autonomous-single-activation-path`. Operator answered **"all"** to
`reports/evolve-2026-09-05-proposal.md`; all 12 numbered items applied, the Dropped section untouched.

**Ledger:** `node tools/context-ledger.mjs template` → **1879 → 1726** est. tokens (94% WARN → 86% WARN).
The three prunes paid for the nine additions, all of which land in references, skills, docs, root-owned
config, or the vault at **0 always-loaded tokens**.

**Commits**

| SHA | Subject |
|---|---|
| `2b8814b` | `chore(evolve): prune four AGENTS.md dupes + roles paragraph; four traced rule lines` (items 2–7, 10–12 + the proposal record) |
| `bcf59ae` | `feat(validate): ratcheted vocabulary greps` (item 1) |
| _this commit_ | `chore(evolve): applied report` (this file) |

---

## Prunes (applied first, so the ledger had room)

### 10 — M2 dedup: four AGENTS.md copies whose `00-core.md` twin is richer

| Cut | File:line (before) | Kept |
|---|---|---|
| `Done = evidence` | `template/AGENTS.md:42` | `00-core.md:35` — adds "applies to subagent reports too; re-run, don't relay" |
| harness-maintenance FIRST | `template/AGENTS.md:48` | `00-core.md:42-44` — adds `node .claude/hooks/smoke-test.mjs` |
| Navigate by symbol, not grep | `template/AGENTS.md:49` | `00-core.md:22` — adds LSP diagnostics + "if wired" |
| Doc-grounded first clause | `template/AGENTS.md:50` | `00-core.md:26` — adds cache-first `wiki/stack/<tool>/` |

The doc-grounded line was reduced to its knowledge-protocol pointer, now `template/AGENTS.md:47`. Both
files always load, so no pointer was needed for the other three. Cutting `Done = evidence` also removes
the only entry in "Hard rules (each names its enforcer)" that named no enforcer.

**Knock-on, found by `npm test`:** `cli/cli-hardening.test.js:344` asserted every placeholder-gate
allowlist entry is used in `template/AGENTS.md`, and the doc-grounded line was `<tool>`'s only use there.
`<tool>` is still live notation at `template/.claude/rules/00-core.md:26`, which is inside the gate
command's own scan scope (`AGENTS.md .claude/rules/ knowledge-base/`) — so the exemption is still earned
and the assertion was simply narrower than the gate it guards. Widened to that scope
(`cli/cli-hardening.test.js:344-356`) rather than dropping the entry or restoring the pruned line.

### 11 — m4: the roles paragraph

`template/AGENTS.md:30` compressed from a 91-word restatement of `delivery-org.md`'s role table to the
two facts that reference cannot carry (the user is PO **and** Stakeholder; `/review-branch` adds the
security lens on sensitive diffs), pointing at `.claude/references/delivery-org.md` for the rest.

### 12 — `00-core.md` line 6

Dropped "windows run 200k–1M, so a percentage says nothing" — `docs/01-context-engineering.md:118`
carries that rationale verbatim. `template/.claude/rules/00-core.md:6`.

**Validation:** `node tools/context-ledger.mjs template | tail -1` → `1726` (from `1879`).

---

## Additions

### 1 — `tools/ratchet-greps.mjs` + gate wiring (`feat(validate)`)

New tool at `tools/ratchet-greps.mjs`: one sweep over `template/ docs/ cli/ tools/ README.md` for the
four vocabularies retired this session, exit 1 on any hit, `clean` + exit 0 otherwise. Checks at
`tools/ratchet-greps.mjs:37-59`, each with its own name:

1. the `"autonomous":` harness.json key
2. `sibling[- ](review|model|tier)` — the retired review inversion
3. the three-role `scout`/`build`/`deep` enumeration with `routine` missing
4. the evolve→push gate described as "opt-in" (default on since Task 7)

Two design decisions that the incident itself dictated:

- **Enumeration vs data structure.** Check 3 matches the three names separated by ≤3 non-alphanumerics,
  so a legacy test fixture (`scout: 'haiku', build: 'opus', deep: 'opus'`) is not a hit while prose
  ``scout``/``build``/``deep`` is; a line that also names `routine` is current by construction.
- **`ratchet-ok` escape marker, not a narrower pattern or a skipped directory.** Narrowing to make
  today's tree pass is how the check stops working. Two deliberate mentions carry the marker:
  `template/.claude/references/autonomous-mode.md:17` (a retirement note) and
  `cli/model-tiers.test.js:25` (an assertion about the retired inversion).

**Measured, not estimated.** Clean on HEAD; **14 hits** on the base `532e0e9`, every one a real instance
of the drift this branch spent three fix rounds chasing — `harness.json` (both the `$comment` role list
and the `autonomous` key), `guard.mjs:311`, `smoke-test.mjs:121`, `autonomous-mode.md:8`,
`dispatch-protocol.md:47`, `harness-maintenance.md:15`, `00-core.md:30`, `evolve/SKILL.md:86`,
`docs/01:131`, `docs/02:27`, `docs/99:21`, `emit-codex.test.js:660`, `model-tiers.test.js:38`.
(The proposal estimated 25; the measured figure is 14 lines. Reported as measured.)

**One stale line the sweep found on the live tree:** `template/.claude/hooks/smoke-test.mjs:122` still
called the evolve→push gate "Opt-in" after it flipped to default on. Corrected — a comment-only edit, so
no new fixture; smoke test re-run below.

**Wiring**

| Where | What |
|---|---|
| `.claude/harness.json:6` | fourth `stopGate` command (root-owned; in self-harness's NEVER set, so it never ships to adopters) |
| `AGENTS.md:27` | Commands-table row naming the tool and the `ratchet-ok` convention |
| `package.json:40` | `node cli/ratchet-greps.test.js` at the end of the `test` chain |
| `template/.claude/skills/validate/SKILL.md:39` | one line recording why a repo with a GENERATED `.claude/` hosts its greps in a repo tool the gate names, not in the synced skill |

**Test** — `cli/ratchet-greps.test.js`, 13 tests in the ad-hoc `test()` style of `cli/self-harness.test.js`:
one fixture per retired vocabulary (each must exit 1 **and** name the file), all four in one run, the
`ratchet-ok` exemption, the two shapes that must NOT trip it (a JS role map; a four-role enumeration),
repo-wide reach (a file in no enumeration is still swept), `node_modules` and out-of-scope exclusion, and
a live check that the real repo is green.

**Timing** (30 s per-command cap, 75 s total cap): `ratchet-greps` **32 ms**; whole four-command root
gate **4356 ms**.

```
$ node cli/ratchet-greps.test.js
13 passed, 0 failed
$ node tools/ratchet-greps.mjs
clean
```

### 2 & 3 — `plan-template.md` Rules

`template/.claude/references/plan-template.md:57-58`, both ending `(traces to: …)`:

- A task that RETIRES or RENAMES a config key, role, or vocabulary term carries a repo-wide
  **enumeration grep** in its `Validate:` command — never an enumerated file list.
- A task adding a config key, model role, or required field states its **adopter-migration behaviour on
  `npx perfect-harness-engineering update`**: existing configs are kept verbatim, so a newly-required key
  throws for every current adopter.

Reference at 58 lines (≤160).

### 4 — `harness-maintenance.md` section 6 (Failure modes)

New table row at `template/.claude/references/harness-maintenance.md:89`: a command killed by the
per-check timeout is a FAILURE (RED), never a skip (INCOMPLETE); a timing-based fixture states which
verdict its elapsed time produces, sizes the sleep to the budget, and pins the margin. 107 lines.

### 5 — `review-branch/SKILL.md` step-4 fix loop

New bullet at `template/.claude/skills/review-branch/SKILL.md:37`: a design decision surfaced during a fix
round goes back into the plan, or is recorded as a numbered ruling with its cost-of-being-wrong, before it
is implemented — a mechanism invented inside a fix-round message is unreviewed. Body 65/100.

### 6 — `.superpowers/` gitignored

- `.gitignore:31` (this repo's own file) — the workspace was previously hand-excluded via
  `.git/info/exclude`, which is machine-local and does not travel.
- `template/.claude/skills/harness-init/SKILL.md:68` — added to the gitignore list beside
  `.claude/state/` and `.worktrees/`. In-line edit, so the body stays at exactly 100/100.

### 7 — `docs/02` guard note

New paragraph at `docs/02-enforcement-vs-guidance.md:48-51`: `guard.mjs` matches the Bash command's
**text**, so it denies any command that merely mentions a secret filename, a probe that never reads one
included. Anti-accident behaviour working as designed — a text match cannot know a `.env` mention is
harmless, and guessing would reopen the Bash-indirection hole. Build such payloads programmatically.
102 lines (≤130 guideline).

### 8 — Vault: `projects/perfectHarnessEngineering/architecture.md`

`updated:` bumped `2026-08-30` → `2026-09-05`. Changes:

- Hooks row: evolve→push gate is **default on** (was "opt-in"); stop-gate now carries the always-on
  gate-config snapshot (a GREEN reached by shrinking, emptying, or deleting the gate after a
  RED/INCOMPLETE is refused); statusline reports absolute tokens.
- New Layer-2 row for `template/.claude/tooling/run-check.mjs` — log on disk, exit + tail in context,
  `--timeout-sec`, exit 124.
- New `cli/` row — `harness-config.js` `RETIRED_KEYS`, `model-tiers.js` four `ROLES` +
  `reviewerRoleFor` → always `deep`, `emit-codex.js` missing-role warn-and-fallback.
- Measurement row extended with `tools/self-harness.mjs` (root `.claude/` is a generated copy; `--check`
  is a root stop-gate command) and `tools/ratchet-greps.mjs`.
- New Integration point: the repo's self-hosting — root-owned `harness.json`, the four-command root gate,
  and why a forgotten sync is a red gate rather than silent divergence.

### 9 — Vault: `agent-kb/patterns/retired-vocabulary-leaks.md`

New note in the folder's shape (`type: note`, `updated: 2026-09-05`, `tags:`), same section rhythm as its
siblings (The shape · Failure mode, with receipts · The rule · design notes · The tell), linking
`executable-logic-never-in-prose` and `bounded-agent-loops`. Index Law satisfied: bullet added to
`agent-kb/patterns/_index.md` immediately before `_Suggested next filenames:`; that index already carried
`updated: 2026-09-05`. The vault is not a git repo — files only, nothing to commit there.

---

## Verification

```
$ npm test
… every suite: N passed, 0 failed  (exit 0)
$ node template/.claude/hooks/smoke-test.mjs
150 passed, 0 failed
$ node tools/self-harness.mjs --check
self-harness: root .claude/ matches template/.claude/
$ node tools/ratchet-greps.mjs
clean
$ node tools/context-ledger.mjs template | tail -1
1726
```

**Budgets after the run**

| File | Lines | Budget |
|---|---|---|
| `template/AGENTS.md` | 56 | ≤60 |
| `template/.claude/rules/00-core.md` | 44 | ≤45 |
| `template/.claude/references/plan-template.md` | 58 | ≤160 |
| `template/.claude/references/harness-maintenance.md` | 107 | ≤160 |
| `template/.claude/skills/review-branch/SKILL.md` (body) | 65 | ≤100 |
| `template/.claude/skills/validate/SKILL.md` (body) | 84 | ≤100 |
| `template/.claude/skills/harness-init/SKILL.md` (body) | 100 | ≤100 |
| `docs/02-enforcement-vs-guidance.md` | 102 | ≤130 guideline |

## Not applicable

- **`kb-check` + the `docs(kb):` commit.** This repo has no local `knowledge-base/`; its knowledge base is
  the Obsidian vault at `~/Dev/The Vault/`, which is not a git repo. The step-6 KB gate and its single
  `docs(kb):` commit have no target here, so both were skipped. Items 8 and 9 were written to the vault as
  files, under the Index Law.
- **Memory reconciliation.** The proposal already checked it: `MEMORY.md`'s six entries are machine-local
  or cross-project PO feedback, none now covered by a team rule. Nothing to remove.
- **`.claude/state/.evolve-ran`.** Deliberately not written — the controller writes the marker last.
