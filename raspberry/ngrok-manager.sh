#!/bin/bash

# Colori
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Directory dello script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
NGROK_CONFIG="$SCRIPT_DIR/ngrok.yml"
CACHE_FILE="$SCRIPT_DIR/.ngrok-cache"
MAX_RETRIES=3
TIMEOUT=60

# Funzione per ottimizzare le prestazioni del sistema
optimize_system() {
    echo -e "${BLUE}🔧 Ottimizzazione sistema...${NC}"
    
    # Limita la CPU per altri processi
    sudo renice -n 10 $(pgrep -v "^(ngrok|node)$") >/dev/null 2>&1
    
    # Pulisci la cache del sistema
    sudo sync && sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
    
    # Disabilita servizi non necessari temporaneamente
    for service in bluetooth avahi-daemon triggerhappy; do
        sudo systemctl stop $service >/dev/null 2>&1
    done
}

# Funzione per ripristinare il sistema
restore_system() {
    echo -e "${BLUE}🔄 Ripristino sistema...${NC}"
    
    # Ripristina la priorità dei processi
    sudo renice -n 0 $(pgrep -v "^(ngrok|node)$") >/dev/null 2>&1
    
    # Riavvia i servizi
    for service in bluetooth avahi-daemon triggerhappy; do
        sudo systemctl start $service >/dev/null 2>&1
    done
}

# Funzione per avviare Ngrok con cache
start_ngrok() {
    echo -e "${BLUE}🚀 Avvio Ngrok...${NC}"
    
    # Verifica se esiste un URL cached valido
    if [ -f "$CACHE_FILE" ]; then
        CACHED_URL=$(cat "$CACHE_FILE")
        CACHED_TIME=$(stat -c %Y "$CACHE_FILE")
        CURRENT_TIME=$(date +%s)
        
        # Se la cache è più recente di 2 ore
        if [ $((CURRENT_TIME - CACHED_TIME)) -lt 7200 ]; then
            echo -e "${GREEN}✨ Usando URL cached: $CACHED_URL${NC}"
            echo "$CACHED_URL"
            return 0
        fi
    fi
    
    # Ottimizza il sistema prima di avviare Ngrok
    optimize_system
    
    # Avvia Ngrok con timeout
    for ((i=1; i<=MAX_RETRIES; i++)); do
        echo -e "${BLUE}🔄 Tentativo $i di $MAX_RETRIES${NC}"
        
        # Avvia Ngrok in background
        ngrok start --config="$NGROK_CONFIG" meluccio > /tmp/ngrok.log 2>&1 &
        NGROK_PID=$!
        
        # Aspetta che Ngrok sia pronto
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
        
        # Se il timeout è scaduto, termina Ngrok e riprova
        kill $NGROK_PID 2>/dev/null
        wait $NGROK_PID 2>/dev/null
        echo -e "\n${RED}❌ Timeout, riprovo...${NC}"
    done
    
    echo -e "${RED}❌ Impossibile avviare Ngrok dopo $MAX_RETRIES tentativi${NC}"
    restore_system
    return 1
}

# Funzione per fermare Ngrok
stop_ngrok() {
    echo -e "${BLUE}🛑 Arresto Ngrok...${NC}"
    pkill -f ngrok
    restore_system
    echo -e "${GREEN}✅ Ngrok arrestato${NC}"
}

# Menu principale
case "$1" in
    start)
        start_ngrok
        ;;
    stop)
        stop_ngrok
        ;;
    restart)
        stop_ngrok
        sleep 2
        start_ngrok
        ;;
    *)
        echo "Uso: $0 {start|stop|restart}"
        exit 1
        ;;
esac

exit 0
