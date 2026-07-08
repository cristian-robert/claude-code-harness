---
name: harness-init
description: "One-time setup interview: detect the stack, fill CLAUDE.md, arm the gate — zero placeholders left."
disable-model-invocation: true
---

# /harness-init — fit the copied template to THIS project

Run once, right after copying the template in. Goal: zero `<placeholder>` left, stop gate armed, hooks proven. Adapt files in place — smallest diffs, never rewrite from scratch.

## 1 · DETECT (read first, ask second, write nothing yet)

| Look at | Derive |
|---|---|
| `package.json` scripts / `pyproject.toml` / `Makefile` | Candidate Commands rows (dev / test / lint / typecheck) |
| Lockfiles (`pnpm-lock.yaml`, `uv.lock`, …) | Package manager — the command prefix, AND a dependency-audit Commands row (`npm audit` / `pip-audit` / `uv pip audit`) for the security lens |
| Top-level src dirs (`src/`, `app/`, `backend/`, `frontend/`, …) | Backend/frontend dirs (or "none"); candidate rule `paths:` scopes |
| CI config (`.github/workflows/`, …) | Checks CI already runs → candidate stopGate entries (cheap only, <30s each) |

Propose from this: the Commands table, 1–2 stopGate candidates, and rule `paths:` scopes.

## 2 · INTERVIEW — ONE batched AskUserQuestion round

Ask ONLY what detection cannot know, all in one round:

1. Product one-liner — who uses it, for what.
2. Confirm/correct the detected commands (dev / test / lint / typecheck).
3. Protected dirs or live-infra commands needing an ASK-first rule (e.g. "tests hit the staging DB").
4. Known past incidents worth a rule — the ratchet: no incident, no rule.
5. Vault: detect one (a pasted pointer block, or ask for its path). None + wanted → offer to scaffold a fresh vault from `.claude/references/vault-scaffold/` at a path they choose. Existing → just wire the pointer block. Or skip vault wiring entirely.
6. Docs: add the context7 MCP to `.mcp.json` for live doc-fetch in `/research`? (default yes; it needs `npx`.)
7. Work tracking — one set: backend `none` / `files` / `GitHub issues`? Method Kanban (default) / Scrum? Kanban only: WIP limit (default 3)?

## 3 · GENERATE (smallest diffs; adapt in place)

- `CLAUDE.md`: fill EVERY `<placeholder>`; delete rows/sections that don't apply — a placeholder in a live CLAUDE.md is a bug. Knowledge skills: fill their template sections from detection and DELETE the `filled by /harness-init` comment markers.
- `.claude/harness.json`: write `stopGate` — the 1–2 cheapest deterministic checks confirmed in step 2 (<30s each; the expensive full gate stays in `/validate`).
- `.claude/rules/frontend.md` + `backend.md`: fix `paths:` to the real dirs (key is `paths:`, NEVER `globs:`) — or DELETE the file if the stack lacks that side.
- Incidents from question 4 → rule/Conventions lines, each ending `traces to: <incident>`.
- Knowledge skills: fill the TEMPLATE sections of `.claude/skills/architecture-map/SKILL.md` (module table, where new code goes, boundaries) and `.claude/skills/debugging-this-repo/SKILL.md` (logs, repro recipes, failure classes from question 4) from detection.
- `examples/`: copy `frontend.CLAUDE.md` / `backend.CLAUDE.md` into real subdirs only where a dir has local traps; delete `examples/` if unused.
- Symbol navigation: `.lsp.json` → keep only language servers whose binary is installed (`command -v typescript-language-server`, `pyright-langserver`, …), delete the rest; `.mcp.json` codebase-search → keep if the repo has Python AND `uv` is on PATH, else delete it (it is Python-AST-only). Tell the user which are active.
- `.gitignore`: add `.claude/state/` — runtime state (compact snapshots, gate verdicts) never commits.
- Vault (from question 5): scaffold chosen → copy `.claude/references/vault-scaffold/` to the target path, then in that copy's `system/pointer-block.md` replace `<ABSOLUTE_VAULT_PATH>` with the target's absolute path; paste that pointer block's fenced content into the repo `CLAUDE.md` (the marked slot), filling `<project-name>`. Existing vault → just paste + fill its pointer block. Index Law already holds in the scaffold. Skipped → leave the `CLAUDE.md` vault comment as-is.
- context7 (from question 6): yes → add `"context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }` to `.mcp.json` `mcpServers`. No → leave `.mcp.json` as-is (codebase-search only).
- Work tracking from question 7 (backend `none`: skip all of this):
  - `.claude/harness.json`: set `workTracking` — `backend` + `method` (+ `wipLimit` in kanban).
  - Create `backlog/` with a `.gitkeep`; scrum also creates `sprints/` with a `.gitkeep`.
  - `github` backend: `gh auth status` AND a resolvable GitHub remote must both succeed, then run the Label bootstrap block from `.claude/references/work-tracking.md` VERBATIM (type:* + status:backlog..done + priority:P0..P2 — no status:accepted label; closed = accepted; idempotent, `-f` tolerates existing). ANY other failure (no gh, no auth, no remote, network) → set `backend: files` instead and tell the user why.

## 4 · VERIFY (evidence, not claims — show all three outputs)

| Check | Must show |
|---|---|
| `node .claude/hooks/smoke-test.mjs` | Green — paste the real output |
| `node <PHE>/tools/context-ledger.mjs .` (path to your PHE checkout) | Total vs budget — paste the real output |
| `grep -rnE "<(placeholder|cmd|Project Name|backend-dir|frontend-dir|One sentence|Rule |Non-obvious|Env/)" CLAUDE.md .claude/rules/ .claude/skills/architecture-map/ .claude/skills/debugging-this-repo/ \|\| true` | Prints NOTHING — the template's whole placeholder grammar, not just the literal `<placeholder>` (other skills legitimately contain these strings) |
| `grep -n "workTracking" .claude/harness.json` | Prints the line with the chosen backend + method |
| `ls ~/.claude/agents/architect-agent/AGENT.md ~/.claude/agents/tester-agent/AGENT.md 2>&1` | Presence check — see the notice below |

Any red → fix and re-run before finishing. Setup without a green smoke test is not done.

**Global-agent notice:** if `~/.claude/agents/architect-agent` or `tester-agent` is absent, print one line at setup end — "Two roles ship degraded: Architect KB retrieval falls back to the architecture-map skill; browser-UI QA is manual/UNVERIFIABLE. Install the global agents to enable them." So the operator knows before the pipeline, not mid-run.

## Output contract

Changes go to disk; no terminal recap of file contents. End with exactly one line:

`Initialized harness · Next: <command>` — workTracking backend ≠ none → `/backlog new <first item>`; backend none → `/plan <first ticket>`.

Blockers replace that line.
