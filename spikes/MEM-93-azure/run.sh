#!/usr/bin/env sh
# MEM-93 — lance l'essai dans un conteneur jetable (Node 24 + ffmpeg), sans toucher
# à l'application : aucun de ses réseaux Docker, 512 Mo et 1 processeur au plus.
# Usage, dans ce dossier : sh run.sh
set -eu
cd "$(dirname "$0")"
[ -f .env ] || { echo "Fichier .env manquant (voir LISEZMOI.md)"; exit 1; }
[ -f enregistrements.zip ] || [ -d enregistrements ] || { echo "enregistrements.zip manquant (voir LISEZMOI.md)"; exit 1; }
docker run --rm --memory 512m --cpus 1 --env-file .env -v "$PWD":/essai -w /essai node:24-alpine sh -c '
  apk add --no-cache ffmpeg >/dev/null
  if [ -f enregistrements.zip ]; then rm -rf enregistrements && mkdir enregistrements && unzip -q enregistrements.zip -d enregistrements; fi
  node essai.mjs; status=$?
  chown -R '"$(id -u):$(id -g)"' resultats enregistrements 2>/dev/null
  exit $status'
tar czf resultats.tar.gz resultats
echo "Résultats : $PWD/resultats.tar.gz"
