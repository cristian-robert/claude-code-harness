#!/usr/bin/env bash
#
# Run this repo's GitHub Actions workflows LOCALLY in Docker, via nektos/act.
#
# WHY act AND NOT A SELF-HOSTED RUNNER
#   Both "run CI locally" — they are not interchangeable:
#     act            executes the workflow files on your machine. Nothing is
#                    registered with GitHub, no workflow file changes, no effect
#                    on teammates. This is the local-feedback tool.
#     self-hosted    GitHub dispatches REAL CI jobs to your machine. Requires
#                    `runs-on: self-hosted` committed to the workflow — which
#                    makes every job queue forever, for everyone, whenever your
#                    runner is down. See .claude/references/self-hosted-runner.md
#   Never edit `runs-on:` just to get local runs. That is what this script is for.
set -euo pipefail
# Source-relative only for our own files; the caller's cwd decides which repo runs.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: run-local-ci.sh [list|run] [options]

  list            (default) show the jobs act would run — changes nothing
  run             actually execute them in Docker

Options:
  -j, --job NAME       run only this job
  -W, --workflow FILE  limit to one workflow file
  -e, --event EVENT    event to simulate (push, pull_request, …)
      --with-token     pass GITHUB_TOKEN from `gh auth token` (only if a step needs it)
  -h, --help

Secrets: this script NEVER reads .env* — the harness forbids it and a hook denies
it. act reads `.secrets` (KEY=value, one per line) from the repo root if present;
you create and gitignore that file yourself. Nothing here writes or prints it.

Auto-applied:
  - Apple Silicon -> --container-architecture linux/amd64 (act's images are amd64)
  - `runs-on: self-hosted` in a workflow -> -P self-hosted=<ubuntu image>, since
    act ships no mapping for that label and would otherwise skip the job.
EOF
}

MODE="list"
case "${1:-}" in
  list|run) MODE="$1"; shift ;;
  -h|--help) usage; exit 0 ;;
  "") ;;
  -*) ;;                       # bare options: keep default mode, fall through
  *) echo "Unknown mode: $1" >&2; echo >&2; usage >&2; exit 2 ;;
esac

JOB="" ; WORKFLOW="" ; EVENT="" ; WITH_TOKEN=0
while [ $# -gt 0 ]; do
  case "$1" in
    -j|--job)      JOB="${2:-}"; shift 2 ;;
    -W|--workflow) WORKFLOW="${2:-}"; shift 2 ;;
    -e|--event)    EVENT="${2:-}"; shift 2 ;;
    --with-token)  WITH_TOKEN=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; echo >&2; usage >&2; exit 2 ;;
  esac
done

# --- preflight ---------------------------------------------------------------
if ! command -v act >/dev/null; then
  cat >&2 <<'EOF'
act is not installed — nothing was run.

  macOS:  brew install act
  Linux:  https://nektosact.com/installation/index.html

act runs your existing workflow files locally in Docker. It needs no GitHub
registration and changes no workflow file.
EOF
  exit 127
fi
command -v docker >/dev/null || { echo "docker required" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon not running" >&2; exit 1; }

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
[ -d "$ROOT/.github/workflows" ] || {
  echo "No .github/workflows/ in $ROOT — nothing to run." >&2
  exit 1
}

ARGS=()

# act's runner images are amd64. On Apple Silicon, omitting this gives either a
# refusal or silently-wrong emulated results — the same arch mismatch that makes
# arm64 PREBUILT deploys dangerous, here showing up as a local-run problem.
if [ "$(uname -m)" = "arm64" ]; then
  ARGS+=(--container-architecture linux/amd64)
fi

# act maps `runs-on` labels to images and ships no mapping for `self-hosted`, so
# a repo whose workflows target a self-hosted pool would have every job skipped.
# Map it onto a normal ubuntu image so those jobs actually execute locally.
if grep -rqE '^[[:space:]]*(runs-on:.*self-hosted|-[[:space:]]*self-hosted)' \
     "$ROOT/.github/workflows" --include='*.yml' --include='*.yaml' 2>/dev/null; then
  ARGS+=(-P "self-hosted=catthehacker/ubuntu:act-latest")
fi

# Secrets: only ever a file the USER maintains, never .env*, never echoed.
if [ -f "$ROOT/.secrets" ]; then
  ARGS+=(--secret-file "$ROOT/.secrets")
fi

if [ "$WITH_TOKEN" = "1" ]; then
  # Single-quoted message: backticks inside DOUBLE quotes would command-substitute
  # and print the token into the warning. A credential must never reach stdout.
  tok=$(gh auth token 2>/dev/null || true)
  if [ -n "$tok" ]; then
    ARGS+=(-s "GITHUB_TOKEN=$tok")
  else
    echo 'warning: --with-token given but `gh auth token` returned nothing' >&2
  fi
  unset tok
fi

[ -n "$JOB" ]      && ARGS+=(-j "$JOB")
[ -n "$WORKFLOW" ] && ARGS+=(-W "$WORKFLOW")

# macOS still ships bash 3.2, where "${ARGS[@]}" on an EMPTY array is an unbound
# variable under `set -u` and aborts the script. The +expansion form is empty-safe
# on every bash version.
run_act() { exec act ${EVENT:+"$EVENT"} "$@" ${ARGS[@]+"${ARGS[@]}"}; }

if [ "$MODE" = "list" ]; then
  run_act --list   # --list changes nothing: it prints the job graph act would run
fi

echo "Running workflows locally via act (nothing is sent to GitHub)..."
run_act
