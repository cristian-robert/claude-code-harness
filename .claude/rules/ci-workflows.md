---
paths: [".github/workflows/**"]
---

# CI workflow rules

Loads only when a workflow file is touched. Detail — safety guard, ordering
bugs, arm64 deploy trap, memory sizing: `.claude/references/self-hosted-runner.md`.

## runs-on

- **`self-hosted` with no runner registered does NOT fail — it queues forever.**
  CI reads pending, never red, and PRs merge unverified. Before adding or keeping
  a `self-hosted` job, run `/runner status` and confirm a runner is actually
  online. An *offline-but-registered* runner behaves identically to none.
  traces to: a repo whose entire CI history was `queued`/`cancelled`, where a
  125-file security PR merged with zero automated verification.
- Prefer `ubuntu-latest` unless the job genuinely needs local hardware, a private
  network, or more memory than a hosted runner gives. Self-hosted is a liability
  to maintain, not a default.
- Never put a self-hosted runner on a **public** repo: any fork PR becomes
  arbitrary code execution on the runner's machine. `/runner start` refuses this
  and cannot be overridden.

- **Want to run CI locally? Use `/ci-local` (act), never a `runs-on:` edit.** act
  executes these files in Docker with no workflow change and no effect on anyone
  else. Switching `runs-on:` to `self-hosted` to get local runs commits one
  machine into shared config and causes the queue-forever failure above.

## Deploys

Do not deploy prebuilt artifacts built on a self-hosted Apple Silicon runner.
`vercel build` + `deploy --prebuilt` bundles arch-specific native binaries
(`sharp`, `swc`, `esbuild`) and Vercel's runtime is x64 Linux — an arm64 bundle
can crash in production after a green CI run. Use `vercel deploy --prod` (no
`--prebuilt`) and let the provider build.

## Required checks

A branch-protection rule that requires a check which never runs blocks every
merge; one that doesn't require it waves everything through. Whenever you change
a job's `name` or its `runs-on`, re-check the protection rules that reference it.
