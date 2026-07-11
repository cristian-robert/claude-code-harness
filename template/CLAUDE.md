@AGENTS.md

# Claude Code notes

`AGENTS.md` above is the canonical harness contract and is shared with Codex.
This file exists because Claude Code reads `CLAUDE.md`, not `AGENTS.md` — it imports it.

Claude-Code-only behaviour (Codex gets the same rules through `.claude/hooks/rules-inject.mjs`):

- `.claude/rules/*.md` with a `paths:` key auto-load when a matching file is read.
- Skills in `.claude/skills/` are invocable as `/<name>`; on Codex they are `$<name>` from `.agents/skills/`.

Project-specific instructions belong in `AGENTS.md`, not here.
