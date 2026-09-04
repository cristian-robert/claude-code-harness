#!/usr/bin/env bash
#
# Stop the self-hosted runner AND deregister it from GitHub.
#
# Deregistering is the whole point. A runner left registered but offline makes
# every `runs-on: [self-hosted, ...]` job queue forever instead of failing fast —
# which is exactly the silent failure these scripts exist to end. `docker rm` on
# its own recreates the bug.
#
# ORDER MATTERS — traces to a real incident during this script's own development:
#   Removing the container FIRST and deregistering second orphans any in-flight
#   job. GitHub keeps the job assigned to a runner that no longer exists, answers
#   the delete with `422 Runner is currently running a job and cannot be deleted`,
#   and leaves a registered-but-OFFLINE runner — the precise queue-forever state
#   this tool exists to prevent. Recovering needed the workflow run cancelled AND
#   the runner re-registered so it could acknowledge. So: deregister an IDLE
#   runner first, remove the container second.
set -euo pipefail
# Source by absolute path; do NOT cd (see status-runner.sh) — the caller's cwd
# decides which repo this deregisters from.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage: stop-runner.sh [--wait [SECONDS]] [--help]

Deregisters the runner from GitHub, then removes its container, then verifies
that ZERO runners remain registered.

  --wait [SECONDS]  If the runner is mid-job, block until it goes idle
                    (default 1800s) instead of refusing.

Refuses by default while a job is running: tearing down a busy runner orphans
that job on GitHub's side and needs manual repair (cancel the run, re-register
the runner so it can acknowledge, then remove it). Wait it out, or cancel the
run yourself with `gh run cancel <id>` and re-run this.

Exits non-zero if any runner is still registered afterwards — an offline
registration is not a clean stop.

Environment:
  GITHUB_REPO       owner/repo override (default: parsed from `git remote origin`)
  RUNNER_NAME       runner name         (default: <repo>-local-<hostname>)
  RUNNER_CONTAINER  container name      (default: <repo>-gh-runner)
EOF
}

WAIT_SECS=0
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --wait) WAIT_SECS="${2:-1800}" ;;
  "") ;;
  *) echo "Unknown argument: $1" >&2; echo >&2; usage >&2; exit 2 ;;
esac

require_gh

REPO=$(resolve_repo)
NAME=$(runner_name "$REPO")
CONTAINER=$(runner_container "$REPO")

runner_field() {
  gh api "repos/${REPO}/actions/runners" \
    -q ".runners[] | select(.name==\"${NAME}\") | .$1" 2>/dev/null || true
}

# --- 1. refuse (or wait) while busy -----------------------------------------
if [ "$(runner_field busy)" = "true" ]; then
  if [ "$WAIT_SECS" -gt 0 ] 2>/dev/null; then
    echo "Runner '$NAME' is running a job. Waiting up to ${WAIT_SECS}s for it to go idle..."
    waited=0
    while [ "$(runner_field busy)" = "true" ] && [ "$waited" -lt "$WAIT_SECS" ]; do
      sleep 10; waited=$((waited + 10))
    done
  fi
  if [ "$(runner_field busy)" = "true" ]; then
    echo "REFUSING: runner '$NAME' is currently running a job." >&2
    echo "Removing it now would orphan that job: GitHub would keep it assigned to a" >&2
    echo "runner that no longer exists, refuse to deregister it, and leave a" >&2
    echo "registered-but-offline runner — jobs would queue forever again." >&2
    echo "Re-run with --wait, or cancel the run first: gh run list --repo ${REPO}" >&2
    exit 1
  fi
fi

# --- 2. deregister FIRST, while the runner is alive and idle -----------------
id=$(runner_field id)
if [ -n "$id" ]; then
  if gh api -X DELETE "repos/${REPO}/actions/runners/${id}" >/dev/null 2>&1; then
    echo "Deregistered runner '$NAME' (id=$id)."
  else
    echo "Could not deregister runner '$NAME' (id=$id) — leaving the container in" >&2
    echo "place so it can still acknowledge. Re-run once it is idle." >&2
    exit 1
  fi
else
  echo "Runner '$NAME' was not registered."
fi

# --- 3. then remove the container -------------------------------------------
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 \
    && echo "Container '$CONTAINER' removed." \
    || echo "No container '$CONTAINER' running."
else
  echo "Docker unavailable — skipping container removal (runner is already deregistered)."
fi

# --- 4. verify by effect — never assume the DELETE worked --------------------
remaining=$(gh api "repos/${REPO}/actions/runners" -q '.total_count' 2>/dev/null || echo "?")
echo "Runners still registered on ${REPO}: ${remaining}"
if [ "$remaining" != "0" ]; then
  gh api "repos/${REPO}/actions/runners" -q '.runners[] | "  \(.name): \(.status)"' 2>/dev/null || true
  echo "NOT a clean stop: runners remain registered. An offline one still makes" >&2
  echo "self-hosted jobs queue forever." >&2
  exit 1
fi
