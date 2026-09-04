---
name: ci-local
description: "Run this repo's GitHub Actions workflows locally in Docker via act — no workflow edits, nothing sent to GitHub."
disable-model-invocation: true
argument-hint: "[list|run] [job]"
allowed-tools: Bash(bash .claude/tooling/local-ci/*) Bash(act *)
---

# /ci-local — run CI locally in Docker

Executes the repo's existing workflow files on this machine via
[`act`](https://nektosact.com). **Nothing is registered with GitHub, no workflow
file is modified, and teammates are unaffected.**

Gotchas (image parity, secrets, what cannot run locally):
`.claude/references/local-ci.md`.

## Args

`list` (default) · `run [job]`. Anything else → say so and stop.

## Not the same as a self-hosted runner

| | `/ci-local` (act) | `/runner` (self-hosted) |
|---|---|---|
| What runs | workflow files, on your machine | real GitHub-dispatched CI jobs |
| Workflow edits | none | requires `runs-on: self-hosted` committed |
| Blast radius | you only | whole team — jobs queue forever when your runner is down |

**Never edit `runs-on:` to make local runs work.** That commits one machine's
setup into shared config and recreates the queue-forever failure `/runner`
exists to prevent. This command needs no such change.

## list (default)

```sh
bash .claude/tooling/local-ci/run-local-ci.sh list
```

Prints the job graph act would execute — stages, job IDs, workflows, triggering
events. Changes nothing, runs no container. Start here.

`act is not installed` (exit 127) → relay the install hint and stop. Do NOT
install it unasked; it is a real dependency the user chooses.

## run

```sh
bash .claude/tooling/local-ci/run-local-ci.sh run                  # everything
bash .claude/tooling/local-ci/run-local-ci.sh run -j lint          # one job
bash .claude/tooling/local-ci/run-local-ci.sh run -W .github/workflows/ci.yml
bash .claude/tooling/local-ci/run-local-ci.sh run -e pull_request  # simulate an event
```

Prefer the narrowest scope that answers the question — a full `run` pulls
multi-GB images and executes every job. When several jobs share a name across
workflows, act says so; disambiguate with `-W`.

The script applies two fixes automatically; don't re-specify them:

- **Apple Silicon** → `--container-architecture linux/amd64`. act's images are
  amd64; without it jobs refuse or emulate wrongly.
- **`runs-on: self-hosted`** → `-P self-hosted=catthehacker/ubuntu:act-latest`.
  act ships no mapping for that label and would otherwise skip every such job.

## Secrets — never from `.env*`

The harness forbids reading `.env*` and a hook denies it. The script never reads
them. act picks up a root `.secrets` file (`KEY=value` per line) **that the user
creates and gitignores**; you neither read, write, nor print it.

If a step needs a GitHub token: `--with-token` passes `gh auth token`. Do not
paste a token into a command, a file, or the terminal.

## Interpreting results

A local pass is **evidence, not proof**: act's images are deliberately leaner
than GitHub's runners, and services, `workflow_run` triggers, and OIDC-dependent
steps behave differently or not at all. Report what actually ran and what was
skipped — never upgrade a local green into "CI passes".

## Output contract

One line, per `.claude/references/output-contract.md`:

```
Listed local CI jobs · Next: /ci-local run -j <job>
Ran local CI (<n> jobs, <n> failed) · Next: /validate
```

A blocker (act missing, Docker down, job failed) REPLACES that line: state it,
show the real failing output, and stop.
