---
name: debugging-this-repo
description: "Project-specific debugging: where logs live, how to reproduce locally, known failure classes and their fixes. Consult BEFORE diagnosing any bug or test failure."
user-invocable: false
---

# Debugging this repo — a pointer, not the facts

`superpowers:systematic-debugging` owns the METHOD (reproduce → isolate → root-cause). The FACTS
live in `knowledge-base/runbook.md`: logs, repro recipes, known failure classes. Never fix without
reproducing.

## RETRIEVE then CAPTURE (`.claude/references/knowledge-protocol.md`)

- BEFORE diagnosing: read `knowledge-base/_index.md` → `knowledge-base/runbook.md`, and grep it
  for the `<exact error text>`. A prior incident match short-circuits hours. File absent → say
  `no knowledge-base/runbook.md — diagnosing from the codebase`, then continue.
- AFTER systematic-debugging confirms a `<root cause>`: append a row to that file's Known failure
  classes (symptom → cause → fix → `<incident>`) and update `knowledge-base/_index.md` in the SAME
  change (Index Law). Generalizing past this repo is `/evolve`'s ask-first promotion, never an
  auto-write, and the promotion MOVES the fact — it never leaves a copy behind.

## Before blaming the framework

1. `<env-var>` set? Unset silently hits the wrong target — check FIRST when data looks wrong.
2. Toolchain versions match the repo's pinned version file?
3. Stale build or cache — the clean command is in `knowledge-base/runbook.md`.

Not covered: no flaky-test quarantine list exists — a red test is real until proven otherwise.
