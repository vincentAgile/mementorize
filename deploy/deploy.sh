#!/usr/bin/env bash
# Entry point of the deployments (phase 10), on the server.
#
# Run by the CI over SSH, with the deploy key: that key can run this script
# and nothing else (command="..." in ~/.ssh/authorized_keys, see
# deploy/README.md), and the commit to deploy comes as the SSH "command":
#
#   ssh ubuntu@server <commit>        GitHub's token on stdin
#
# Or by hand, on the server (e.g. to go back to an earlier version):
#
#   ~/mementorize/deploy/deploy.sh <commit>
#
# It brings the clone to that commit, then hands over to release.sh *as it
# is in that commit*: the deployment steps are always those of the version
# being deployed.

set -euo pipefail

# Everything is in a function, called on the script's last line: bash reads
# a script as it runs it, and `git checkout` below may replace this very
# file. A function is read in full before it runs.
main() {
  local sha=${SSH_ORIGINAL_COMMAND:-${1:-}}
  if [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then
    echo "usage: deploy.sh <commit> (full SHA, 40 hexadecimal characters)" >&2
    exit 2
  fi

  cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.."

  # One deployment at a time (the lock is released when the process ends,
  # and is inherited by release.sh).
  exec 9> "$HOME/.mementorize-deploy.lock"
  if ! flock --nonblock 9; then
    echo "Another deployment is in progress." >&2
    exit 1
  fi

  echo "==> Fetching $sha"
  git fetch --quiet origin < /dev/null
  # Only commits of main: those are the ones whose images the CI published.
  if ! git merge-base --is-ancestor "$sha" origin/main 2> /dev/null; then
    echo "Unknown commit, or not on main: $sha" >&2
    exit 1
  fi
  # The deployed files must be exactly the commit's: a file tracked by git
  # and modified on the server stops the deployment, before anything moves.
  # (.env isn't tracked: it's the server's own.)
  if ! git diff --quiet HEAD --; then
    echo "Files modified on the server (git status):" >&2
    git status --short >&2
    exit 1
  fi
  git checkout --quiet --detach "$sha" < /dev/null

  exec ./deploy/release.sh "$sha"
}

main "$@"
exit
