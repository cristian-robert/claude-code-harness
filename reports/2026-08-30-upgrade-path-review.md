# PHE Upgrade-Path Adversarial Review — 2.0.0 → 3.1.0 (→ 3.2.0)

Reviewed at: branch `docs/dynamic-capabilities-spec`, 244ea4c (v3.1.0). Read-only on the repo.
Fixture: `scratchpad/repro.js` — simulates a 2.0.0 adopter (template extracted from `d1984db`,
the 2.0.0 release commit), months of customization, then drives the exact exported-function
sequence of `cli/update.js main()` (lines 238–363) against the 3.1.0 template, twice.
All 23 fixture assertions passed as predicted except one — which revealed a WORSE outcome
than predicted (finding 3).

## Version-era ground truth (from git)

- **1.2.0** (4be5b6b): already AGENTS.md-canonical with CLAUDE.md `@AGENTS.md` shim. No
  CLAUDE.md-canonical era exists post-1.2.0; hunt item 8's "filled CLAUDE.md" scenario only
  applies to pre-PHE projects, whose CLAUDE.md.backup→AGENTS.md reconcile is handled by
  harness-init step 0.
- **2.0.0** (d1984db, Jul 14): skill renames (plan→plan-work, review→review-branch) +
  `migrations.js`; `vault-config.js` records `vault: {mode, path}` in harness.json; merge-settings
  with user-origin marker already present.
- **3.0.0** (06fb57a): knowledge-base era — `knowledge-config.js` (`knowledge` key replaces
  `vault`), `vault-protocol.md` deleted (it existed only on main between releases — any project
  that ran `update` in that window has it orphaned), `knowledge-protocol.md`,
  knowledge-base-scaffold, kb-check, guard/session-start knowledge wiring.
- **3.1.0** (244ea4c): capabilities increment 1 — `capabilities.json` manifest, `capabilities`
  subcommand, init-only resolution question. Update delta = planned increment 3 (spec
  2026-08-29-dynamic-capabilities.md, "Delivery order").
- Template files deleted 2.0.0→3.1.0: `references/vault-protocol.md` (mid-era only),
  `references/vault-scaffold/system/pointer-block.md`,
  `references/vault-scaffold/system/templates/project-template/*` (5 files). No rules, skills,
  agents, or hooks were deleted — so no *always-loaded* orphans exist for this pair.

## Verdict

The FIRST upgrade is honest only if the user runs `/harness-init` before touching anything and
before ever updating again; the SECOND upgrade silently and permanently destroys every piece of
user context added since the first (AGENTS.md content, rule tunings, re-added hooks), while the
recovery flow (`.init-meta.json` → harness-init step 0) actively points away from the surviving
stale backups. Against the PO bar — "merge everything flawless, add every information, not lose
context" — the multi-upgrade story fails outright; the single-upgrade story passes conditionally.

## Findings (ranked)

### F1 · RELEASE-BLOCKER — Second update permanently destroys post-first-update user content
`backupAndCopy` first-backup-wins: `cli/update.js:106` (`if (!fs.existsSync(backupPath))`);
same in `copyClaudeMdWithBackup` (`cli/claude-md-copy.js:38`).
Repro (repro.js U2): after U1 + reconcile + new team content ("POST-U1 NOTE" in AGENTS.md,
"POST-U1 RULE" in 00-core.md), the second update overwrites live files with template
placeholders, takes NO backup (one exists), and `grep -rl` over the whole project finds the
post-U1 content in **no file**. AGENTS.md.backup still holds the 2.0.0-era copy.
harness-init's own step 0 instructs "Keep every .backup until the user confirms" — the
*safe-looking* choice is the one that guarantees the loss.
**Fix sketch:** refresh the backup whenever live ≠ template AND live ≠ existing backup
(rotate `.backup-<ts>`, or rpm-style: track installed-payload file hashes in .init-meta so
"user-modified" is detectable); or refuse-and-list instead of overwrite.

### F2 · RELEASE-BLOCKER — Post-adoption settings.json hooks/permissions silently dropped every update
A fresh-project 2.0.0 adopter has no `.settings-user-origin` marker (init only writes it when a
pre-PHE settings.json was backed up: `cli/init.js:324`, `cli/merge-settings.js:230`). Their
post-adoption hook + permission edits live in `.claude/settings.json`; update clobbers it with
the template and `reconcileSettingsJson` returns `{merged:false}` with no message
(`cli/update.js:336-340` logs only merged/error). Repro U1: `team-notify` hook and
`Bash(pnpm test:*)` gone from live settings; U2: the re-added hook wiped again, surviving
nowhere except the stale U1 backup. Only `enabledPlugins`/`extraKnownMarketplaces` are
captured/restored (`PLUGIN_KEYS`, `cli/merge-settings.js:255`). harness-init step 0 states
"`settings.json` is already merged" (SKILL.md:15) — false for this class, so the LLM reconcile
skips it too. The user's guardrail hooks stop firing with zero notice.
**Fix sketch:** capture/restore should diff live settings against the *previous template's*
settings.json (ship it in .init-meta or by hash) and re-union user-added entries; minimally,
print a loud warning whenever live ≠ template and no marker exists.

### F3 · RELEASE-BLOCKER — Second update rewrites .init-meta.json to list ONLY PHE's own files, severing the recovery path
Predicted "meta goes stale"; reality is worse. U2 backs up the 19 files 3.1.0 *added* (they
existed post-U1 with no .backup — capabilities.json, knowledge-protocol.md, ci-workflows.md,
scaffold files…), so `stats.backedUp = 19 > 0` and `createInitMeta` (update.js:361) rewrites
`backedUpFiles` to those 19 PHE-shipped paths. AGENTS.md and the user's rules are absent, so
harness-init step 0 ("For each backedUpFiles entry…", SKILL.md:15) reconciles none of the
user's content — live AGENTS.md stays placeholder and nothing ever points at the stale
backups. Also: these 19 "backups" are PHE-origin copies of PHE files — exactly what the
marker logic elsewhere exists to prevent — and `.claude/rules/ci-workflows.md.backup` is now
eligible for step-0 "reconcile" as if it were user prose.
**Fix sketch:** union backedUpFiles across runs instead of replacing; never list a backup whose
content is byte-identical to the just-installed template file; have harness-init delete or
stamp .init-meta.json when reconcile completes.

### F4 · INCREMENT-3 (with one blocker-adjacent edge) — `vault` → `knowledge` is never migrated; the 2.0.0 knowledge loop silently dies
Nothing reads the legacy `vault` key (grep: only comments reference it); nothing converts it.
After update the fixture has `vault` intact, no `knowledge` key (template harness.json ships
none; `installHarnessConfig` adds only template keys). Lived result, repro-verified:
`session-start.mjs` prints no knowledge orientation (`cfg.knowledge` absent, hook line 81);
`guard.mjs sharedStorePath` returns null (line 57) so shared-vault denies are inert; harness-init
q5 re-asks "shared vault path / skip" ignoring the already-recorded `vault.path` (SKILL.md:50);
the stale key persists forever. Bigger: the 2.0.0 protocol accumulated project knowledge in
`<vault>/projects/<name>/`; 3.1.0's architect-agent and skills read only `knowledge-base/`, and
`/knowledge-migrate` + the "update nudge" are unshipped increment 2 (KB spec, Delivery order
table). Months of accumulated project knowledge silently stops being consulted, and update says
nothing. Planned work — but the interim is silent, which is the part that violates the bar.
**Fix sketch:** cheap one-time key conversion in update (`vault` present ∧ `knowledge` absent →
synthesize `knowledge:{local:"knowledge-base", shared:<vault>, migratedAt:null}`, drop `vault`);
prefill harness-init q5 from it; print the migration-pending nudge now, not in increment 2.

### F5 · INCREMENT-3 — capabilities.json arrives silently; README points at a resolution step that doesn't exist
Update copies `capabilities.json` in as a created file and never mentions it (no capabilities
code or output anywhere in update.js). Zero payload surfaces reference it: grep over
template skills/hooks/AGENTS.md finds nothing; harness-init SKILL.md has no capabilities step.
README.md:45 claims resolution via "`npx perfect-harness-engineering capabilities`, or
`/harness-init` in a session" — the second half is false in the shipped payload. Upgraded users
get a manifest declaring superpowers `tier: required` with no resolution, no notice, no nag.
Interim is *functionally* acceptable (AGENTS.md already demanded superpowers in prose since
2.0.0, and 8c38610 added inline fallbacks) but *communicatively* silent.
**Fix sketch (pre-increment-3):** one line in update output ("capabilities declared — run `npx
perfect-harness-engineering capabilities` to resolve"); fix or fulfill the README claim.

### F6 · INCREMENT-3 — .init-meta.json `previousVersion` is the app's version, making version-aware migration impossible
`getVersion(projectRoot)` reads the *project's* package.json (update.js:162, init.js:404).
Repro: meta says `previousVersion: "0.4.2"` (the fixture app), `newVersion: "3.1.0"`. PHE
never records which PHE version a project runs, so `update` cannot know it is crossing 2.0.0→3.x
— the root cause of migrations being a static 2-entry rename table and of F4's impossibility of
a targeted nudge. **Fix:** stamp installed PHE version in harness.json or .init-meta at
init/update; the delta work in increment 3 needs it anyway.

### F7 · ACCEPT (document it) — orphaned 2.0.0 files persist; harness-init propagates them into the user's vault
No always-loaded orphans for 2.0.0→3.1.0 (no rules/skills/hooks deleted — context-ledger
budget unaffected; verified via `git log --diff-filter=D`). Orphans are lazy references:
`vault-scaffold/system/pointer-block.md` + `project-template/*` (and `vault-protocol.md` for
mid-era updaters). But harness-init step 3 copies the whole `vault-scaffold/` into an empty
shared store (SKILL.md:67) — including the orphaned `project-template/`, which scaffolds
per-project files in the vault, directly contradicting the 3.x boundary rule ("never write
project knowledge into `<shared>/projects/`", knowledge-protocol.md:15). The 2-entry
`RENAMED_SKILLS` table is the ONLY deletion mechanism; any future rule rename becomes a
permanent always-loaded tax. **Fix sketch:** a `RETIRED_PATHS` table in migrations.js beside
RENAMED_SKILLS (delete-if-byte-identical-to-old-template, else .backup).

### F8 · ACCEPT — backup pile-up: 72 files after U1, 91 after U2, never pruned, never gitignored
Repro counts. 19 of the U2 backups are byte-identical copies of PHE's own files. Template ships
no .gitignore; harness-init's .gitignore step (SKILL.md:66) covers state dirs only — all
backups land in git status and will be committed. Pruning exists only as an interactive offer
inside harness-init step 0. Converges only on the golden path (reconcile + delete after EVERY
update). emit-codex at least skips mirroring `.backup` into `.agents/` (emit-codex.js:216).

### F9 · ACCEPT (documented, but note the teeth) — generated-tree clobbering
Repro: a user-authored `.agents/skills/my-team-skill/` is `rm -rf`'d by the stale-prune loop
(emit-codex.js:346-351) on every emit/update — the one place PHE recursively deletes content it
never created. `.codex/config.toml` is regenerated wholesale. Both documented (README:58,
`.phe-generated` marker). Symlink guards (F1 fixes) are solid. No hook-hash re-trust mechanism
exists at 3.1.0 (Codex hooks are unwired; 13d98c3 removed the false claim), so that disarm
scenario is moot. Codex project-trust survives update (path unchanged).

### F10 · ACCEPT — no-harness-key project with Codex trees: update deletes them after a console line
update.js:186-189 assumes `['claude']` for a missing key; `cleanupDroppedTargets` then removes
`.agents/` + `.codex/` (repro-verified). Printed, regenerable via re-init, and the invalid-key
case correctly throws pre-download (update.js:174-181). Edge only for pre-2.0.0/hand-rolled
states.

### F11 · Doc honesty — CLI help claims update does a "three-way merge"
`cli/index.js:78`: "update — Update payload files, preserving customizations (three-way
merge)". It is backup-then-clobber plus a later LLM prose reconcile of two file classes, and
F1-F3 show "preserving customizations" is false from the second update on. Cheap fix, real
expectations damage.

## What already works (evidence)

- `installHarnessConfig` user-wins merge: stopGate, baseBranch develop, workTracking github, and
  even the legacy vault key all survived both updates; 3.1.0's new `localCi`/`selfHostedRunner`
  keys arrived with defaults (repro U1; harness-config.js:140-172).
- Plugin keys (`enabledPlugins`/`extraKnownMarketplaces`) survive re-init/update via
  capture/restore bracket (repro; merge-settings.js:255-290, hardened d4ce8d5/3082daa).
- Skill-rename migration is guarded (no-op vs pre-rename payloads), idempotent, neutralizes
  instead of deleting (migrations.js:31-41; 16 asserts in migrations.test.js).
- harness.json writes are atomic + fsync + mode-preserving; malformed harness.json halts update
  before any disk write (update.js:174-181, harness-config.js:52-98).
- Every destructive generated-tree path is symlink-guarded, lstat-first (emit-codex.js:248-292).
- The FIRST update's recovery path is genuinely complete when followed: U1 meta listed all 72
  backups including AGENTS.md + rules; step 0 covers AGENTS.md, rules, and pre-PHE CLAUDE.md →
  AGENTS.md redirection (SKILL.md:15-17).

## The lived multi-upgrade timeline (fixture, condensed)

| Step | Live AGENTS.md | User hooks firing | Recovery pointer |
|---|---|---|---|
| 2.0.0 + months | filled | yes | — |
| update →3.1.0 | placeholders | **no (silent)** | meta lists 72 incl. AGENTS.md ✓ |
| /harness-init | reconciled | re-added by hand | backups kept (offered, declined) |
| + new team content | reconciled+ | yes | — |
| update →3.2.0 | **placeholders** | **no (silent)** | meta lists 19 PHE files, AGENTS.md absent |
| /harness-init | **stays placeholder** | — | post-U1 content unrecoverable |
