---
name: harness-init
description: "One-time setup interview: detect the stack, fill AGENTS.md, arm the gate — zero placeholders left."
disable-model-invocation: true
---

# /harness-init — fit the copied template to THIS project

Run once, right after copying the template in. Goal: zero `<placeholder>` left, stop gate armed, hooks proven, and — if you adopted over an existing harness — your prior config folded back in. Adapt files in place — smallest diffs, never rewrite from scratch.

## 0 · RECONCILE (only when adopting over an existing harness)

Skip entirely if `.claude/.init-meta.json` is absent — fresh project, nothing to reconcile.

`settings.json` is already merged: `init`/`update` deep-union your prior hooks + permissions with the framework's. You reconcile only the PROSE the CLI backed up but can't merge by rule — `AGENTS.md` and `.claude/rules/*.md` (never `CLAUDE.md` — see below). For each `backedUpFiles` entry that is one of those AND has a live PHE counterpart, three-way merge `<file>.backup` (your prior content) INTO the freshly-installed `<file>` (PHE's structure):

A pre-PHE project's `CLAUDE.md.backup` reconciles INTO `AGENTS.md` — that is where project content now lives. The installed `CLAUDE.md` is a generated shim; never merge user content into it.

- Carry the user's substance into PHE's shape: product one-liner, Commands rows, every incident-traced Convention/rule, protected-dir and live-infra rules.
- On a shared discipline, PHE's wording wins; keep the user's traceable specifics.
- Smallest diffs; never rewrite. A backed-up file PHE does NOT ship already survived untouched (no collision) — leave it.

After merging, audit the unioned `settings.json` and RECORD the findings in `reports/harness-init.md` (see Output contract — the terminal stays quiet):

- Any merged hook whose target script is missing — a stale hook from the old harness. Recommend pruning.
- The unioned `permissions.allow`, verbatim, for the user's review.
- **What each merged `SessionStart`/`UserPromptSubmit` hook costs.** The union adopts prior hooks without weighing them; a hook that `cat`s a progress file spends its whole size on every session before the user types anything. Measure it: `echo '{}' | node <hook-script> | wc -c`. Report bytes per hook (÷4 ≈ tokens); over ~4 KB, flag it against `00-core.md`'s context-economy rule and recommend pruning.

Keep every `.backup` until the user confirms, then offer to delete them.

## 1 · DETECT (read first, ask second, write nothing yet)

| Look at | Derive |
|---|---|
| `package.json` scripts / `pyproject.toml` / `Makefile` | Candidate Commands rows (dev / test / lint / typecheck) |
| Lockfiles (`pnpm-lock.yaml`, `uv.lock`, …) | Package manager — the command prefix, AND a dependency-audit Commands row (`npm audit` / `pip-audit` / `uv pip audit`) for the security lens |
| Top-level src dirs (`src/`, `app/`, `backend/`, `frontend/`, …) | Backend/frontend dirs (or "none"); candidate rule `paths:` scopes |
| CI config (`.github/workflows/`, …) | Checks CI already runs → candidate stopGate entries (cheap only, <30s each). Any `runs-on: self-hosted` → set `selfHostedRunner: true` in step 3 and expect the step-4 gap row to matter |

Propose from this: the Commands table, 1–2 stopGate candidates, and rule `paths:` scopes.

## 2 · INTERVIEW — ONE batched AskUserQuestion round

Ask ONLY what detection cannot know, all in one round:

1. Product one-liner — who uses it, for what.
2. Confirm/correct the detected commands (dev / test / lint / typecheck).
3. Protected dirs or live-infra commands needing an ASK-first rule (e.g. "tests hit the staging DB").
4. Known past incidents worth a rule — the ratchet: no incident, no rule.
5. Knowledge: `knowledge-base/` is created either way — no question. Read `.claude/harness.json` `knowledge.shared` (recorded at `init`): `existing` → confirm the path; `none` → confirm no shared store, or offer to add one now. (No `knowledge` key — a pre-knowledge install — → ask: shared vault path / skip.)
6. Docs: add the context7 MCP to `.mcp.json` for live doc-fetch in `/research`? (default yes; it needs `npx`.)
7. Work tracking — one set: backend `none` / `files` / `GitHub issues`? Method Kanban (default) / Scrum? Kanban only: WIP limit (default 3)?
8. `.github/workflows/` exists → run CI locally in Docker via `act` (`/ci-local`)? Default yes; it edits no workflow file. Skip the question entirely when the repo has no workflows.

## 3 · GENERATE (smallest diffs; adapt in place)

- `AGENTS.md`: fill EVERY `<placeholder>`; delete rows/sections that don't apply — a placeholder in a live AGENTS.md is a bug.
- `.claude/harness.json`: write `stopGate` — the 1–2 cheapest deterministic checks confirmed in step 2 (<30s each; the expensive full gate stays in `/validate`). **Run each candidate ONCE before arming it.** A command that is already red must NOT be armed: the gate then blocks every turn end from the install commit onward. Red candidate → leave `stopGate: []`, record the failing command + its output in `reports/harness-init.md`, and tell the user to fix it and re-run. Never arm a gate you have not seen exit 0.
  - Repo-wide `eslint .` (or equivalent) is the usual trap: the harness's own `.claude/**/*.mjs` are Node ESM, so a bare `js.configs.recommended` reports `no-undef` on `process`/`console`/`Buffer` in files the product's linter has no business checking. Before arming `lint`, wire `.claude/tooling/eslint.harness.mjs` into the root `eslint.config.js` (or add `{ ignores: [".claude/**"] }`), then confirm `eslint .` is green.
- Question 8 yes → `.claude/harness.json` `localCi: true`; report whether `act` is on PATH (absent → record the install hint in the report; NEVER install it, and never make it a blocker). Never edit `runs-on:` to enable local runs — `.claude/references/local-ci.md` section 1.
- `.claude/rules/frontend.md` + `backend.md`: fix `paths:` to the real dirs (key is `paths:`, NEVER `globs:`) — or DELETE the file if the stack lacks that side.
- Incidents from question 4 → rule/Conventions lines, each ending `traces to: <incident>`.
- `examples/`: copy `frontend.AGENTS.md` / `backend.AGENTS.md` (as `<dir>/AGENTS.md`) into real subdirs only where a dir has local traps — and, when Claude Code is a target, also copy the matching `frontend.CLAUDE.md` / `backend.CLAUDE.md` (as `<dir>/CLAUDE.md`, the one-line `@AGENTS.md` shim). Delete `examples/` if unused. `guard.mjs` denies `rm -rf`/`find -delete`/`git clean -d` — remove each file explicitly, then `rmdir` the empty dir. Same for every prune below.
- Symbol navigation: `.lsp.json` → keep only language servers whose binary is installed (`command -v typescript-language-server`, `pyright-langserver`, …), delete the rest; `.mcp.json` codebase-search → keep if the repo has Python AND `uv` is on PATH, else delete it (it is Python-AST-only). Tell the user which are active.
  - Deleting the MCP orphans its references — prune them in the same pass, or the agent is told to call a server that is not there: delete `.claude/tooling/codebase_search.py` (that FILE only — `.claude/tooling/` also holds `eslint.harness.mjs`, keep the dir); drop the `codebase-search` row from `.claude/references/dispatch-protocol.md`; in `.claude/agents/code-reviewer.md` and `AGENTS.md`, cut the MCP clause and leave the grep fallback.
- `.gitignore`: add `.claude/state/` + `.worktrees/` + `knowledge-base/.obsidian/` — runtime state, /implement's in-repo worktrees, and the operator's Obsidian workspace never commit (spec decision 24: no `.obsidian/` ships; the operator opens the folder).
- Knowledge: copy `.claude/references/knowledge-base-scaffold/` to `./knowledge-base/` (ALWAYS — it is git-tracked project content, not a payload file), then FILL it from detection + interview: EVERY `<placeholder>` in EVERY file — `_index.md` and each file's frontmatter `project:` + `# heading` pair included — deleting rows/sections that don't apply. Step 4's gate greps the WHOLE directory, so one survivor ends the init red, and `kb-check` will not catch it: its placeholder test is byte-identity against the scaffold, so a comment-stripped KB passes with every `<…>` intact. Richest sections: `architecture.md` (stack, module table, where-new-code-goes, `## Boundaries`, integration points), `runbook.md` (logs, repro recipes, failure classes from question 4), `resources.md` (links, infra, credential POINTERS only), `decisions.md` (any incident that was really a decision). Delete the `<!-- … -->` guidance comments. Verify with `npx perfect-harness-engineering kb-check` AND step 4's placeholder gate — neither covers the other. Shared store `existing` (from `harness.json` `knowledge.shared`) → it keeps `wiki/` + `agent-kb/` only; ensure both exist there, copying `.claude/references/vault-scaffold/` if the path is empty. `none` → local only; say so. Index Law already holds in both scaffolds.
- context7 (from question 6): yes → add `"context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }` to `.mcp.json` `mcpServers`. No → leave `.mcp.json` as-is (codebase-search only).
- Work tracking from question 7 (backend `none`: skip all of this):
  - `.claude/harness.json`: set `workTracking` — `backend` + `method` (+ `wipLimit` in kanban).
  - Create `backlog/` with a `.gitkeep`; scrum also creates `sprints/` with a `.gitkeep`. **Check the branch first** (`git branch --show-current`): these are the tracking root and must be committed on the base branch (`main`/`master`, or `baseBranch` from `harness.json`), never inside a code branch — that is the whole point of `.claude/references/work-tracking.md`'s tracking-root rule, and `guard.mjs` permits `track(<id>)` commits on base for exactly this. On a feature branch → STOP, tell the user to create them on base and re-run this step. (Running `/harness-init` from a feature branch is normal — the harness forbids committing code on base — so this check will fire often.)
  - `github` backend: `gh auth status` AND a resolvable GitHub remote must both succeed, then run the Label bootstrap block from `.claude/references/work-tracking.md` VERBATIM (type:* + status:backlog..done + priority:P0..P2 — no status:accepted label; closed = accepted; idempotent, `-f` tolerates existing). ANY other failure (no gh, no auth, no remote, network) → set `backend: files` instead and tell the user why.

## 4 · VERIFY (evidence, not claims — every output goes into `reports/harness-init.md`)

| Check | Must show |
|---|---|
| `node .claude/hooks/smoke-test.mjs` | Green — record the real output |
| `npx perfect-harness-engineering file-size-check` | Total vs budget — record the real output |
| `grep -rnoE '<[A-Za-z][^<>]*>' AGENTS.md .claude/rules/ knowledge-base/ \| grep -vE '<(a\|n\|id\|div\|slug\|tool\|button\|dialog)>$' \|\| true` | Prints NOTHING. This is the placeholder GRAMMAR — any `<…>` token — minus the allowlist of things that legitimately survive: path notation (`backlog/<id>-<slug>.md`, `sprints/<n>.md`, `wiki/stack/<tool>/`) and the real HTML tags in `rules/frontend.md`. `knowledge-base/` is in scope because the KB now holds the content the two knowledge skills used to; the skills themselves are out because their remaining `<…>` tokens are notation, not fill slots. Do not narrow it back to an enumeration of known names. If your rules cite other HTML tags (`<input>`, `<nav>`, …), add them to the allowlist — never to the pattern |
| `grep -n "workTracking" .claude/harness.json` | Prints the line with the chosen backend + method |
| `bash .claude/tooling/self-hosted-runner/status-runner.sh` | `N workflows require self-hosted · M runners online`. **Gap report, NEVER a blocker** — no runner is the normal, healthy state and `0 · 0` is a pass. Record the line; only when N>0 AND M=0 also record that those jobs queue forever (never fail) and point at `/runner status` |
| `ls ~/.claude/agents/architect-agent/AGENT.md ~/.claude/agents/tester-agent/AGENT.md 2>&1` | Presence check — see the notice below |
| each armed `stopGate` command | Exit 0 — the evidence for step 3's arming rule |

Any red → fix and re-run before finishing. Setup without a green smoke test is not done.

**Global-agent notice:** if `~/.claude/agents/architect-agent` or `tester-agent` is absent, record in the report — "Two roles ship degraded: Architect KB retrieval falls back to reading `knowledge-base/architecture.md` directly; browser-UI QA is manual/UNVERIFIABLE. Install the global agents to enable them." So the operator knows before the pipeline, not mid-run.

**Codex target?** Codex only loads a project's `.codex/` layer when the project is TRUSTED. Tell the user to run `codex` in this directory once and accept the trust prompt, or to add `[projects."<abs-path>"] trust_level = "trusted"` to `~/.codex/config.toml`. Until then `.codex/config.toml` and `.codex/agents/` are ignored entirely.

**Codex customizations?** `.agents/`/`.codex/` were generated at install time, before this step's edits — run `npx perfect-harness-engineering emit` now to push this step's canonical-source edits — chiefly the `.claude/agents/*.md` MCP-clause prune, since `.codex/agents/*.toml` is generated from those files. `AGENTS.md` and `knowledge-base/` need no emit: Codex reads both in place.

## Output contract

Everything the operator must review — the step-0 reconcile audit (stale hooks, unioned `permissions.allow`, SessionStart injection cost), the step-4 verification outputs, the degraded-roles notice, any gate candidate that came back red — is WRITTEN to `reports/harness-init.md`, not narrated. The one interactive surface is step 2's single `AskUserQuestion` round plus the step-0 offer to delete the `.backup` files.

The terminal then gets exactly one line:

`Initialized harness · Next: <command>` — workTracking backend ≠ none → `/backlog new <first item>`; backend none → `/plan-work <first ticket>`. Append ` · Report: reports/harness-init.md`.

Blockers replace that line.
