#!/bin/bash

# Colori
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Installazione Meluccio Chat su Raspberry Pi...${NC}\n"

# Verifica sistema
echo -e "${BLUE}📊 Verifica sistema...${NC}"
if [ ! -f /etc/debian_version ]; then
    echo -e "${RED}❌ Questo script richiede Raspberry Pi OS (Debian)${NC}"
    exit 1
fi

# Installa dipendenze di sistema
echo -e "\n${BLUE}📦 Installazione dipendenze di sistema...${NC}"
sudo apt-get update
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx redis-server

# Installa Node.js LTS
echo -e "\n${BLUE}🔄 Aggiornamento Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifica Node.js e npm
echo -e "\n${BLUE}📦 Verifica Node.js e npm...${NC}"

# Controlla se Node.js è installato
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js non trovato. Installazione...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Mostra versioni
echo -e "Node.js version: $(node --version)"
echo -e "npm version: $(npm --version)"

# Definizione variabili
USER_HOME="/home/erry002"
PROJECT_DIR="$USER_HOME/Melo_project"
LOGS_DIR="$PROJECT_DIR/logs"

# Verifica permessi directory
echo -e "\n${BLUE}🔍 Verifica permessi...${NC}"
sudo chown -R erry002:erry002 $PROJECT_DIR
sudo chmod -R 755 $PROJECT_DIR

# Installa dipendenze
echo -e "\n${BLUE}📦 Installazione dipendenze...${NC}"
cd $PROJECT_DIR
npm install --production

# Verifica dipendenze critiche
echo -e "\n${BLUE}🔍 Verifica dipendenze critiche...${NC}"
if ! npm list socket.io &> /dev/null; then
    echo -e "${RED}❌ socket.io non trovato. Installazione...${NC}"
    npm install socket.io
fi

if ! npm list express &> /dev/null; then
    echo -e "${RED}❌ express non trovato. Installazione...${NC}"
    npm install express
fi

# Installa PM2 per gestione processi
echo -e "\n${BLUE}⚙️ Configurazione PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

# Crea script di avvio del server
cat > start-server.sh << EOF
#!/bin/bash
export NODE_ENV=production
export UV_THREADPOOL_SIZE=2
export NODE_OPTIONS="--max-old-space-size=512"

# Avvia il server con PM2
pm2 start server.js --name meluccio-server --max-memory-restart 512M
EOF

chmod +x start-server.sh

# Configura PM2 per avvio automatico
pm2 startup
pm2 save

# Crea directory per i log
echo -e "\n${BLUE}📁 Creazione directory logs...${NC}"
mkdir -p $LOGS_DIR
chown -R erry002:erry002 $LOGS_DIR

# Crea lo script di avvio
cat > $PROJECT_DIR/start-server.sh << EOF
#!/bin/bash
cd $PROJECT_DIR
exec /usr/bin/node server.js 2>&1
EOF

chmod +x $PROJECT_DIR/start-server.sh
chown erry002:erry002 $PROJECT_DIR/start-server.sh

# Crea il servizio
sudo tee /etc/systemd/system/meluccio.service << EOF
[Unit]
Description=Meluccio Chat Server
After=network.target

[Service]
Type=simple
User=erry002
Group=erry002
WorkingDirectory=$PROJECT_DIR
ExecStart=/bin/bash $PROJECT_DIR/start-server.sh
Restart=on-failure
RestartSec=10

# Limiti di sistema
LimitNOFILE=4096

# Logging
StandardOutput=append:$LOGS_DIR/server.log
StandardError=append:$LOGS_DIR/error.log

[Install]
WantedBy=multi-user.target
EOF

# Configura Nginx
sudo tee /etc/nginx/sites-available/meluccio << EOF
server {
    listen 80 default_server;
    server_name _;
    root $PROJECT_DIR/Meluccio-frontend/dist;

    access_log $LOGS_DIR/nginx-access.log;
    error_log $LOGS_DIR/nginx-error.log warn;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }
}
EOF

# Abilita il sito
sudo ln -sf /etc/nginx/sites-available/meluccio /etc/nginx/sites-enabled/default

# Ricarica servizi
echo -e "\n${BLUE}🔄 Riavvio servizi...${NC}"
sudo systemctl daemon-reload
sudo systemctl enable meluccio
sudo systemctl restart nginx

# Verifica permessi finali
chown -R erry002:erry002 $PROJECT_DIR
chmod -R 755 $PROJECT_DIR

echo -e "\n${GREEN}✅ Installazione completata!${NC}"
echo -e "\n📱 App disponibile su:"
echo -e "   Local: ${GREEN}http://localhost${NC}"
echo -e "   Network: ${GREEN}http://$(hostname -I | cut -d' ' -f1)${NC}"
echo -e "\n📊 Monitoraggio:"
echo -e "   Logs: ${GREEN}$LOGS_DIR/${NC}"
echo -e "   Status: ${GREEN}systemctl status meluccio${NC}"
