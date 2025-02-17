#!/bin/bash

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Directory del progetto
PROJECT_DIR="/home/erry002/Melo_project"
CONFIG_DIR="$HOME/.config/ngrok"

# Funzione per il menu
show_menu() {
    clear
    echo -e "${BLUE}🌍 Meluccio Ngrok Manager${NC}"
    echo -e "\n${BLUE}Seleziona un'opzione:${NC}"
    echo -e "${GREEN}1${NC}. Avvia tunnel"
    echo -e "${GREEN}2${NC}. Configura Ngrok"
    echo -e "${GREEN}3${NC}. Mostra URL attivi"
    echo -e "${GREEN}4${NC}. Ferma tunnel"
    echo -e "${GREEN}5${NC}. Esci"
    echo
    read -p "Scelta (1-5): " choice
}

# Configura Ngrok
configure_ngrok() {
    echo -e "\n${BLUE}⚙️  Configurazione Ngrok...${NC}"
    
    # Installa Ngrok se non presente
    if ! command -v ngrok &> /dev/null; then
        echo -e "${YELLOW}⚠️  Ngrok non trovato. Installazione...${NC}"
        curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
        echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
        sudo apt update && sudo apt install -y ngrok
    fi
    
    # Richiedi token
    read -p "Inserisci il tuo authtoken Ngrok: " token
    
    # Configura Ngrok
    mkdir -p $CONFIG_DIR
    cat > $CONFIG_DIR/ngrok.yml << EOF
version: "2"
authtoken: "$token"
tunnels:
  web:
    addr: 80
    proto: http
  websocket:
    addr: 3001
    proto: http
    inspect: false
EOF
    
    echo -e "${GREEN}✅ Configurazione salvata${NC}"
}

# Avvia tunnel
start_tunnel() {
    echo -e "\n${BLUE}🚀 Avvio tunnel...${NC}"
    
    # Verifica configurazione
    if [ ! -f $CONFIG_DIR/ngrok.yml ]; then
        echo -e "${RED}❌ Configurazione Ngrok non trovata${NC}"
        configure_ngrok
    fi
    
    # Ferma tunnel esistenti
    pkill -f ngrok
    
    # Avvia tunnel
    ngrok start --all --config $CONFIG_DIR/ngrok.yml &
    
    # Attendi che i tunnel siano pronti
    echo -e "${YELLOW}⏳ Attendi l'avvio dei tunnel...${NC}"
    sleep 5
    
    # Mostra URL
    show_urls
}

# Mostra URL
show_urls() {
    echo -e "\n${BLUE}🔗 URL Attivi:${NC}"
    
    # Ottieni gli URL da Ngrok API
    URLS=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$URLS" ]; then
        echo -e "${GREEN}Frontend:${NC}"
        echo "$URLS" | grep "https" | head -n 1
        echo -e "\n${GREEN}WebSocket:${NC}"
        echo "$URLS" | grep "https" | tail -n 1
        
        # Aggiorna il file di configurazione del frontend
        FRONTEND_URL=$(echo "$URLS" | grep "https" | head -n 1)
        WEBSOCKET_URL=$(echo "$URLS" | grep "https" | tail -n 1)
        
        echo -e "\n${BLUE}📝 Aggiorno configurazione frontend...${NC}"
        cat > $PROJECT_DIR/Meluccio-frontend/src/config.js << EOF
export const SOCKET_URL = "$WEBSOCKET_URL";
export const FRONTEND_URL = "$FRONTEND_URL";
EOF
        
        echo -e "${GREEN}✅ Configurazione aggiornata${NC}"
    else
        echo -e "${RED}❌ Nessun tunnel attivo${NC}"
    fi
}

# Ferma tunnel
stop_tunnel() {
    echo -e "\n${BLUE}🛑 Arresto tunnel...${NC}"
    pkill -f ngrok
    echo -e "${GREEN}✅ Tunnel arrestati${NC}"
}

# Loop principale
while true; do
    show_menu
    case $choice in
        1)
            start_tunnel
            read -p "Premi Enter per continuare"
            ;;
        2)
            configure_ngrok
            read -p "Premi Enter per continuare"
            ;;
        3)
            show_urls
            read -p "Premi Enter per continuare"
            ;;
        4)
            stop_tunnel
            read -p "Premi Enter per continuare"
            ;;
        5)
            echo -e "\n${GREEN}👋 Arrivederci!${NC}"
            exit 0
            ;;
        *)
            echo -e "\n${RED}❌ Scelta non valida!${NC}"
            read -p "Premi Enter per continuare"
            ;;
    esac
done
