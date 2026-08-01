#!/usr/bin/env bash
#
# Start a self-hosted GitHub Actions runner in Docker, and wait until it is ONLINE.
#
# SAFETY: refuses on any repo that is not PRIVATE. See assert_private_repo in
# common.sh — a self-hosted runner on a public repo is arbitrary code execution
# for any fork PR. There is no override flag.
#
# ARCHITECTURE CAVEAT (read before using this for deploys)
#   On Apple Silicon this runs arm64. Fine for lint/typecheck/tests, which ship
#   nothing. NOT fine for prebuilt deploys: `vercel build` + `deploy --prebuilt`
#   bundles arch-specific native binaries (sharp, swc, esbuild) and Vercel's
#   runtime is x64 Linux, so an arm64 prebuilt bundle can crash in production.
#   Deploy from the provider's builders instead (`vercel deploy --prod`, no
#   --prebuilt). Details: .claude/references/self-hosted-runner.md
set -euo pipefail
# Source by absolute path; do NOT cd (see status-runner.sh) — the caller's cwd
# decides which repo this registers against, and it must stay theirs.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage: start-runner.sh [--help]

Registers a Docker-based self-hosted GitHub Actions runner for THIS repo
(owner/repo derived from the `origin` remote) and waits for it to come online.

Refuses unless the repo is PRIVATE. This cannot be overridden.

Environment:
  GITHUB_REPO       owner/repo override (default: parsed from `git remote origin`)
  RUNNER_NAME       runner name         (default: <repo>-local-<hostname>)
  RUNNER_CONTAINER  container name      (default: <repo>-gh-runner)
  RUNNER_LABELS     labels              (default: self-hosted,linux)
  RUNNER_MEM        container memory cap (default: 6g)
  RUNNER_IMAGE      runner image        (default: myoung34/github-runner:latest)

Notes:
  - One runner executes one job at a time; matrix jobs SERIALISE. CI is not hung.
  - Labels are case-insensitive: the agent reports `Linux`, a workflow asking for
    `linux` still matches. Do not "fix" this.
  - Measure your build's real memory before trusting RUNNER_MEM: /usr/bin/time -l <build>
  - Stop with stop-runner.sh — it also DEREGISTERS. Removing the container alone
    leaves a registered-but-offline runner, which makes jobs queue forever again.
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) echo "Unknown argument: $1" >&2; echo >&2; usage >&2; exit 2 ;;
esac

require_gh

REPO=$(resolve_repo)

# The safety guard runs BEFORE any other preflight, deliberately. It must not be
# reachable-around by a stopped Docker daemon or a missing image: "public repo"
# has to be the first thing this script can say, in every environment.
assert_private_repo "$REPO"

require_docker

NAME=$(runner_name "$REPO")
CONTAINER=$(runner_container "$REPO")
LABELS="${RUNNER_LABELS:-self-hosted,linux}"
IMAGE="${RUNNER_IMAGE:-myoung34/github-runner:latest}"
# Node's default heap (~2 GB) OOMs real web builds; one project's build peaked at
# ~4.6 GB RSS. 6g leaves headroom. Measure yours, do not guess.
MEM_LIMIT="${RUNNER_MEM:-6g}"

# --- registration token ------------------------------------------------------
# Short-lived (~1h). Minted FRESH on every start, passed only through the
# container's env. Never written to disk, never echoed, never in a compose file.
token=$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" -q .token 2>/dev/null || true)
[ -n "$token" ] || {
  echo "Could not mint a registration token for $REPO (admin access required)." >&2
  exit 1
}

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo "Starting runner '$NAME' for $REPO (labels: $LABELS, arch: $(uname -m), mem: $MEM_LIMIT)"
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --memory "$MEM_LIMIT" \
  -e REPO_URL="https://github.com/${REPO}" \
  -e RUNNER_NAME="$NAME" \
  -e RUNNER_TOKEN="$token" \
  -e RUNNER_WORKDIR=/tmp/runner/work \
  -e RUNNER_SCOPE=repo \
  -e LABELS="$LABELS" \
  -e EPHEMERAL=false \
  -e DISABLE_AUTO_UPDATE=true \
  -v /var/run/docker.sock:/var/run/docker.sock \
  "$IMAGE" >/dev/null
unset token

echo "Container started. Waiting for it to come ONLINE..."
# Wait on status, NOT on the name appearing. A registration entry can exist while
# the agent is offline — a stale entry from a previous run looks identical to a
# fresh one by name. Reporting "ONLINE" off a name match is how a runner that
# never connected gets mistaken for a working one, which is the same
# false-green this whole capability exists to prevent.
for _ in $(seq 1 40); do
  status=$(gh api "repos/${REPO}/actions/runners" \
    -q ".runners[] | select(.name==\"${NAME}\") | .status" 2>/dev/null || true)
  if [ "$status" = "online" ]; then
    gh api "repos/${REPO}/actions/runners" \
      -q '.runners[] | "  \(.name): \(.status) busy=\(.busy) labels=\([.labels[].name]|join(","))"'
    echo "Runner is ONLINE. Queued jobs should start picking up."
    exit 0
  fi
  sleep 3
done

echo "Runner did not reach status=online within 120s (last seen: ${status:-absent})." >&2
echo "Container logs:" >&2
docker logs --tail 40 "$CONTAINER" >&2
exit 1
