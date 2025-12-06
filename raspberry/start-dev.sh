#!/bin/bash

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Directory del progetto
PROJECT_DIR="/home/erry002/Melo_project"
FRONTEND_DIR="$PROJECT_DIR/Meluccio-frontend"

# Menu principale
show_menu() {
    clear
    echo -e "${BLUE}🚀 Meluccio Development Menu${NC}"
    echo -e "\n${BLUE}Seleziona un'opzione:${NC}"
    echo -e "${GREEN}1${NC}. Avvia tutto (Frontend + Backend)"
    echo -e "${GREEN}2${NC}. Build Frontend"
    echo -e "${GREEN}3${NC}. Avvia solo Backend"
    echo -e "${GREEN}4${NC}. Avvia solo Frontend"
    echo -e "${GREEN}5${NC}. Ferma tutto"
    echo -e "${GREEN}6${NC}. Esci"
    echo
    read -p "Scelta (1-6): " choice
}

# Funzione per il frontend
start_frontend() {
    echo -e "\n${BLUE}🌐 Avvio Frontend...${NC}"
    cd $FRONTEND_DIR
    npm install
    npm run dev &
    echo -e "${GREEN}✅ Frontend avviato su http://localhost:5173${NC}"
}

# Funzione per il backend
start_backend() {
    echo -e "\n${BLUE}⚙️ Avvio Backend...${NC}"
    cd $PROJECT_DIR
    npm install
    node server.js &
    echo -e "${GREEN}✅ Backend avviato su http://localhost:3001${NC}"
}

# Funzione per il build
build_frontend() {
    echo -e "\n${BLUE}🏗️ Build Frontend...${NC}"
    cd $FRONTEND_DIR
    npm install
    npm run build
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Build completato${NC}"
    else
        echo -e "${RED}❌ Errore durante il build${NC}"
    fi
}

# Funzione per fermare tutto
stop_all() {
    echo -e "\n${BLUE}🛑 Arresto servizi...${NC}"
    pkill -f "node server.js"
    pkill -f "vite"
    echo -e "${GREEN}✅ Servizi arrestati${NC}"
}

# Loop principale
while true; do
    show_menu
    case $choice in
        1)
            stop_all
            start_backend
            start_frontend
            echo -e "\n${GREEN}✅ Tutto avviato!${NC}"
            echo -e "Frontend: ${BLUE}http://localhost:5173${NC}"
            echo -e "Backend: ${BLUE}http://localhost:3001${NC}"
            read -p "Premi Enter per continuare"
            ;;
        2)
            build_frontend
            read -p "Premi Enter per continuare"
            ;;
        3)
            pkill -f "node server.js"
            start_backend
            read -p "Premi Enter per continuare"
            ;;
        4)
            pkill -f "vite"
            start_frontend
            read -p "Premi Enter per continuare"
            ;;
        5)
            stop_all
            read -p "Premi Enter per continuare"
            ;;
        6)
            echo -e "\n${GREEN}👋 Arrivederci!${NC}"
            exit 0
            ;;
        *)
            echo -e "\n${RED}❌ Scelta non valida!${NC}"
            read -p "Premi Enter per continuare"
            ;;
    esac
done
