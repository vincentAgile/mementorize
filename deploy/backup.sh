#!/usr/bin/env bash
# Daily backup of the database (phase 11), run by mementorize-backup.timer
# (deploy/systemd). By hand: sudo systemctl start mementorize-backup
#
#   1. pg_dump, compressed, in ~/backups/daily (the last 14 are kept);
#   2. if BACKUP_REMOTE is set: copy, encrypted by rclone, off the server
#      (OVH Object Storage), where files older than BACKUP_REMOTE_DAYS
#      (30 by default) are deleted;
#   3. if HC_BACKUP_URL is set: tells healthchecks.io whether it worked. No
#      news for a day (server down, timer broken) is an alert too.
#
# Settings: ~/.config/mementorize/backup.env (EnvironmentFile of the
# service; see deploy/README.md). Restoring: deploy/README.md.

set -Eeuo pipefail

ping() { # ping <suffix>: "" (success), /start, /fail
  [[ -n ${HC_BACKUP_URL:-} ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$HC_BACKUP_URL$1" || true
}
trap 'ping /fail' ERR

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.."
ping /start

dir=$HOME/backups/daily
mkdir -p "$dir"
file=$dir/mementorize-$(date +%Y%m%d-%H%M%S).sql.gz

echo "==> Dumping the database to $file"
if ! (
  umask 077
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --clean --if-exists "$POSTGRES_DB"' | gzip > "$file"
); then
  rm -f "$file"
  echo "The dump failed." >&2
  false # → ERR trap: healthchecks.io is told
fi
# The names start with the date: in reverse order, the most recent first.
printf '%s\n' "$dir"/mementorize-*.sql.gz | sort -r | tail -n +15 | xargs -r rm --

if [[ -n ${BACKUP_REMOTE:-} ]]; then
  echo "==> Copying it to $BACKUP_REMOTE"
  rclone copy "$file" "$BACKUP_REMOTE"
  rclone delete --min-age "${BACKUP_REMOTE_DAYS:-30}d" "$BACKUP_REMOTE"
fi

ping ""
echo "==> Done ($(du -h "$file" | cut -f1))"
