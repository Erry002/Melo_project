#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-http://127.0.0.1:3001/health}"
DURATION="${DURATION:-20}"
CONNECTIONS="${CONNECTIONS:-20}"

log() {
  printf '[stress] %s\n' "$1"
}

log "Endpoint: ${TARGET}"
log "Durata: ${DURATION}s | Connessioni: ${CONNECTIONS}"

if ! command -v npx >/dev/null 2>&1; then
  log "npx non disponibile"
  exit 1
fi

npx --yes autocannon "${TARGET}" \
  --connections "${CONNECTIONS}" \
  --duration "${DURATION}" \
  --renderStatusCodes
