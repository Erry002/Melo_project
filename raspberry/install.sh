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

# Configura Node.js
echo -e "\n${BLUE}⚙️  Configurazione Node.js...${NC}"

# Verifica Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js non trovato${NC}"
    exit 1
fi

# Verifica npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm non trovato${NC}"
    exit 1
fi

# Mostra versioni
echo -e "Node.js: $(node --version)"
echo -e "npm: $(npm --version)"

# Installa dipendenze globali
echo -e "\n${BLUE}📦 Installazione dipendenze globali...${NC}"
sudo npm install -g pm2

# Definizione variabili
USER_HOME="/home/erry002"
PROJECT_DIR="$USER_HOME/Melo_project"
LOGS_DIR="$PROJECT_DIR/logs"

# Verifica permessi directory
echo -e "\n${BLUE}🔍 Verifica permessi...${NC}"
sudo chown -R erry002:erry002 $PROJECT_DIR
sudo chmod -R 755 $PROJECT_DIR

# Installazione delle dipendenze del server
echo -e "${GREEN}📦 Installazione dipendenze del server...${NC}"
cd "$PROJECT_DIR"
npm install

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

# Rimuovi vecchio servizio systemd
echo -e "\n${BLUE}🧹 Pulizia configurazione precedente...${NC}"
sudo systemctl stop meluccio 2>/dev/null
sudo systemctl disable meluccio 2>/dev/null
sudo rm -f /etc/systemd/system/meluccio.service
sudo systemctl daemon-reload

# Ferma tutti i processi node
sudo killall -9 node 2>/dev/null
pm2 delete all 2>/dev/null
pm2 flush

# Configura PM2
echo -e "\n${BLUE}⚙️ Configurazione PM2...${NC}"

# Crea file di configurazione PM2
cat > $PROJECT_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'meluccio',
    script: 'server.js',
    cwd: '${PROJECT_DIR}',
    
    // Gestione ambiente
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    
    // Gestione processo
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    
    // Gestione errori
    max_restarts: 10,
    min_uptime: '5s',
    
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '${LOGS_DIR}/pm2-error.log',
    out_file: '${LOGS_DIR}/pm2-out.log',
    combine_logs: true,
    
    // Monitoraggio
    monitor: true,
    time: true,
    
    // Gestione risorse
    node_args: '--max-old-space-size=512',
    kill_timeout: 3000,
    wait_ready: true,
    listen_timeout: 3000,
    
    // Controllo porte
    increment_var: 'PORT',
    restart_delay: 4000
  }]
};
EOF

# Avvia con PM2
echo -e "\n${BLUE}🚀 Avvio applicazione...${NC}"
cd $PROJECT_DIR
pm2 start ecosystem.config.js

# Salva configurazione
pm2 save

# Configura avvio automatico
echo -e "\n${BLUE}⚡️ Configurazione avvio automatico...${NC}"
pm2 startup | grep "sudo env" | bash

# Verifica stato
echo -e "\n${BLUE}🔍 Verifica stato...${NC}"
pm2 list

# Mostra i log
echo -e "\n${BLUE}📝 Ultimi log...${NC}"
pm2 logs --lines 10

# Build frontend
echo -e "\n${BLUE}🏗️ Build frontend...${NC}"
cd $PROJECT_DIR/Meluccio-frontend

# Installa dipendenze
npm install

# Build
echo -e "${BLUE}⚙️ Eseguo build...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build completato${NC}"
else
    echo -e "${RED}❌ Errore durante il build${NC}"
    exit 1
fi

cd $PROJECT_DIR

# Configura Nginx
echo -e "\n${BLUE}🌐 Configurazione Nginx...${NC}"

# Ferma Nginx e pulisci configurazioni
sudo systemctl stop nginx
sudo rm -f /etc/nginx/sites-enabled/*
sudo rm -f /etc/nginx/sites-available/*

# Crea directory per i file statici
mkdir -p $PROJECT_DIR/Meluccio-frontend/dist
sudo chown -R erry002:erry002 $PROJECT_DIR/Meluccio-frontend

# Crea configurazione Nginx
sudo tee /etc/nginx/nginx.conf << EOF
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 768;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log $LOGS_DIR/nginx-access.log;
    error_log $LOGS_DIR/nginx-error.log debug;

    gzip on;
    gzip_disable "msie6";

    server {
        listen 80 default_server;
        server_name _;
        
        # Root directory per i file statici
        root $PROJECT_DIR/Meluccio-frontend/dist;
        index index.html;

        # Configurazione base per il frontend
        location / {
            try_files \$uri \$uri/ /index.html;
            add_header Cache-Control "no-cache";
        }

        # Proxy per il backend
        location /socket.io/ {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            
            # Timeout più lunghi per WebSocket
            proxy_connect_timeout 7d;
            proxy_send_timeout 7d;
            proxy_read_timeout 7d;
        }

        # Pagine di errore personalizzate
        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
        
        location = /50x.html {
            root /usr/share/nginx/html;
        }
    }
}
EOF

# Verifica configurazione
echo -e "\n${BLUE}🔍 Verifica configurazione Nginx...${NC}"
sudo nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Configurazione Nginx valida${NC}"
    sudo systemctl restart nginx
else
    echo -e "${RED}❌ Errore nella configurazione Nginx${NC}"
    exit 1
fi

# Ricarica servizi
echo -e "\n${BLUE}🔄 Riavvio servizi...${NC}"
sudo systemctl daemon-reload
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
echo -e "   Status: ${GREEN}pm2 list${NC}"

echo -e "\n${GREEN}✅ Verifica della configurazione...${NC}"
echo "Controllo connessione al server..."
curl -s http://localhost:3001/health > /dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Server operativo${NC}"
else
    echo -e "${RED}❌ Server non raggiungibile${NC}"
fi

echo "Controllo tunnel ngrok..."
curl -s http://localhost:4040/api/tunnels > /dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Tunnel ngrok attivo${NC}"
else
    echo -e "${RED}❌ Tunnel ngrok non attivo${NC}"
fi

echo -e "\n${GREEN}✅ Installazione completata!${NC}"
echo -e "Per avviare il server: ${GREEN}pm2 start meluccio${NC}"
echo -e "Per visualizzare i log: ${GREEN}pm2 logs meluccio${NC}"
echo -e "Per ottenere l'URL di ngrok: ${GREEN}curl http://localhost:4040/api/tunnels${NC}"
