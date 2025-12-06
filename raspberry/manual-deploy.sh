#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}"
FRONTEND_DIR="${REPO_ROOT}/Meluccio-frontend"
PM2_CONFIG="${REPO_ROOT}/raspberry/ecosystem.config.cjs"

log() {
  printf '[deploy] %s\n' "$1"
}

log "Repository: ${REPO_ROOT}"
cd "${REPO_ROOT}"

git fetch origin
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "${CURRENT_BRANCH}" != "${BRANCH}" ]; then
  log "Cambio branch da ${CURRENT_BRANCH} a ${BRANCH}"
  git switch "${BRANCH}"
fi

git pull --ff-only

log "Installazione dipendenze backend"
npm install

log "Installazione dipendenze frontend"
cd "${FRONTEND_DIR}"
npm install

log "Build frontend"
npm run build

log "Aggiorno processi PM2"
cd "${REPO_ROOT}"
if pm2 describe meluccio >/dev/null 2>&1; then
  pm2 reload "${PM2_CONFIG}" --update-env
else
  pm2 start "${PM2_CONFIG}"
fi
pm2 save

log "Stato PM2"
pm2 status

log "Verifica endpoint salute"
if command -v curl >/dev/null 2>&1; then
  curl --fail --silent --show-error http://127.0.0.1:3001/health | head -c 200 || true
fi

log "Deploy completato"
