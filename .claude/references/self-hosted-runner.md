# Self-hosted GitHub runners

Loaded when a workflow requires `self-hosted`, or when `/runner` runs. Optional
capability: most projects should have NO self-hosted runner. Opt in via
`.claude/harness.json` → `"selfHostedRunner": true`.

## 1. The failure this exists to end

A job that says `runs-on: [self-hosted, linux]` with no runner registered **does
not fail — it queues forever.** GitHub shows it pending, never red. A repo can
therefore have a CI history where every run is `queued` or `cancelled`, including
on the base branch, while every PR page looks like CI is merely slow.

The damage is silent: large PRs merge with zero automated verification because
nothing ever went red. Branch protection that requires a check which never runs
blocks merges; branch protection that doesn't require it waves everything through.

**Corollary — an offline-but-registered runner is just as bad as none.** Same
queue-forever behaviour. This is why `stop` must DEREGISTER, not just `docker rm`.

## 2. Safety — the public-repo guard is non-negotiable

A self-hosted runner executes whatever a workflow tells it to, as the user who
started it, on their machine. On a **public** repo, any fork PR can edit the
workflow and get arbitrary code execution — credential theft, SSH keys, the lot.

`common.sh` → `assert_private_repo` gates every start on
`gh repo view --json visibility` and exits non-zero unless `PRIVATE`.

- There is **no flag, no env var, no `--force`** to skip it. Do not add one.
- It **fails closed**: unreadable visibility (unauthenticated, offline, no
  access) refuses exactly as hard as a confirmed public repo. "Could not check"
  is never "probably fine".
- It runs **before** the Docker preflight, so a stopped daemon can never mask it.

GitHub's own guidance is the same: self-hosted runners are for private repos.

## 3. The registration token

Short-lived (~1 hour). Mint a fresh one on every start:

```sh
gh api -X POST repos/{owner}/{repo}/actions/runners/registration-token -q .token
```

Never write it to disk, never echo it, never bake it into a compose file or an
image. It goes into the container's env and nowhere else; `start-runner.sh`
`unset`s it immediately after `docker run`.

## 4. Ordering: deregister BEFORE removing the container

Traces to a real incident while building these scripts.

Removing the container first orphans any in-flight job. GitHub keeps the job
assigned to a runner that no longer exists and answers the delete with:

```
422 Runner <name> is currently running a job and cannot be deleted.
```

You are then stuck with a **registered, offline** runner — the exact
queue-forever state — and `docker rm` has already destroyed the only thing that
could acknowledge. Recovery took cancelling the workflow run AND re-registering a
runner under the same name so it could drain, before the delete would succeed.

So: **refuse (or `--wait`) while busy → deregister the idle runner → remove the
container → verify zero remain.** `stop-runner.sh` exits non-zero if any runner
is still registered; an offline registration is not a clean stop.

## 5. Never report "online" from a name match

Also traces to a real incident here. Polling `.runners[].name` for the expected
name and declaring success reports ONLINE for a runner that is `offline`: a stale
registration from a previous run is indistinguishable by name.

Assert the status field:

```sh
gh api repos/{o}/{r}/actions/runners -q '.runners[] | select(.name=="X") | .status'
```

A false green here is the same class of bug as the queue-forever failure itself.

## 6. Architecture — the arm64 deploy trap

On Apple Silicon the runner is **arm64**.

- **Fine** for lint, typecheck, and unit tests. They ship nothing.
- **Dangerous** for prebuilt deploys. `vercel build --prod` + `vercel deploy
  --prebuilt` bundles arch-specific native binaries (`sharp`, `swc`, `esbuild`).
  Vercel's runtime is **x64 Linux**, so an arm64 prebuilt bundle can crash in
  production — after a green CI run.

**Deploy from the provider's builders instead:** `vercel deploy --prod`, no
`--prebuilt`. Use the local runner for verification, not for producing artifacts
that ship. If you must build deployable artifacts locally, match the target arch
(`--platform linux/amd64`), and expect it to be slow under emulation.

## 7. Labels are case-insensitive

The agent self-reports `self-hosted,Linux,ARM64`. A workflow asking for
`[self-hosted, linux]` **matches**. This is verified, correct, and not a bug —
do not "fix" the case, and do not add `ARM64` to a workflow's `runs-on` to make
it "match", which would only pin the job to arm64 hardware.

## 8. Memory is the real constraint

Node's default heap is ~2 GB. Real web builds exceed it: one project's build
peaked at **~4.6 GB RSS** and OOM-killed a GitHub-hosted runner.

`RUNNER_MEM` defaults to `6g` for headroom. **Measure, do not guess:**

```sh
/usr/bin/time -l <your build command>   # macOS: "maximum resident set size", bytes
/usr/bin/time -v <your build command>   # Linux: "Maximum resident set size", KB
```

Set `RUNNER_MEM` above the measured peak. Too low and the build dies with an
opaque exit 137 (OOM-killed) that looks like a flaky test.

## 9. One runner serialises everything

A single runner executes **one job at a time**. A matrix of five jobs runs them
back to back, not in parallel. CI is not hung — it is queued behind itself. Say
so before someone spends an afternoon debugging it. Run more containers (unique
`RUNNER_NAME` and `RUNNER_CONTAINER` per instance) if you need concurrency.

## 10. Files

| File | Role |
|---|---|
| `.claude/tooling/self-hosted-runner/common.sh` | Repo derivation from `git remote`, preflight, the public-repo guard, workflow scan |
| `.claude/tooling/self-hosted-runner/start-runner.sh` | Guard → mint token → run container → wait for `status=online` |
| `.claude/tooling/self-hosted-runner/stop-runner.sh` | Refuse/wait while busy → deregister → remove container → verify zero |
| `.claude/tooling/self-hosted-runner/status-runner.sh` | Read-only gap report; safe on any repo; used by `/runner status` and `/harness-init` |

All derive `owner/repo` from the `origin` remote — nothing is hardcoded.
`GITHUB_REPO` overrides for forks and mirrors.
