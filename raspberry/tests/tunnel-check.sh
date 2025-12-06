#!/usr/bin/env bash
set -euo pipefail

NGROK_API="${NGROK_API:-http://127.0.0.1:4040/api/tunnels}"

log() {
  printf '[tunnel] %s\n' "$1"
}

if command -v tailscale >/dev/null 2>&1; then
  log "Tailscale status"
  tailscale status || true
else
  log "Tailscale non installato"
fi

if command -v curl >/dev/null 2>&1; then
  log "Verifico tunnel ngrok"
  RESPONSE="$(curl --fail --silent --show-error "${NGROK_API}" || true)"
  if [ -n "${RESPONSE}" ]; then
    if command -v jq >/dev/null 2>&1; then
      printf '%s\n' "${RESPONSE}" | jq '.tunnels[] | {name:.name, public_url:.public_url}' || true
    else
      printf '%s\n' "${RESPONSE}"
    fi
    log "Tunnel ngrok attivi"
  else
    log "Nessun tunnel ngrok rilevato o API non raggiungibile"
  fi
else
  log "curl non disponibile"
fi

log "Controllo completato"
