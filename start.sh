#!/bin/bash

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Avvio Meluccio Chat...${NC}\n"

# Funzione per la pulizia in caso di interruzione
cleanup() {
    echo -e "\n${RED}Arresto dei processi...${NC}"
    kill $(jobs -p) 2>/dev/null
    exit
}

# Intercetta CTRL+C
trap cleanup SIGINT

# Verifica le dipendenze
echo -e "${BLUE}📦 Verifica dipendenze...${NC}"
cd Meluccio-frontend && npm install
cd .. && npm install

# Costruisce il frontend
echo -e "\n${BLUE}🏗️  Build frontend...${NC}"
cd Meluccio-frontend && npm run build
cd ..

# Avvia ngrok e cattura l'URL
echo -e "\n${BLUE}🌐 Avvio tunnel Ngrok...${NC}"
ngrok http 3001 --log=stdout > ngrok.log 2>&1 &
NGROK_PID=$!

# Attende che Ngrok sia pronto e ottiene l'URL
while ! grep -q "started tunnel" ngrok.log; do
    sleep 1
done
NGROK_URL=$(grep -o "https://.*ngrok-free.app" ngrok.log | head -n1)
echo -e "${GREEN}✅ Ngrok attivo: ${NGROK_URL}${NC}"

# Aggiorna l'URL nel frontend
echo -e "\n${BLUE}🔄 Aggiornamento configurazione...${NC}"
sed -i '' "s|const SOCKET_URL = .*|const SOCKET_URL = \"${NGROK_URL}\";|" Meluccio-frontend/src/App.jsx

# Avvia il server
echo -e "\n${BLUE}🖥️  Avvio server...${NC}"
node server.js &
SERVER_PID=$!

# Avvia il frontend in development mode
echo -e "\n${BLUE}🌟 Avvio frontend...${NC}"
cd Meluccio-frontend && npm run dev &
FRONTEND_PID=$!

# Mostra le istruzioni
echo -e "\n${GREEN}✨ Tutto pronto!${NC}"
echo -e "📱 App disponibile su:"
echo -e "   Local: ${GREEN}http://localhost:5173${NC}"
echo -e "   Online: ${GREEN}${NGROK_URL}${NC}"
echo -e "\n${BLUE}Premi CTRL+C per terminare tutto${NC}"

# Attende che uno dei processi termini
wait $NGROK_PID $SERVER_PID $FRONTEND_PID
