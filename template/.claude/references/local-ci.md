# Local CI with act

Loaded when `/ci-local` runs. Optional capability — opt in via
`.claude/harness.json` → `"localCi": true`.

## 1. Choosing between act and a self-hosted runner

Both are described as "run CI locally". They solve different problems.

| | `act` (`/ci-local`) | self-hosted runner (`/runner`) |
|---|---|---|
| Executes | your workflow FILES, locally | real CI jobs GitHub dispatches to you |
| Needs `runs-on: self-hosted` | no | yes — committed to the repo |
| Registered with GitHub | no | yes |
| Affects teammates | no | yes — their jobs queue forever if your runner is down |
| Good for | fast feedback, debugging a workflow | private-repo CI on your own hardware |

**Do not edit `runs-on:` to enable local runs.** It commits one developer's
machine into shared config and recreates the exact queue-forever failure
documented in `self-hosted-runner.md`. act needs no workflow change at all.

## 2. Architecture — amd64, always

act's runner images are amd64. On Apple Silicon, `run-local-ci.sh` adds
`--container-architecture linux/amd64` automatically. Verified: inside the
container `uname -m` reports `x86_64` on an arm64 host.

This is the *mirror* of the self-hosted arm64 trap. There, arm64 was dangerous
because prebuilt output shipped to an x64 runtime. Here, forcing amd64 is what
makes local results resemble GitHub's. Emulation costs speed — an amd64 container
on Apple Silicon is meaningfully slower than native.

## 3. The `self-hosted` label has no default mapping

act maps each `runs-on` label to an image via `-P <label>=<image>`. It ships
mappings for `ubuntu-latest` and friends but **none for `self-hosted`**, so a
repo whose jobs target a self-hosted pool gets every job skipped — silently
looking like "nothing to run".

`run-local-ci.sh` detects `self-hosted` in `.github/workflows/` and adds:

```sh
-P self-hosted=catthehacker/ubuntu:act-latest
```

Beware the confusingly-named opposite: the VALUE `-self-hosted` (leading dash),
as in `-P ubuntu-latest=-self-hosted`, means "run on the host, not in a
container". That is a different feature and not what this does.

## 4. Secrets — never `.env*`

The harness forbids reading or writing `.env*`; `guard.mjs` denies it. The script
never touches them.

- act reads a root **`.secrets`** file (`KEY=value`, one per line) if present.
  The user creates it and adds it to `.gitignore`. The agent never reads,
  writes, or prints it.
- `--with-token` supplies `GITHUB_TOKEN` from `gh auth token` for steps that need
  it. It is passed to act and unset immediately; it is never written to disk.
- Never paste a secret into a command line — it lands in shell history and `ps`.

## 5. Local green is evidence, not proof

act's default images are **intentionally incomplete** — they are not GitHub's
runner VMs. Expect divergence:

| Thing | Local behaviour |
|---|---|
| Tools absent from the image | step fails locally, passes on GitHub |
| `services:` containers | partial support; often need extra config |
| `workflow_run` triggers | no upstream run exists to trigger from |
| OIDC / `id-token` | unavailable — no GitHub identity to mint against |
| `matrix` | supported, but every leg runs serially on one machine |
| Large images | `catthehacker/ubuntu:act-full` approaches 18 GB |

Report what ran and what was skipped. A local pass never licenses the claim
"CI passes" — only the real run on GitHub does that.

## 6. Configuration

Per-repo defaults go in a root `.actrc`, one flag per line, no comments:

```
--container-architecture=linux/amd64
--action-offline-mode
```

The script's auto-flags and `.actrc` compose; `.actrc` is the user's file and
nothing here rewrites it.

## 7. Files

| File | Role |
|---|---|
| `.claude/tooling/local-ci/run-local-ci.sh` | Preflight, auto arch + `self-hosted` mapping, `list`/`run` |
| `.claude/skills/ci-local/SKILL.md` | The `/ci-local` command |

Install act: `brew install act` (macOS) or
<https://nektosact.com/installation/index.html>. Verified against act 0.2.89.
