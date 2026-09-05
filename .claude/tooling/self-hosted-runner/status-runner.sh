#!/usr/bin/env bash
#
# Report the self-hosted runner GAP: how many workflows demand a self-hosted
# runner vs how many runners are actually online.
#
# Read-only and safe on any repo (public included) — it registers nothing, so it
# carries no public-repo risk and no private-repo guard. Exits 0 even when the
# gap is wide: plenty of projects legitimately have no runner, and this is
# consumed by /harness-init as a gap report, never as a blocker.
set -euo pipefail
# Source by absolute path and do NOT cd. Changing directory to the script's own
# location made every git lookup resolve against the repo the SCRIPT lives in
# rather than the project it was invoked from — so a runner check could silently
# report on the wrong repo. Keep the caller's cwd.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage: status-runner.sh [--help]

Prints which workflows require a self-hosted runner, which runners are
registered (online/offline/busy), and a one-line summary:

  N workflows require self-hosted · M runners online

Exits 0 whether or not a gap exists. Degrades to "unknown" for the runner side
when gh is missing or unauthenticated, rather than failing.
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) echo "Unknown argument: $1" >&2; echo >&2; usage >&2; exit 2 ;;
esac

ROOT=$(project_root)

# --- workflow side (pure filesystem, always available) -----------------------
workflows=$(self_hosted_workflow_files "$ROOT")
if [ -n "$workflows" ]; then
  wf_count=$(printf '%s\n' "$workflows" | wc -l | tr -d ' ')
  echo "Workflows requiring a self-hosted runner:"
  printf '%s\n' "$workflows" | sed "s|^${ROOT}/|  |"
else
  wf_count=0
  echo "Workflows requiring a self-hosted runner: none"
fi

# --- runner side (needs gh; degrades to unknown) -----------------------------
# gh's -q takes jq-syntax filters natively, so this needs no jq/python on PATH.
online="unknown"
if command -v gh >/dev/null && REPO=$(resolve_repo 2>/dev/null); then
  if total=$(gh api "repos/${REPO}/actions/runners" -q '.total_count' 2>/dev/null); then
    online=$(gh api "repos/${REPO}/actions/runners" \
      -q '[.runners[] | select(.status=="online")] | length' 2>/dev/null || echo 0)
    if [ "${total:-0}" != "0" ]; then
      echo "Registered runners on ${REPO}:"
      gh api "repos/${REPO}/actions/runners" \
        -q '.runners[] | "  \(.name): \(.status) busy=\(.busy) labels=\([.labels[].name]|join(","))"' 2>/dev/null || true
    else
      echo "Registered runners on ${REPO}: none"
    fi
  else
    echo "Registered runners: unknown (gh could not read ${REPO} — run: gh auth login)"
  fi
else
  echo "Registered runners: unknown (gh missing, or no origin remote)"
fi

echo
echo "${wf_count} workflows require self-hosted · ${online} runners online"

# The gap worth naming: work that can never run. Queued-forever is the failure
# mode this whole capability exists to surface, so say it in words.
if [ "$wf_count" -gt 0 ] && [ "$online" = "0" ]; then
  echo "GAP: those jobs will QUEUE FOREVER, not fail — CI will look pending, never red."
  echo "     Fix with: /runner start   (private repos only)"
fi
