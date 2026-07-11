# Design — Multi-harness: PHE on Codex CLI alongside Claude Code

- **Date:** 2026-07-11
- **Status:** proposed — pending written-spec sign-off
- **Scope:** PHE canonical repo. Targets Codex **CLI + IDE extension** as first-class; Codex **cloud/app**
  degrades to guidance-only (documented, not enforced).
- **Decision inputs:** three primary-source research passes (2026-07-11) against
  `learn.chatgpt.com/docs/*` (where `developers.openai.com/codex` now redirects), the `openai/codex` Rust
  source at `5c19155`, `code.claude.com/docs` (Claude Code 2.1.207), and the OpenAI/Anthropic pricing pages.
  Every platform claim below is sourced; the ones that could not be confirmed are listed under
  **Unverified** and are not designed against.

## Problem

PHE is "a harness-engineering framework for Claude Code." The operator also uses Codex CLI and the Codex
IDE extension. Today none of the harness transfers: no rules, no hooks, no pipeline, no model policy. The
naive assumption — *"Codex has no hooks/skills/subagents, so only guidance can port"* — **is false as of
2026-07**, and designing around it would throw away the enforcement layer that is PHE's entire thesis
(`docs/02-enforcement-vs-guidance.md`).

Separately, the model policy in `docs/04` is single-vendor and hardcodes model names. OpenAI shipped the
**Sol / Terra / Luna** tiers on 2026-07-09 — two days before this design. Any file that names a model is
already a liability.

## Platform ground truth (verified 2026-07-11)

### What Codex actually has

| Layer | Claude Code | Codex CLI |
|---|---|---|
| Instructions | `CLAUDE.md`, nested, no size cap | `AGENTS.md` — root→cwd walk, one file per dir level, **closer overrides**, **32 KiB combined cap** (`project_doc_max_bytes`) |
| Project config dir | `.claude/` | **`.codex/` exists** — `config.toml`, `hooks.json`, `agents/*.toml`, `rules/*.rules` |
| Hooks | 30+ events | **10 events**, exact names: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop` |
| Hook wire format | stdin JSON (snake_case) → stdout JSON (camelCase); exit 2 = block, reason on stderr | **Identical.** The feature is literally `Feature::CodexHooks` — *"Claude-style lifecycle hooks"* |
| Skills | `.claude/skills/<name>/SKILL.md` | **`.agents/skills/<name>/SKILL.md`** — walks up cwd→repo-root; same open standard; progressive disclosure |
| Skill frontmatter | many keys; **unknown keys silently ignored** | `description` required, `name` optional; **unknown keys silently ignored** (asserted by a passing test, `loads_unrecognized_frontmatter_fields_that_need_quotes`) |
| Subagents | `.claude/agents/*.md` (frontmatter + body) | `.codex/agents/*.toml` (`name`, `description`, `developer_instructions`, `model`, `model_reasoning_effort`); **off by default** — needs `[features] multi_agent = true` |
| MCP | `.mcp.json` | `[mcp_servers.<id>]` in `config.toml`, project scope supported |

### What Codex does NOT have — and what we do about it

| Missing | Consequence | Our answer |
|---|---|---|
| **Project-local slash commands** (`~/.codex/prompts/` only, and OpenAI has **deprecated** prompts in favour of skills) | The PIV+E pipeline cannot ship as commands | **Ship the pipeline as skills.** Claude Code *unified* skills and commands (v2.1.196+): `.claude/skills/plan/SKILL.md` → `/plan`. Codex: `$plan`. **PHE already uses skills.** This is why the port is cheap. |
| **`paths:`-scoped auto-loading rules.** (Codex "rules" = Starlark *exec-policy*, `.codex/rules/*.rules` — unrelated to context) | Domain rules never load | **Backfill it.** New `rules-inject.mjs` PreToolUse hook reads `paths:` frontmatter from `.claude/rules/*.md`, matches the path in `tool_input`, returns `additionalContext`. The harness implements the platform's missing feature. |
| **`$1` / `$ARGUMENTS` substitution in skills** (grepped the whole workspace — does not exist) | `/plan plans/x.md` has no interpolation | Skill bodies take arguments as **natural language** ("the plan file named in the prompt"). Works identically on both harnesses. |
| **`PreToolUse` auto-approve** (`permissionDecision: "allow"` without `updatedInput` is *rejected*; so is `"ask"`) | Cannot widen permissions from a hook | Irrelevant — PHE's guard only ever **denies**. Auto-approval, if ever needed, is `PermissionRequest`'s job. |
| Native `AGENTS.md` reading **in Claude Code** | — | Claude Code officially supports **`@AGENTS.md` import** inside `CLAUDE.md`. No symlink needed (symlinks work but need Admin/Dev Mode on Windows). |
| `.agents/skills/` scanning **in Claude Code** | Skills would have to be duplicated | Emit both dirs from one canonical source; see "Skills". |

### The hook trust gate — the one genuinely hostile constraint

Codex gates project hooks **twice**:

1. **Project trust** — `[projects."<abs-path>"] trust_level = "trusted"` in `~/.codex/config.toml`.
   Untrusted → the entire project `.codex/` layer (config, hooks, rules) is skipped.
2. **Per-hook hash pinning** — every non-managed command hook must be reviewed via `/hooks` before it
   runs. Trust is recorded against a `sha256` of the *normalized handler*, keyed
   `{source_path}:{event}:{group_index}:{handler_index}`.

And, decisively (`config_rules.rs`): hook trust state is only readable from the **User** and
**SessionFlags** layers — *"Project, managed, and plugin layers can discover hooks, but they do not get to
write user hook state."*

> **A repo cannot pre-trust its own hooks. Ever.** And because trust is hash-pinned, **every
> `npx phe update` that touches a hook silently disarms it** (`Modified` → skipped) until the user
> re-approves in `/hooks`.

This is not fixable, only managed. Three mitigations, all of them shipped:

- `npx phe init/update` prints the exact re-trust steps whenever a hook file changes.
- `/harness-init` gains a **"trust the Codex hooks"** step, and `session-start.mjs` warns when the
  installed hook hashes differ from the last-known-trusted set.
- **`global/` matters more on Codex than on Claude:** user-scope hooks (`~/.codex/hooks.json`) sit in the
  User layer and sidestep the *project* trust gate entirely. The guard (secrets, `rm -rf`, protected
  branches) is the natural resident there — it is machine-wide policy, not project policy.

## Architecture: single source, dual emit

One canonical payload. The CLI asks which harness at init and emits per-target **wiring**; **content** is
never duplicated.

```
template/                          # ONE source of truth
  AGENTS.md                        # canonical instructions (today's template/CLAUDE.md)
  .claude/hooks/*.mjs              # canonical hook scripts (+ harness-adapter.mjs)
  .claude/skills/*/SKILL.md        # canonical skills = the PIV+E pipeline
  .claude/agents/*.md              # canonical subagents
  .claude/rules/*.md               # canonical rules (paths: frontmatter)
  .claude/harness.json             # + harness targets, + model tier map

emit(claude):  AGENTS.md · CLAUDE.md (`@AGENTS.md` shim) · .claude/settings.json (hook wiring)
               .claude/{skills,agents,rules,hooks} as-is
emit(codex):   AGENTS.md · .codex/config.toml · .codex/hooks.json (same .mjs, new wiring)
               .agents/skills/ (from .claude/skills/) · .codex/agents/*.toml (from .claude/agents/*.md)
               .claude/{hooks,rules} as-is — Codex reads them through its own wiring
emit(both):    the union; AGENTS.md and every .claude/ asset exist exactly once
```

`.claude/` remains PHE's **canonical asset root** even in a Codex-only install — not out of loyalty, but
because Claude Code hard-codes `.claude/rules/` and `.claude/skills/` discovery, so canonical content must
live there for the Claude target to work at all. Codex reads the same assets through its own wiring
(`hooks.json` points at `.claude/hooks/*.mjs`; `rules-inject.mjs` reads `.claude/rules/`). Documented
plainly in the README so it doesn't read as an accident.

### Instructions

- `template/AGENTS.md` — canonical. Today's `template/CLAUDE.md`, content unchanged. Budget stays **≤60
  lines**.
- `template/CLAUDE.md` — shim: `@AGENTS.md` + a short **Claude-only** section (e.g. "`paths:`-scoped rules
  auto-load natively here").
- Subdirectory context follows the same shape: `AGENTS.md` holds content, a one-line `CLAUDE.md` imports
  it. `template/examples/{frontend,backend}.CLAUDE.md` become `*.AGENTS.md` + shims.
- The **32 KiB cap is combined across the root→cwd walk**, so root + subdir files share one budget. The
  ledger enforces it (below).

### Skills — the portability bridge

- Canonical: `.claude/skills/`. Emitted for Codex as `.agents/skills/`.
- **Sync mechanism is an open item.** Preference: symlink on POSIX (both harnesses follow symlinked skill
  dirs), copy on Windows. *Whether Claude Code follows a **whole-directory** symlink is unverified* — if it
  only resolves per-skill entries, we symlink per skill; if that fails, we copy and `phe update` re-syncs
  with a drift check. **Verify before building.**
- Two body edits per pipeline skill: arguments as natural language, and implicit invocation disabled
  (`disable-model-invocation: true` on Claude; `agents/openai.yaml` → `policy.allow_implicit_invocation:
  false` on Codex) so `/implement` never auto-fires.
- No frontmatter fork: each harness ignores the other's keys. **Caveat:** `allowed-tools` is therefore
  *inert* on Codex — it buys no enforcement there. Anything that must hold on Codex belongs in a hook.

### Enforcement — port all 6 hooks + 1 new

Scripts stay single-sourced `.mjs`; a new `harness-adapter.mjs` normalizes the three real divergences:

| Divergence | Claude | Codex | Adapter |
|---|---|---|---|
| Tool names | `Edit`, `Write`, `MultiEdit`, `Bash` | **`apply_patch`, `Bash`, `spawn_agent`, `mcp__*`** — `Write`/`Edit` are *matcher-only aliases* and are **never serialized** to stdin | Normalize inbound `tool_name` to a canonical set. A script branching on `tool_name === "Edit"` **never fires on Codex** — this is the single most likely silent-failure mode. |
| `Stop` semantics | exit 2 / block → keep working | `decision: "block"` + `reason` → **Codex continues** with `reason` as a continuation prompt; `stop_hook_active` guards the loop. `continue: false` is the true hard stop | Emit the right shape per harness. Semantics already match what the gate wants. |
| Blocking channel | exit 2, reason on **stderr** | identical — and empty stderr on exit 2 is an error | Shared. |

Hooks ported: `guard`, `post-edit`, `stop-gate`, `session-start`, `pre-compact`, `verdict-gate` (Codex has
`SubagentStop`). New: **`rules-inject.mjs`** (backfills `paths:` rules). Wiring emitted twice:
`.claude/settings.json` and `.codex/hooks.json` (`deny_unknown_fields` — the emitter must be exact;
handler `timeout` defaults to **600 s**, so set it explicitly).

`smoke-test.mjs` grows a **second fixture axis**: every existing fixture runs against both the Claude and
the Codex payload shape. The hard rule in `CLAUDE.md` ("hooks change → smoke test") now covers both.

### Subagents

`.claude/agents/*.md` canonical → generate `.codex/agents/*.toml` (markdown body → `developer_instructions`).
`.codex/config.toml` sets `[features] multi_agent = true` and `[agents] max_threads`. Note `max_depth`
defaults to **1**: no nested fan-out on Codex. The dispatch protocol must not assume it.

## Model policy — family-anchored tiers, refreshable map

Model IDs churn (Sol/Terra/Luna are 2 days old). **Nothing but one file may name a model.**

Plans, rules, and dispatches pin a **role**:

| Role | Routes here | Never here | Claude (2026-07-11) | Codex (2026-07-11) |
|---|---|---|---|---|
| `scout` | Bulk reading, file location, retrieval, doc scans, schema extraction | Anything needing a decision the prompt didn't pre-make | `haiku-4-5` | `gpt-5.6-luna` |
| `build` | Implementation against a written spec; mechanical transforms | L/XL judgment work; any review | `sonnet-5` | `gpt-5.6-terra` |
| `deep` | Architecture, planning, hard debugging, L/XL implementation | — | `opus-4-8` | `gpt-5.6-sol` |
| `review` | All reviewers and verifiers | — | `opus-4-8` | `gpt-5.6-sol` |

- The map lives in **`.claude/harness.json` → `models`**, with `checkedAt`. `npx phe update` ships a
  refreshed map; a `/models` check re-verifies against the live catalogs (Codex fetches a remote model
  catalog; Anthropic publishes docs) and **proposes** an update, ask-first; `session-start.mjs` warns when
  `checkedAt` is >30 days old. **Families are the stable abstraction; IDs float to the newest member.**
- **`review` never resolves below `deep`.** Unchanged rule, now enforced by the resolver, not by prose.
- Effort stays a separate axis, pinned explicitly per dispatch (Codex's own default-effort value is
  *contradictory across its docs and its catalog* — never rely on it). Codex adds `max` and **`ultra`**
  (max reasoning **with automatic subagent delegation**); `ultra` is a planner-only lever and Luna lacks it.

### Three cost rules (new, in `docs/04`)

1. **Read-heavy work swaps the MODEL, not the effort.** Effort scales *reasoning* (output) tokens; a scan
   is ~95% input. Sol at `low` still bills **$5**/1M input; Luna at `high` bills **$1**. *Sol-at-low is
   never the correct scout.* (This is exactly the operator's ask, stated as policy.)
2. **Keep any single request under 272 K input tokens.** Past that line Codex bills **2× input and 1.5×
   output on the entire request**, not the overage — and the CLI budgets a **372 K** window, so the cliff is
   reachable. `/handoff` and subagent fan-out exist to stay under it.
3. **Do not compare headline $/token across vendors.** Anthropic's newer tokenizer (Opus 4.7+, Sonnet 5,
   Fable 5) emits **~30 % more tokens for the same text**, so naive comparison understates its real cost.

Verified pricing per 1M (in / cached-in / out): `sol` $5/$0.50/$30 · `terra` $2.50/$0.25/$15 ·
`luna` $1/$0.10/$6 · `opus-4-8` $5/$0.50/$25 · `sonnet-5` $2/$0.20/$10 (intro, → $3/$15 after
2026-08-31) · `haiku-4-5` $1/$0.10/$5.

## Init / CLI UX

`npx perfect-harness-engineering init` asks **"Which harness — Claude Code, Codex, or both?"** and records
the answer in `harness.json` (`"harness": ["claude","codex"]`) so `update` stays non-interactive and
idempotent. When Codex is selected it additionally:

- offers to write `[projects."<abs-path>"] trust_level = "trusted"` into `~/.codex/config.toml` (**project
  hooks do not load at all without it**) — ask-first; never write a user-global file silently;
- prints the `/hooks` trust steps, and repeats them on any `update` that changed a hook.

`/harness-init` becomes harness-aware: it fills `AGENTS.md` placeholders, arms the gate, and adds the
Codex trust step.

## Also in scope

- **`loop/loop.mjs`** — `--harness codex` drives `codex exec` (the documented non-interactive entry point)
  instead of `claude -p`. Same PROMPT template, same on-disk state.
- **`tools/context-ledger.mjs`** — add a byte budget for `AGENTS.md` (**32 KiB summed across the root→cwd
  walk**, not per file) alongside the existing line budgets; report the Codex 372 K window and flag the
  272 K cliff.
- **`global/`** — an opt-in `~/.codex/` hardening layer mirroring `~/.claude`. Elevated importance: user-
  scope hooks bypass the project trust gate.
- **`docs/00–06, 99`** — harness-neutral rewrite. `docs/02` gains a per-platform enforcement table;
  `docs/04` becomes the role/tier table + the three cost rules; `docs/99` gains the 2026-07-11 sources.
- **README / repo identity** — PHE stops being "for Claude Code" and becomes harness engineering for
  Claude Code **and** Codex.

## Phasing (each phase is its own plan, and ships standing alone)

1. **Dual-emit core.** `AGENTS.md` becomes canonical + `CLAUDE.md` shim; the CLI's harness question →
   `harness.json`; the emitter (skills → `.agents/skills/`, agents → `.codex/agents/*.toml`,
   `.codex/config.toml`); pipeline skill bodies lose their `$ARGUMENTS` dependence. **Ends with a working
   guidance-only Codex harness** — useful on its own, and it is also the cloud story.
2. **Enforcement.** `harness-adapter.mjs`; `.codex/hooks.json` wiring for the 6 hooks; new
   `rules-inject.mjs`; smoke-test's second fixture axis; the trust-gate UX (init/update messaging,
   `/harness-init` step, session-start hash warning).
3. **Model policy.** Role/tier vocabulary in plans + dispatch protocol; the `models` map in `harness.json`
   + resolver (`review` never below `deep`); `/models` refresh check; staleness warning; `docs/04` rewrite
   with the three cost rules.
4. **Periphery.** `loop.mjs --harness codex`; ledger budgets; `global/` `~/.codex` layer; harness-neutral
   `docs/00–06`, `docs/99` sources; README/identity; vault write-back.

Phase 1 is a prerequisite for 2 and 3. Phases 2, 3, and 4 are independent of each other.

## Vault write-back (Index Law)

On completion, record in `~/Dev/The Vault/projects/perfectHarnessEngineering/`:
**ADR-011** — multi-harness single-source/dual-emit; **ADR-012** — family-anchored model tiers with a
refreshable map (supersedes the hardcoded routing matrix in ADR-005's orbit); **ADR-013** — hook trust gate
accepted as an unavoidable tax, mitigated by `global/` user-scope hooks. Update `architecture.md`,
`decisions.md`, and the project `_index.md` in the same change. The Sol/Terra/Luna tier facts + the three
cost rules generalize → `agent-kb/models/`.

## Testing / verification

- `node template/.claude/hooks/smoke-test.mjs` green on **both** payload shapes; a new fixture per new
  behaviour (adapter tool-name normalization; `rules-inject` match/miss; Codex `Stop` continuation shape).
- `node tools/context-ledger.mjs template` — always-loaded context still **< 2000 tokens**; `AGENTS.md`
  walk **< 32 KiB**.
- CLI tests extend to the emitter: init(claude) / init(codex) / init(both) produce the expected trees;
  re-running is idempotent; existing files still back up as `.backup`.
- **Manual, on a scratch repo:** `init` with `codex`; confirm `$plan` is offered, `/hooks` lists PHE's
  hooks as untrusted, trusting them arms the guard (a `rm -rf` attempt is denied), the stop gate blocks a
  red turn, and a `paths:`-matched rule shows up as injected context.

## Out of scope (YAGNI)

- Codex **cloud/app** enforcement — whether hooks fire there is undocumented; assume not. Cloud gets
  `AGENTS.md` + skills (guidance-only), which is all its surface accepts anyway (it can't even change model).
- Porting Codex's Starlark `.codex/rules/*.rules` exec-policy — PHE's guard hook already covers that ground.
- A generator/build step for `CLAUDE.md`/`AGENTS.md` (rejected: hand-editing the live file must stay correct).
- Gemini / Cursor / any third harness. The dual-emit seam makes it possible later; adding it now is
  speculation.

## Unverified — do not design against these

- Whether Claude Code follows a **whole-directory** symlink for a skills dir (affects the `.agents/skills`
  sync mechanism — verify first, fall back to copy + drift check).
- Whether hooks fire in **Codex cloud** tasks (no doc statement, no conclusive source).
- Whether the Codex **IDE extension** exposes any hook-trust approval UI, or whether first-run trust always
  requires dropping to the CLI. (Hooks *do* run there — openai/codex#17930, closed by an OpenAI
  contributor: *"The IDE Extension and App are built on the CLI… The hooks features are already supported."*)
- Codex's **default reasoning effort** for Sol — the docs say `medium`, the shipping catalog says `low`.
  Pin effort explicitly; never inherit.
- The interior shape of Codex's `tool_input` per tool (schema'd as `any`). **Dump a live payload before
  writing matchers against its fields.**
