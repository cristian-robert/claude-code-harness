@AGENTS.md

# Claude Code notes

`AGENTS.md` above is the canonical contract for this repo and is shared with Codex. This file exists because Claude Code reads `CLAUDE.md`, not `AGENTS.md` — it imports it.

- `.claude/rules/*.md` with a `paths:` key auto-load when a matching file is read.
- Skills in `.claude/skills/` are invocable as `/<name>`; they are synced copies of `template/.claude/skills/`.

Project-specific instructions belong in `AGENTS.md`, not here.
