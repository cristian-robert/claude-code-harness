---
name: runner
description: "Self-hosted GitHub runner: report the gap, provision one, or stop and deregister it."
disable-model-invocation: true
argument-hint: "[status|start|stop]"
allowed-tools: Bash(bash .claude/tooling/self-hosted-runner/*) Bash(gh api *) Bash(gh run list *) Bash(gh repo view *)
---

# /runner — self-hosted GitHub Actions runner

Optional. Most projects should have NO self-hosted runner; this is for repos
whose workflows declare `runs-on: [self-hosted, …]`.

**Read `.claude/references/self-hosted-runner.md` before `start` or `stop`** —
safety rules plus two ordering bugs that already cost a repair cycle. `status`
changes nothing and needs no reading.

## Args

`status` (default) · `start` · `stop`. Anything else → say so and stop.

## Why this is not cosmetic

A `self-hosted` job with no runner registered **does not fail — it queues
forever.** CI reads pending, never red, and PRs merge unverified. An
*offline-but-registered* runner does the same, which is why `stop` deregisters
rather than just removing a container.

## status (default)

```sh
bash .claude/tooling/self-hosted-runner/status-runner.sh
```

Read-only, safe on any repo, exits 0 whether or not a gap exists. Report its
output as-is — it already prints the workflow list, the runner list, and the
summary line. Gap present (`N>0` workflows, `0` runners online) → name it and
point at `/runner start`; do not start anything unasked.

Not a gap: a project with zero self-hosted workflows and zero runners. That is
the normal, healthy state. Say `no self-hosted workflows — nothing to provision`
and stop.

## start

Confirm the repo is one the user wants executing CI on their machine, then:

```sh
bash .claude/tooling/self-hosted-runner/start-runner.sh
```

The script refuses on any repo that is not `PRIVATE`, and fails closed when
visibility is unreadable. **There is no override — do not add one, do not work
around it, do not suggest a workaround.** If it refuses, relay the refusal and
stop; a public repo running a self-hosted runner is arbitrary code execution for
any fork PR.

It waits for `status=online` (not merely for the name to appear) and prints the
runner's real status line. On success, check whether queued work picked up:

```sh
gh run list --limit 5
```

A previously `queued` run moving to `in_progress` is the evidence that this
worked. Report it. Still queued after a minute → the labels do not match; compare
the workflow's `runs-on` against the runner's reported labels (case differences
are fine — `Linux` matches `linux`).

**One runner runs one job at a time.** Matrix jobs serialise. Say so, or someone
will report CI as hung.

## stop

```sh
bash .claude/tooling/self-hosted-runner/stop-runner.sh          # refuses if busy
bash .claude/tooling/self-hosted-runner/stop-runner.sh --wait   # block until idle
```

Refuses while a job is running, deliberately: tearing down a busy runner orphans
the job on GitHub's side and needs manual repair (cancel the run, re-register a
runner so it can acknowledge, then delete). Relay the refusal and offer `--wait`
or cancelling the run — never force it.

The script verifies zero runners remain and exits non-zero if any do. **Do not
report a clean stop unless you saw `Runners still registered … 0`.** Anything
else means the queue-forever bug is back.

## Deploys — do not route them here

Prebuilt deploys from an Apple Silicon runner are arm64; Vercel's runtime is x64
Linux, so a bundle carrying native binaries (`sharp`, `swc`, `esbuild`) can crash
in production after a green CI run. Deploy via the provider's builders
(`vercel deploy --prod`, no `--prebuilt`). Detail: reference section 6.

## Output contract

One line, per `.claude/references/output-contract.md`:

```
Reported runner status · Next: /runner start
Started runner <name> · Next: /validate
Stopped runner <name> · Next: <command>
```

A refusal (public repo, busy runner) or an error REPLACES that line: state what
was refused and why, and stop. Never emit both.
