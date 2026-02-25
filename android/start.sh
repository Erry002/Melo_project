#!/bin/bash

# ============================================================
# Meluccio Chat — Android/Termux Start Script
# Branch: feature/android-support
# ============================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$HOME/Melo_project"
LOG_FILE="$PROJECT_DIR/logs/server-android.log"

mkdir -p "$PROJECT_DIR/logs"

echo -e "${BLUE}📱 Avvio Meluccio Chat su Android/Termux...${NC}\n"

# ── Verifica progetto ────────────────────────────────────────
if [ ! -f "$PROJECT_DIR/server.js" ]; then
    echo -e "${RED}❌ server.js non trovato in $PROJECT_DIR${NC}"
    echo -e "${YELLOW}   Esegui prima: bash android/install.sh${NC}"
    exit 1
fi

# ── Verifica .env ────────────────────────────────────────────
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${RED}❌ File .env mancante.${NC}"
    echo -e "${YELLOW}   Esegui prima: bash android/install.sh${NC}"
    exit 1
fi

# ── WakeLock (se disponibile) ────────────────────────────────
if command -v termux-wake-lock &> /dev/null; then
    echo -e "${BLUE}🔒 Acquisisco WakeLock per evitare Doze Mode...${NC}"
    termux-wake-lock
    echo -e "${GREEN}✅ WakeLock attivo.${NC}"
else
    echo -e "${YELLOW}⚠️  termux-wake-lock non disponibile.${NC}"
    echo -e "${YELLOW}   Installa termux-api: pkg install termux-api${NC}"
    echo -e "${YELLOW}   Il processo potrebbe essere interrotto da Android Doze Mode.${NC}"
fi

# ── Avvio server ─────────────────────────────────────────────
cd "$PROJECT_DIR"

# Leggi porta da .env oppure usa default
PORT=$(grep -E '^PORT=' .env | cut -d'=' -f2 | tr -d '[:space:]')
PORT=${PORT:-3001}

echo -e "\n${BLUE}🚀 Avvio server sulla porta $PORT...${NC}"
echo -e "${BLUE}   Log: $LOG_FILE${NC}"
echo -e "${YELLOW}   Premi Ctrl+C per fermare.${NC}\n"

echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Meluccio Chat — Backend attivo${NC}"
echo -e "${GREEN}  URL: http://localhost:$PORT${NC}"
echo -e "${GREEN}  Apri Chrome Android su questo URL${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}\n"

# Avvio in foreground con log su file e stdout
node server.js 2>&1 | tee "$LOG_FILE"
