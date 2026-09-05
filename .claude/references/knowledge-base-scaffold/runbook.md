---
type: note
project: <Project Name>
updated: YYYY-MM-DD
tags:
  - runbook
---

# Runbook — <Project Name>

How to run, deploy and operate the product, plus the failure classes this repo has actually hit.
`debugging-this-repo` reads this BEFORE diagnosing; `/validate` hands it to `qa-evaluator` as the
how-to-drive reference.

## Setup · run · test · deploy

| Step | Command | Requires first |
|---|---|---|
| Setup | `<cmd>` | <prereq> |
| Run | `<cmd>` | <prereq> |
| Test | `<cmd>` | <prereq> |
| Deploy | `<cmd>` | <prereq> |

## Logs & observability

Where to look BEFORE reproducing — a log line is cheaper than a repro.

| Source | Where | Read with |
|---|---|---|
| Local run | `<path or stdout>` | `<cmd>` |
| Test output | `<path>` | `<cmd>` |
| Deployed | `<dashboard or URL>` | `<cmd or link>` |

Raise verbosity: `<flag or env-var>`.

## Repro recipes

- One failing test in isolation: `<cmd>`
- Full local stack: `<cmd>` — requires `<service>` running first.

## Known failure classes

Each row: symptom (grep-able) → cause → fix → the incident it traces to.

| Symptom | Cause | Fix | Traces to |
|---|---|---|---|
| `<exact error text>` | `<root cause>` | `<verified fix cmd>` | `<incident>` |

## Before blaming the framework

1. `<env-var>` set? Unset silently hits the wrong target — check FIRST when data looks wrong.
2. Toolchain versions match `<version file>`?
3. Stale build or cache: `<clean cmd>`.
