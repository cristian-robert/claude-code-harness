---
name: handoff
description: "Write a session handoff artifact so work resumes in a fresh window with zero context loss."
disable-model-invocation: true
argument-hint: "[slug]"
---

# /handoff — reset beats compaction

Write `reports/<slug>-handoff.md` (slug from the invocation argument; none given → derive from the branch name), then stop. No code changes in this stage.

## The artifact

| Section | Contents |
|---|---|
| Goal | One paragraph: what this work ships and why; the plan/ticket path |
| State | Branch, dirty files (`git status --porcelain`), last stop-gate verdict |
| Done so far | Bullets, each with evidence — the command run and its real output summary |
| Next steps | Ordered; the FIRST step exact (file, command, expected result), later steps may be coarser |
| Open questions / blockers | Exact error text, what was ruled out, current hypothesis |
| Knowledge to reload | Knowledge skills to invoke (`architecture-map`, `debugging-this-repo`, …) + files the next session must read (plan, scoped rules, key sources) |

Rules:

- Evidence over recollection — re-run the check (`git status`, gate command) rather than assert from conversation memory.
- **No-prior-knowledge test (mandatory):** an agent that never saw this conversation must resume from the artifact alone. Reread it as that agent before finishing; fix what fails.
- Team-durable lessons go through `/evolve` — the handoff is task state, not the harness.

## Hand over

Tell the user verbatim:

> /clear then start the new session with: read reports/<slug>-handoff.md and continue.

## Output contract

Artifact to disk; no terminal recap of its contents. End with exactly one line:

`Handed off <slug> · Next: /clear`

Blockers replace that line.
