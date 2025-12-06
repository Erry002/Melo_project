#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-18}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs"
NGROK_SOURCE="${REPO_ROOT}/raspberry/ngrok.yml"
NGROK_TARGET="${HOME}/.config/ngrok/ngrok.yml"

log() {
  printf '[setup] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Prerequisito mancante: $1"
    exit 1
  fi
}

sudo -v

log "Aggiorno pacchetti di sistema"
sudo apt-get update

log "Installazione pacchetti base"
sudo apt-get install -y \
  git \
  curl \
  build-essential \
  sqlite3 \
  libsqlite3-dev \
  jq \
  unzip \
  ca-certificates

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q "^v${NODE_MAJOR}"; then
  log "Installo Node.js ${NODE_MAJOR}.x via NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi

require_command node
require_command npm

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installo pm2 globalmente"
  sudo npm install -g pm2
fi

mkdir -p "${LOG_DIR}"

mkdir -p "${HOME}/.config/ngrok"
if [ -f "${NGROK_SOURCE}" ] && [ ! -f "${NGROK_TARGET}" ]; then
  log "Copio configurazione ngrok di base"
  cp "${NGROK_SOURCE}" "${NGROK_TARGET}"
fi

if command -v tailscale >/dev/null 2>&1; then
  log "Verifico stato Tailscale"
  tailscale status || true
else
  log "Tailscale non trovato: installalo se ti serve accesso remoto"
fi

log "Versioni principali"
node --version
npm --version
pm2 --version
sqlite3 --version | awk '{print $1, $2}' || true

log "Setup completato"
