#!/usr/bin/env bash
# External probe (phase 11), run every 5 minutes by
# mementorize-heartbeat.timer (deploy/systemd).
#
# Tells healthchecks.io whether the app answers (/health: Traefik, web, API,
# database). healthchecks.io e-mails you when it says no, and also when it
# hears nothing at all: the server itself is down, which Uptime Kuma, on that
# same server, can't report.
#
# Settings: HC_HEARTBEAT_URL and APP_URL in ~/.config/mementorize/backup.env.

set -uo pipefail

: "${HC_HEARTBEAT_URL:?HC_HEARTBEAT_URL is not set}" "${APP_URL:?APP_URL is not set}"

if curl -fsS -m 15 -o /dev/null "$APP_URL/health"; then
  suffix=""
else
  suffix=/fail
fi
curl -fsS -m 10 --retry 3 -o /dev/null "$HC_HEARTBEAT_URL$suffix"
