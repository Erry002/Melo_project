#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DB_PATH="${DB_PATH:-${REPO_ROOT}/database/melo_chat.db}"

log() {
  printf '[sqlite] %s\n' "$1"
}

if [ ! -f "${DB_PATH}" ]; then
  log "Database non trovato in ${DB_PATH}"
  exit 1
fi

log "Eseguo PRAGMA integrity_check"
sqlite3 "${DB_PATH}" "PRAGMA integrity_check;" || exit 1

log "Eseguo PRAGMA foreign_key_check"
sqlite3 "${DB_PATH}" "PRAGMA foreign_key_check;" || exit 1

log "Analisi dimensioni"
PAGE_COUNT="$(sqlite3 "${DB_PATH}" "PRAGMA page_count;" || echo 0)"
PAGE_SIZE="$(sqlite3 "${DB_PATH}" "PRAGMA page_size;" || echo 0)"
if [ "${PAGE_COUNT}" -gt 0 ] && [ "${PAGE_SIZE}" -gt 0 ]; then
  awk "BEGIN { printf \"Dimensione stimata: %.2f MB\\n\", (${PAGE_COUNT} * ${PAGE_SIZE}) / 1048576 }"
fi

log "Vacuum opzionale (set VACUUM=1 per abilitarlo)"
if [ "${VACUUM:-0}" = "1" ]; then
  sqlite3 "${DB_PATH}" "VACUUM;"
  log "Vacuum completato"
fi

log "Controlli completati"
