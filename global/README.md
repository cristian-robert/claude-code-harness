# Global layer — opt-in ~/.claude hardening

Deterministic guardrails for EVERY project on this machine, harnessed or not. The current `~/.claude` has zero hooks and a maximally-open permission posture; this layer is the recommended hardening. Nothing here auto-applies — install by hand.

## What it adds

| Piece | Effect in every session |
|---|---|
| `guard.mjs` (PreToolUse) | Denies secret-file access (`.env*`, keys), recursive deletes, commit/push on `main`/`master` — even under `--dangerously-skip-permissions` |
| `stop-gate.mjs` (Stop) | Runs the project's `.claude/harness.json` gate before a turn may end |

Scopes stack: project-level hooks still apply on top — user and project hooks both fire for the same event, and any deny wins. A harnessed repo gets both layers; an unharnessed repo still gets the global guard.

## Install

1. Copy the hooks (self-contained, no npm deps):

   ```sh
   mkdir -p ~/.claude/hooks
   cp template/.claude/hooks/{guard.mjs,stop-gate.mjs,smoke-test.mjs} ~/.claude/hooks/
   ```

2. Merge `settings-hooks.snippet.json` into `~/.claude/settings.json` under the `hooks` key — do not replace the file. Read the snippet's `$comment`: `${CLAUDE_PROJECT_DIR}` is wrong for user-scope hooks; use the home path.
3. Verify — both, not either:
   - `node ~/.claude/hooks/smoke-test.mjs` → all fixtures green.
   - In any repo, ask Claude to `cat .env` → must be denied with the guard's reason.

## Rollback

Remove the `hooks` key (or just these two entries) from `~/.claude/settings.json`; optionally delete `~/.claude/hooks/*.mjs`. Takes effect next session.

## Cautions

- A buggy global hook degrades every session on the machine. That is why the hooks fail OPEN on internal errors and why `smoke-test.mjs` exists — run it after ANY edit to `~/.claude/hooks/`.
- The global stop-gate is inert unless the current project has `.claude/harness.json`. By design: no config, no gate, no surprise blocks in casual repos.
- On a repo that ALSO ships PHE's project hooks, both layers fire — the guard and the `stopGate` set run TWICE per turn end (both read the same `harness.json`), with mismatched Stop timeouts (global 180s vs project 90s). Idempotent, but wasted latency: on a fully-harnessed repo, prefer the project hooks alone (the global layer is for the *unharnessed* repos on your machine).
- Do NOT put project-specific rules globally (branch schemes, lint commands, stack conventions). Global = universal invariants only; everything else lives in the repo's `.claude/`.

## Recommended next (once the guards are proven)

- Tighten `permissions.defaultMode` away from the maximally-open posture — the guard catches catastrophic cases, not everything.
- Move plaintext API keys out of `settings.json` `env` into a secret manager or an `apiKeyHelper` script.
- Keep the global `CLAUDE.md` skill table — it is advisory guidance; this layer is the deterministic enforcement that complements it.
