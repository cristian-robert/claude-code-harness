---
name: debugging-this-repo
description: "Project-specific debugging: where logs live, how to reproduce locally, known failure classes and their fixes. Consult BEFORE diagnosing any bug or test failure."
user-invocable: false
---

# Debugging this repo — the facts

`superpowers:systematic-debugging` owns the METHOD (reproduce → isolate → root-cause). THIS skill holds the REPO FACTS that method consults first. Never fix without reproducing.

<!-- filled by /harness-init: replace every <placeholder> from detection + interview.
     /evolve appends new failure classes (each traces to a real debugging session).
     Keep the file ≤70 lines; oldest-resolved entries prune first. -->

## Vault (second brain) — RETRIEVE then CAPTURE

- BEFORE diagnosing: search the vault per `.claude/references/vault-protocol.md` — `projects/<name>/runbook.md` + failure classes (`obsidian search:context query="<error text>" path=projects/<name>` → fallback file reads). A prior incident match short-circuits hours.
- AFTER systematic-debugging confirms a root cause: auto-append it to `projects/<name>/runbook.md` known-failure classes (symptom → cause → fix → incident) AND to the table below. Auto-write stops there — wiki/ promotion is /evolve's ask-first call.

## Logs & observability

| Source | Where | Read with |
|---|---|---|
| Dev server | `<path or stdout>` | `<cmd>` |
| Test output | `<path>` | `<cmd, e.g. runner verbose flag>` |
| Deployed app/service | `<dashboard or URL>` | `<cmd or link>` |

## Repro recipes

- One failing test in isolation: `<cmd, e.g. runner -t "<name>">`
- Full local stack: `<cmd>` — requires `<service, e.g. local Postgres>` running first.
- `<hard-to-repro class, e.g. webhook delivery>`: `<exact recipe>`

## Known failure classes

Each row: symptom (grep-able) → cause → fix → traces to its incident.

| Symptom | Cause | Fix | Traces to |
|---|---|---|---|
| `<exact error text>` | `<root cause>` | `<verified fix cmd/change>` | `<incident>` |
| `ECONNREFUSED 127.0.0.1:<port>` | Local `<service>` not running | `<start cmd>` — tests do NOT auto-start it | `<incident>` |
| CI green, local red on `<test>` | `<e.g. order dependency via shared fixture>` | `<isolated-run cmd>`; fix the fixture, not the test | `<incident>` |

## What to check before blaming the framework

1. `<env-var>` set? Unset silently hits `<wrong target, e.g. staging>` — check FIRST when data looks wrong.
2. Toolchain versions match `<version file, e.g. .nvmrc>`?
3. Stale build/cache: `<clean cmd>`.

Not covered: no flaky-test quarantine list exists — a red test is real until proven otherwise.
