#!/usr/bin/env bash
# Deploys the commit that's checked out, without interrupting the service.
# Run by deploy.sh (never directly: deploy.sh checks out the commit and
# holds the lock). Steps:
#
#   1. log in to ghcr.io, with the token received on stdin (if any)
#   2. pull the commit's images (built and published by the CI)
#   3. back up the database
#   4. apply the migrations
#   5. replace api, then web, without interruption (docker rollout)
#   6. record the deployed version in .env (IMAGE_TAG), clean up
#
# If a step fails, the following ones don't run, and the containers in
# service stay as they were (docker rollout removes new containers that
# never become healthy). The migrations, though, stay applied: they must
# keep working with the previous version (deploy/README.md).

set -euo pipefail

sha=$1
[[ $(git rev-parse HEAD) == "$sha" ]] || { echo "HEAD isn't $sha" >&2; exit 1; }

# The images of this commit (docker-compose.prod.yml). Exported, it wins
# over the IMAGE_TAG of .env, which still names the version in service.
export IMAGE_TAG=$sha

step() { echo "==> $*"; }

# --- 1. Registry login ------------------------------------------------------
# The CI sends a short-lived GitHub token (it expires at the end of the
# job). It's stored in a temporary Docker configuration, deleted on exit:
# no credentials stay on the server. By hand, without a token, the usual
# configuration applies.
token=
if [[ ! -t 0 ]]; then
  IFS= read -r token || true
fi
if [[ -n $token ]]; then
  DOCKER_CONFIG=$(mktemp -d)
  export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  step "Logging in to ghcr.io"
  docker login ghcr.io --username deploy --password-stdin <<< "$token" > /dev/null
fi

# --- 2. Images ----------------------------------------------------------------
step "Pulling the images of ${sha:0:7}"
docker compose pull --quiet migrate api web

# --- 3. Backup ----------------------------------------------------------------
# A safety net before the migrations, not a backup strategy (that's phase
# 11): the 10 most recent are kept, in ~/backups. Restoring: deploy/README.md.
docker compose up --detach --wait postgres
backups=$HOME/backups
mkdir -p "$backups"
backup=$backups/mementorize-$(date +%Y%m%d-%H%M%S)-${sha:0:7}.sql.gz
step "Backing up the database to $backup"
if ! (
  umask 077
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --clean --if-exists "$POSTGRES_DB"' | gzip > "$backup"
); then
  rm -f "$backup"
  echo "The backup failed: nothing was deployed." >&2
  exit 1
fi
# The names start with the date: in reverse order, the most recent first.
printf '%s\n' "$backups"/mementorize-*.sql.gz | sort -r | tail -n +11 | xargs -r rm --

# --- 4. Migrations ------------------------------------------------------------
# `up` (not `run`) so that the migrate service's container is the new one:
# docker rollout starts it again, as a dependency of api, and it must find
# nothing left to do.
step "Applying the migrations"
docker compose up --no-deps --exit-code-from migrate migrate

# --- 5. Replacing the containers ----------------------------------------------
# docker rollout starts a second container of the service, waits until it's
# healthy, then stops the old one (after its pre-stop hook, for web). api
# first: the new web may rely on the new API, the old web works with both.
step "Replacing api"
docker rollout --timeout 120 api
step "Replacing web"
docker rollout --timeout 120 web

# --- 6. Recording the version, cleaning up --------------------------------------
# From now on, any `docker compose ...` on the server uses this version.
sed -i '/^IMAGE_TAG=/d' .env
echo "IMAGE_TAG=$sha" >> .env

# Images no container uses, older than a week: the recent ones stay, for a
# quick return to a previous version.
docker image prune --all --force --filter until=168h > /dev/null

step "Deployed: ${sha:0:7}"
docker compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
