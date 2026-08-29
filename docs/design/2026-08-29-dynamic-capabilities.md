# 2026-08-29 · Dynamic capabilities — the harness declares what it needs and resolves it with approval

PO directive (2026-08-29): "Right now we assume that the user already has some plugins that download
some skills, commands, etc. How can we make this dynamic? … for superpowers, we can do at init a pull
to get the skills → also we can detect the project configuration and search and pull necessary skills,
commands, but always with user approval. If there is a new project, we should ask the user what this
project will be — technologies, stack — and then decide what we should pull."

This design adds one manifest, one resolver, and wires four existing surfaces to it. It changes no
command name and no hook contract. Every install is approval-gated; nothing is ever assumed present.

## Current wiring (audited 2026-08-29)

The template references capabilities it does not ship and never checks for:

| Class | Instances | Where referenced |
|---|---|---|
| Official plugin, **external** source | `superpowers` (11 skills) | `plan-work`, `implement`, `validate`, `review-branch`, `evolve`, `debugging-this-repo`, `rules/00-core.md`, `AGENTS.md` |
| Non-official marketplace plugin | `codex@openai-codex` (`codex:rescue`) | `review-branch` |
| Global agents (not plugins) | `~/.claude/agents/architect-agent`, `tester-agent` | `harness-init` step 4 reports absence only |
| MCP / LSP / binaries | codebase-search (`uv`), context7 (`npx`), language servers, `gh`, `act`, `codex` | `.mcp.json`, `.lsp.json`, `harness-init` |

`cli/init.js` detects the stack (`detectTechStack()`, 15 signals) and prints it; nothing consumes it.
`merge-settings.js` unions only `hooks` and `permissions` — an adopter's existing `enabledPlugins`
would be clobbered on re-init. ADR-008 gave every superpowers call an inline fallback, so absence
degrades silently: the pipeline runs a condensed discipline and nobody is told.

## Verified platform facts (Claude Code 2.1.251, official docs, 2026-08-29)

1. `.claude/settings.json` may carry `extraKnownMarketplaces` + `enabledPlugins`. After a teammate
   trusts the folder, Claude Code registers the marketplaces and enables the plugins with no further
   prompt. Honoured in cloud sessions, where `/plugin` does not exist.
2. **Since v2.1.195 that path does not install external-source plugins.** A plugin whose marketplace
   entry points at another repo "doesn't load until the team member installs it"; Claude Code prints
   the `claude plugin install` command. In the official catalog: `superpowers` → `obra/superpowers.git`
   (external), `supabase`, `vercel`, `stripe` → external; `feature-dev`, `commit-commands`,
   `code-review`, `context7`, `security-guidance`, every `*-lsp` → relative path (auto-installs).
3. Non-interactive CLI: `claude plugin install <id> --scope user|project|local`, `claude plugin list
   --json` (`id`, `scope`, `enabled`, `installPath`, `version`), `claude plugin marketplace list
   --json` (`name`, `source`, `repo`, `installLocation`), `claude plugin marketplace add <src>`,
   `claude plugin details <id>` (text only — no `--json`). The marketplace manifest format
   (`<installLocation>/.claude-plugin/marketplace.json`) and the plugin layout (`skills/<name>/SKILL.md`)
   are documented.
4. Settings precedence: managed > CLI > `.claude/settings.local.json` > `.claude/settings.json` >
   `~/.claude/settings.json`. A project `true` therefore overrides a user-scope `false`.
5. Managed restrictions (`strictKnownMarketplaces`, `blockedMarketplaces`,
   `disableCommandPluginSources`, force-disabled plugins) are enforced on add, install and update.
6. `plugin.json` supports `dependencies`; cross-marketplace dependencies require the **root**
   marketplace's `allowCrossMarketplaceDependenciesOn`. PHE is not a plugin, so this is the follow-on
   path (Approach C), not this design.
7. `CLAUDE_CONFIG_DIR` relocates `~/.claude`; project-scope hooks and settings apply only after the
   workspace-trust dialog.

## Decisions locked (PO, 2026-08-29)

1. **Split by phase.** `init` (Node, no session) resolves only tier `required` from a curated matrix;
   `/harness-init` (in-session) resolves the stack tier from the same matrix and layers model-driven
   discovery over the registered catalogs. Rejected: matrix-only (cannot discover), model-only (cannot
   run in `init`, non-deterministic).
2. **Default scope `project`**, `--scope` override, `local` for "I cannot touch shared settings".
   `claude plugin install --scope project` writes `enabledPlugins` into `.claude/settings.json`, which
   PHE already owns and commits; teammates and cloud sessions inherit the declaration.
3. **Soft-required.** Declining superpowers is allowed and recorded; the ADR-008 fallbacks apply;
   session-start stays silent about declined items; re-offered only when `update` raises the tier or on
   `capabilities --reset`. Rejected: nag every session (a standing context tax that trains people to
   ignore hook output), hard block (breaks offline/CI/policy-locked installs, contradicts ADR-006).
4. **Discovery may propose from any discoverable catalog, community included.** Adding a marketplace
   is its own approval step with the repo URL shown; every community proposal carries source URL,
   pinned SHA, and always-on cost, labelled "SHA-pinned, third-party, automated screening only".
   Managed restrictions win over all of it.
5. **Global agents are out of scope for provisioning.** They appear in the manifest as
   `class: global-agent, provision: manual` so the report is complete; the install path is a
   follow-on (`phe-agents` plugin in a PHE marketplace, which would also unlock Approach C).

## Architecture — one manifest, one resolver, four callers

```
template/.claude/capabilities.json      ← declares (tiers · classes · stack matrix · why per row)
cli/capabilities.js                     ← readState() · plan() [pure] · apply() [thin shell]
        ▲              ▲              ▲                 ▲
      init         /harness-init   session-start.mjs   update  (+ /evolve prune line)
   required tier   stack tier +    drift ≤2 lines,     manifest delta,
   one Y/n         discovery,      no spawning         rename guard
                   one AUQ round
```

Deterministic work lives in Node and is fixture-tested; the model only adds discovery and the
interview. `harness.json` records **decisions**; `.claude/settings.json` (written by Claude Code's own
CLI) records **state**; session-start reconciles the two.

## Components — six units

**1. Manifest** — `template/.claude/capabilities.json`, template-owned (overwritten on `update`, like
`settings.json`). Shape:

```json
{
  "marketplaces": {
    "claude-plugins-official": { "source": { "source": "github", "repo": "anthropics/claude-plugins-official" }, "trust": "official" },
    "claude-community":        { "source": { "source": "github", "repo": "anthropics/claude-plugins-community" }, "trust": "community" },
    "openai-codex":            { "source": { "source": "github", "repo": "openai/codex-plugin-cc" }, "trust": "third-party" }
  },
  "capabilities": [
    { "id": "superpowers@claude-plugins-official", "class": "plugin", "tier": "required",
      "skills": ["brainstorming","writing-plans","using-git-worktrees","subagent-driven-development","executing-plans",
                 "test-driven-development","verification-before-completion","requesting-code-review",
                 "receiving-code-review","finishing-a-development-branch","systematic-debugging"],
      "usedBy": ["plan-work","implement","validate","review-branch","evolve","debugging-this-repo"],
      "why": "ADR-008 — execution discipline inside every PIV stage; inline fallbacks are condensed, not equivalent" },
    { "id": "codex@openai-codex", "class": "plugin", "tier": "optional", "skills": ["rescue"], "usedBy": ["review-branch"],
      "requiresBinary": "codex", "why": "second-opinion rescue pass; needs the Codex CLI" },
    { "id": "typescript-lsp@claude-plugins-official", "class": "plugin", "tier": "recommended",
      "when": { "stack": ["Next.js","React","Vue","Svelte","Express","NestJS","Expo"] },
      "requiresBinary": "typescript-language-server", "supersedes": { "lsp": "typescript" },
      "why": "official LSP plugin replaces the hand-rolled .lsp.json entry" },
    { "id": "pyright-lsp@claude-plugins-official", "class": "plugin", "tier": "recommended", "when": { "stack": ["Python"] },
      "requiresBinary": "pyright-langserver", "supersedes": { "lsp": "python" }, "why": "same" },
    { "id": "gopls-lsp@claude-plugins-official", "class": "plugin", "tier": "recommended", "when": { "stack": ["Go"] },
      "requiresBinary": "gopls", "why": "same" },
    { "id": "rust-analyzer-lsp@claude-plugins-official", "class": "plugin", "tier": "recommended", "when": { "stack": ["Rust"] },
      "requiresBinary": "rust-analyzer", "why": "same" },
    { "id": "supabase@claude-plugins-official", "class": "plugin", "tier": "recommended", "when": { "stack": ["Supabase"] },
      "why": "detected dependency; bundles an MCP server (per-server approval, cache cost)" },
    { "id": "stripe@claude-plugins-official", "class": "plugin", "tier": "recommended", "when": { "stack": ["Stripe"] },
      "why": "detected dependency" },
    { "id": "architect-agent", "class": "global-agent", "tier": "recommended", "provision": "manual",
      "path": "~/.claude/agents/architect-agent/AGENT.md", "why": "harness-init degraded-roles notice" },
    { "id": "tester-agent", "class": "global-agent", "tier": "recommended", "provision": "manual",
      "path": "~/.claude/agents/tester-agent/AGENT.md", "why": "same" }
  ]
}
```

Rules: `tier` ∈ required (asked at `init`) · recommended (`when` matches, proposed at `/harness-init`)
· optional (listed, off by default). `when.stack` matches the strings `detectTechStack()` emits;
`when.files` matches paths — no new detection language. `supersedes` is the prune half of the ratchet.
`requiresBinary` is checked with `command -v`; a missing binary labels the proposal but does not block
it. `skills` is the rename guard. Every row carries `why` (ratchet: no incident/reason, no row).

**2. Resolver** — `cli/capabilities.js`.

- `readState()` — best-effort, never throws: `claude --version` (absent → `state.claude = null`);
  `claude plugin list --json`, keyed by full id **and** bare plugin name (a `--plugin-dir` copy or the
  same plugin from another marketplace counts as present); `claude plugin marketplace list --json` +
  each `marketplace.json` for `source`/`sha`; `enabledPlugins` scan across `~/.claude/settings.json`
  (`CLAUDE_CONFIG_DIR` honoured), `.claude/settings.json`, `.claude/settings.local.json`;
  `command -v` per `requiresBinary`.
- `plan({ manifest, stack, state, decisions, tiers })` — pure. Buckets: `present` · `disabledByUser`
  (explicit override warning) · `install` · `needsMarketplace` · `declined` (skip) · `reoffer` (tier
  rose) · `blocked` (never retry) · `manual` (global agents, no `claude`). Each entry: `id, tier, why,
  source, sha, cost, binaryMissing`.
- `apply(plan, { scope, tty, ask })` — sequential, approval per step, failures recorded and skipped:
  marketplace adds → installs (required: Y/n each; recommended: checklist; optional: off unless named)
  → write `harness.json.capabilities` → print `/reload-plugins` when anything installed.
- `enabledPlugins` is written by `claude plugin install` (Claude Code owns the format). Only the
  no-`claude` path hand-writes the documented `{ "<id>": true }` shape so cloud sessions and teammates
  still get the declaration.
- Non-TTY: `apply` runs nothing; one line names what would be asked and how to resolve later.
- CLI: `npx perfect-harness-engineering capabilities [--propose --json] [--apply <ids>] [--check]
  [--scope user|project|local] [--reset]`.

**3. `harness.json.capabilities`** — user config, user-wins merge via `harness-config.js`:

```json
"capabilities": {
  "scope": "project", "resolvedAt": "2026-08-29", "manifestVersion": "3.1.0",
  "accepted":    { "superpowers@claude-plugins-official": { "at": "2026-08-29", "tier": "required", "overrodeUserDisable": false } },
  "declined":    { "codex@openai-codex": { "at": "2026-08-29", "tier": "optional" } },
  "unavailable": { "stripe@claude-plugins-official": { "at": "2026-08-29", "reason": "blocked: strictKnownMarketplaces" } }
}
```

**4. `merge-settings.js`** — learns `enabledPlugins` and `extraKnownMarketplaces`: per-key union, user
value wins. Closes the re-init clobber gap.

**5. Callers** — see Data flow.

**6. Ratchet test** — `cli/capabilities-manifest.test.js` greps `template/` for `<plugin>:<skill>`
references and fails if any plugin or skill is not declared in the manifest.

## Data flow

**`init`** (after the settings reconcile, `targets` includes `claude`): tier `required` only →

```
Required by the pipeline:
  superpowers@claude-plugins-official — obra/superpowers @ b36e082 · ADR-008: execution discipline inside every PIV stage
  <`claude plugin details` cost lines, verbatim, when available>
Install to project scope? [Y/n]
```

Codex-only → one skipped line. Non-TTY → one skipped line. Empty dir → nothing extra here; the stack
interview belongs to `/harness-init`.

**`/harness-init`** — smallest diffs to the existing skill:
- Step 1 DETECT: run `capabilities --propose --json` (stack tier + required drift). Discovery: read
  `marketplace list --json`, open each `installLocation/.claude-plugin/marketplace.json`, shortlist by
  description/category against the detected stack. Community catalog only if registered, else offered.
- Step 2 INTERVIEW: when detection found nothing (empty dir), a stack multi-select over the matrix's
  strings joins the batch. One `Capabilities` multi-select lists every proposal with
  tier · why · source@sha · cost · binary-missing flag; user-disabled items carry the override warning.
  Still a single AskUserQuestion round.
- Step 3 GENERATE: `capabilities --apply <ids> --scope project`; delete `.lsp.json` entries a
  `supersedes` covers; if `context7@claude-plugins-official` is accepted, skip the manual `.mcp.json`
  row from question 6. Tell the user `/reload-plugins`.
- Step 4 VERIFY: `capabilities --check` row; the degraded-roles notice becomes "declined/unavailable
  required capabilities + missing global agents", written once to `reports/harness-init.md`.

**`session-start.mjs`** — no spawning, no network, ≤2 lines: for each `accepted` plugin, look for its
id in the three settings files; missing everywhere → `Capability drift: <id> accepted <date> but not
enabled — claude plugin install <id> --scope project`. Declined/unavailable never print. No
`capabilities` key (pre-3.1 project) → silent.

**`update`** — diff the project's old manifest against the new one before the copy: new
required/recommended rows → resolver on the delta (TTY only); rows PHE dropped → "no longer needed by
the harness; `claude plugin uninstall …` if nothing else uses it" (never uninstalls); declined item
whose tier rose → `reoffer`. Rename guard: `installPath/skills/*` vs manifest `skills` → warn naming
the vanished skill and the PHE files that reference it.

**`/evolve`** — prune pass gains one line: `capabilities --check`, plus accepted plugins whose `when`
no longer matches the stack listed as prune candidates. Human decides.

**Codex target** — `.agents/skills/` has no plugin system; provisioning is Claude-only and the report
says so.

## Failure handling

Every row: `init` still exits 0 with the payload installed; the outcome lands in
`harness.json.capabilities` and `reports/harness-init.md`.

| Condition | Detected by | Outcome |
|---|---|---|
| `claude` absent / too old for `plugin` | `claude --version` or `plugin list --json` fails | `manual`; hand-write `enabledPlugins`; print commands |
| Official marketplace not registered | `marketplace list --json` lacks it | offer `marketplace add`; decline → `unavailable(marketplace)` |
| Offline / proxy | non-zero exit, network text | `unavailable(network)`; drift line points at retry; retried only on next `init`/`update`/`--apply` |
| Policy refusal | exit text names the setting | `blocked` with the setting name; never retried, never nudged |
| Plugin gone from catalog | "not found" | `unavailable(not-found)`; `update` re-checks |
| Install ok, needs reload | any install | one `/reload-plugins` line |
| Plugin prompts `userConfig` | TTY path only | stdio inherited so the prompt is the user's |
| User-scope `false` overridden | settings scan | warning in the approval line; `overrodeUserDisable: true` |
| Range-conflict / dependency errors | exit text | `unavailable(<text>)`; no retry |
| Unmatched non-zero exit | any | `unavailable(<first line>)` — wording drift degrades to a report, never a crash |

## Ratchet + prune

- `.lsp.json` entries superseded by an accepted LSP plugin are deleted; the hand-rolled file shrinks
  to languages without an official plugin.
- The manual context7 MCP row is skipped when the plugin is accepted — one server, one mechanism.
- No always-loaded context is added: JSON read by tools; a session-start line only on drift;
  declined items silent forever.
- The ratchet test refuses undeclared `<plugin>:<skill>` references.

## Budget

`session-start.mjs` output stays ≤20 lines (≤2 from this feature). `harness-init/SKILL.md` gains ~8
lines — measure with `tools/context-ledger.mjs template`; cut elsewhere in the skill if it crosses
100. Template CLAUDE.md, rules: unchanged.

## Acceptance

1. Fresh TTY `init` on a Node project with no plugins: asks exactly one required question; on Y,
   `claude plugin list --json` shows `superpowers@claude-plugins-official` at `project` scope and
   `.claude/settings.json` carries `enabledPlugins`; `harness.json.capabilities.accepted` records it.
2. Same run with `n`: nothing installed; `declined` recorded; the next session-start prints no
   capability line; `/harness-init` report lists it under degraded roles.
3. Piped `init` (`printf … | node cli/init.js`): no install attempted, one skipped line, exit 0.
4. `init` with `claude` shimmed absent: `enabledPlugins` hand-written; commands printed; exit 0.
5. `init` with the shim returning a `strictKnownMarketplaces` refusal: `blocked` recorded; re-running
   does not re-ask.
6. Re-init over a project whose `.claude/settings.json` already has `enabledPlugins`: union preserved.
7. `update` from a manifest without `gopls-lsp` to one with it, on a Go project: proposes only the
   delta; a declined item with an unchanged tier is not re-asked.
8. Rename guard: shim `installPath` lacking `executing-plans` → `update` warns naming
   `implement/SKILL.md`.
9. `node template/.claude/hooks/smoke-test.mjs` green with four new session-start fixtures (drift, no
   drift, declined-only, no key); `npm test` green including the manifest ratchet test.
10. `tools/context-ledger.mjs template` within budget.

## Delivery order — three increments, each independently shippable

1. **Manifest + resolver + `init` + tests** (`capabilities.json`, `capabilities.js`, `merge-settings`
   keys, `init` required prompt, ratchet test, shim-based tests). Ships value on day one: superpowers is
   pulled at init.
2. **`/harness-init` + session-start + `/evolve`** (stack tier, discovery, empty-dir interview,
   `supersedes` prune, drift line, smoke fixtures).
3. **`update` delta + rename guard.**

Release 3.1.0 (minor, additive). ADR-017 "Capabilities are declared, resolved with approval, never
assumed" → vault `decisions.md`; `architecture.md` key-dependencies line; both `_index.md` bumped.
README install section: one paragraph.

## Known limits (accepted, not fixed)

- Superpowers on Codex is unverified; Codex users get the inline fallbacks and a report line.
- `enabledPlugins` presence ≠ installed (cache could be missing); session-start's drift check is a
  nudge, the authoritative check is `capabilities --check` (spawns `claude`) in `/harness-init` and
  `/evolve`.
- `claude plugin details` is parsed by nobody: cost lines are shown verbatim or omitted.
- Detection proposes, never decides: a `stripe` devDependency in a test util still yields a proposal;
  the approval gate is the filter.
- Project-scope `true` overriding a teammate's user-scope `false` is a platform property; we warn the
  adopter, we cannot warn the teammate.
- Approach C (PHE as a plugin with `dependencies`) is the cleaner end state and is deliberately
  deferred: it re-architects the payload and needs a PHE marketplace.
