#!/bin/bash

# Colori
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configurazione
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
NGROK_CONFIG="$SCRIPT_DIR/ngrok.yml"
CACHE_FILE="$SCRIPT_DIR/.ngrok-cache"
LOG_DIR="$SCRIPT_DIR/logs"
MAX_RETRIES=3
TIMEOUT=60

# Crea directory per i log
mkdir -p "$LOG_DIR"

# Funzione per ottimizzare il sistema
optimize_system() {
    if [[ "$(uname -m)" == "armv"* ]]; then  # Solo per Raspberry Pi
        echo -e "${BLUE}🔧 Ottimizzazione sistema...${NC}"
        sudo sync && sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
        sudo renice -n 10 $(pgrep -v "^(ngrok|node)$") >/dev/null 2>&1
    fi
}

# Funzione per avviare Ngrok
start_ngrok() {
    echo -e "${BLUE}🚀 Avvio Ngrok...${NC}"
    
    # Crea configurazione Ngrok se non esiste
    if [ ! -f "$NGROK_CONFIG" ]; then
        cat > "$NGROK_CONFIG" << EOF
version: "2"
console_ui: false
web_addr: localhost:4040
region: eu
log_level: warn
log_format: json

tunnels:
  meluccio:
    addr: 3001
    proto: http
    inspect: false
    schemes: 
      - https
    metadata: "app=meluccio"
    compression: true
EOF
    fi
    
    if [ -f "$CACHE_FILE" ]; then
        CACHED_URL=$(cat "$CACHE_FILE")
        CACHED_TIME=$(stat -c %Y "$CACHE_FILE")
        CURRENT_TIME=$(date +%s)
        
        if [ $((CURRENT_TIME - CACHED_TIME)) -lt 7200 ]; then
            echo -e "${GREEN}✨ Usando URL cached: $CACHED_URL${NC}"
            echo "$CACHED_URL"
            return 0
        fi
    fi
    
    for ((i=1; i<=MAX_RETRIES; i++)); do
        echo -e "${BLUE}🔄 Tentativo $i di $MAX_RETRIES${NC}"
        
        ngrok start --config="$NGROK_CONFIG" meluccio > "$LOG_DIR/ngrok.log" 2>&1 &
        NGROK_PID=$!
        
        for ((t=1; t<=TIMEOUT; t++)); do
            sleep 1
            if curl -s localhost:4040/api/tunnels | grep -q "https://"; then
                URL=$(curl -s localhost:4040/api/tunnels | grep -o "https://[^\"]*")
                echo "$URL" > "$CACHE_FILE"
                echo -e "${GREEN}✅ Ngrok avviato: $URL${NC}"
                return 0
            fi
            echo -n "."
        done
        
        kill $NGROK_PID 2>/dev/null
        wait $NGROK_PID 2>/dev/null
        echo -e "\n${RED}❌ Timeout, riprovo...${NC}"
    done
    
    echo -e "${RED}❌ Impossibile avviare Ngrok${NC}"
    return 1
}

# Funzione per avviare il server
start_server() {
    echo -e "${BLUE}🖥️  Avvio server Node...${NC}"
    node server.js > "$LOG_DIR/server.log" 2>&1 &
    SERVER_PID=$!
    echo $SERVER_PID > "$LOG_DIR/server.pid"
    sleep 2
    
    if ps -p $SERVER_PID > /dev/null; then
        echo -e "${GREEN}✅ Server Node avviato${NC}"
    else
        echo -e "${RED}❌ Errore avvio server Node${NC}"
        exit 1
    fi
}

# Funzione per avviare il frontend
start_frontend() {
    echo -e "${BLUE}🌐 Avvio frontend...${NC}"
    cd Meluccio-frontend
    npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$LOG_DIR/frontend.pid"
    cd ..
    
    sleep 2
    if ps -p $FRONTEND_PID > /dev/null; then
        echo -e "${GREEN}✅ Frontend avviato${NC}"
    else
        echo -e "${RED}❌ Errore avvio frontend${NC}"
        exit 1
    fi
}

# Funzione per fermare i servizi
stop_services() {
    echo -e "${BLUE}🛑 Arresto servizi...${NC}"
    
    pkill -f ngrok
    rm -f "$CACHE_FILE"
    
    if [ -f "$LOG_DIR/server.pid" ]; then
        kill $(cat "$LOG_DIR/server.pid") 2>/dev/null
        rm -f "$LOG_DIR/server.pid"
    fi
    
    if [ -f "$LOG_DIR/frontend.pid" ]; then
        kill $(cat "$LOG_DIR/frontend.pid") 2>/dev/null
        rm -f "$LOG_DIR/frontend.pid"
    fi
    
    echo -e "${GREEN}✅ Servizi arrestati${NC}"
}

# Gestione CTRL+C
trap 'stop_services; exit 0' SIGINT

# Menu principale
echo -e "${BLUE}╔════════════════════════════════╗"
echo -e "║     Meluccio Chat Starter      ║"
echo -e "╚════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}1${NC}. Avvia tutto (sviluppo)"
echo -e "${GREEN}2${NC}. Avvia solo server + Ngrok"
echo -e "${GREEN}3${NC}. Esci"
echo

read -p "Seleziona un'opzione (1-3): " choice

case $choice in
    1)
        optimize_system
        start_ngrok
        start_server
        start_frontend
        
        echo -e "\n${GREEN}🎉 Tutti i servizi sono attivi!${NC}"
        echo -e "Premi ${YELLOW}CTRL+C${NC} per terminare tutto"
        
        # Mantieni lo script in esecuzione
        while true; do sleep 1; done
        ;;
        
    2)
        optimize_system
        start_ngrok
        start_server
        
        echo -e "\n${GREEN}🎉 Server e Ngrok sono attivi!${NC}"
        echo -e "Premi ${YELLOW}CTRL+C${NC} per terminare tutto"
        
        # Mantieni lo script in esecuzione
        while true; do sleep 1; done
        ;;
        
    3)
        echo -e "${GREEN}👋 Arrivederci!${NC}"
        exit 0
        ;;
        
    *)
        echo -e "${RED}Opzione non valida!${NC}"
        exit 1
        ;;
esac
