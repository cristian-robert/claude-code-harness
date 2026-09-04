#!/usr/bin/env bash
#
# Shared preflight for the self-hosted runner scripts. Sourced, never run.
#
# WHY THESE SCRIPTS EXIST
#   A workflow that says `runs-on: [self-hosted, linux]` with no runner registered
#   does NOT fail. GitHub queues the job forever. The adopting project's CI history
#   then reads `queued`/`cancelled` for every run — including on the base branch —
#   and large PRs merge with zero automated verification while CI looks "pending".
#   Full background + gotchas: .claude/references/self-hosted-runner.md
set -euo pipefail

# --- repo identity: derived, never hardcoded ---------------------------------
# GITHUB_REPO overrides for forks/mirrors. Everything else comes from the remote,
# so these scripts are repo-agnostic and ship in the harness template unmodified.
resolve_repo() {
  if [ -n "${GITHUB_REPO:-}" ]; then printf '%s\n' "$GITHUB_REPO"; return 0; fi
  local url
  url=$(git remote get-url origin 2>/dev/null) || {
    echo "No 'origin' remote and GITHUB_REPO unset — cannot tell which repo to register against." >&2
    return 1
  }
  # Handles https://github.com/o/r(.git), git@github.com:o/r(.git), ssh://git@github.com/o/r
  url=${url%.git}
  url=${url#*github.com}
  url=${url#:}
  url=${url#/}
  case "$url" in
    */*) printf '%s\n' "$url" ;;
    *) echo "Could not parse owner/repo from origin remote: $(git remote get-url origin)" >&2; return 1 ;;
  esac
}

project_root() { git rev-parse --show-toplevel 2>/dev/null || pwd; }
repo_slug()    { printf '%s\n' "${1##*/}"; }

runner_name()      { printf '%s\n' "${RUNNER_NAME:-$(repo_slug "$1")-local-$(hostname -s)}"; }
runner_container() { printf '%s\n' "${RUNNER_CONTAINER:-$(repo_slug "$1")-gh-runner}"; }

require_gh() {
  command -v gh >/dev/null || { echo "gh CLI required (https://cli.github.com)" >&2; return 1; }
}

require_docker() {
  command -v docker >/dev/null || { echo "docker required" >&2; return 1; }
  docker info >/dev/null 2>&1 || { echo "Docker daemon not running" >&2; return 1; }
}

# --- the public-repo guard ---------------------------------------------------
# NON-NEGOTIABLE and deliberately un-flagged: there is no --force, no env escape.
# A self-hosted runner executes whatever a workflow tells it to. On a public repo
# ANY fork PR is arbitrary code execution on this machine, as the user running it.
# Fails CLOSED — an unreadable visibility (no auth, no network, wrong repo) refuses
# just as hard as a confirmed public repo. "Could not check" is never "probably fine".
assert_private_repo() {
  local repo="$1" visibility
  visibility=$(gh repo view "$repo" --json visibility -q .visibility 2>/dev/null || true)
  if [ -z "$visibility" ]; then
    echo "REFUSING: could not read visibility for $repo (not authenticated, no network," >&2
    echo "or no access). Refusing to register a runner against a repo whose visibility" >&2
    echo "is unknown. Run: gh auth login" >&2
    return 1
  fi
  if [ "$visibility" != "PRIVATE" ]; then
    echo "REFUSING: $repo is $visibility." >&2
    echo "A self-hosted runner on a public repo lets ANY fork PR execute arbitrary" >&2
    echo "code on this machine, as you. There is no flag to override this." >&2
    return 1
  fi
}

# Count workflow files whose runs-on requires a self-hosted runner.
# Matches `runs-on: [self-hosted, ...]`, `runs-on: self-hosted`, and the YAML
# list form where labels sit on their own lines under runs-on:.
self_hosted_workflow_files() {
  local dir="$1/.github/workflows"
  [ -d "$dir" ] || return 0
  grep -rlE '^[[:space:]]*(runs-on:.*self-hosted|-[[:space:]]*self-hosted)' \
    "$dir" --include='*.yml' --include='*.yaml' 2>/dev/null | sort -u || true
}
