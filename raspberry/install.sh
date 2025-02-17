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

# Installa PM2
echo -e "\n${BLUE}📊 Installazione PM2...${NC}"
sudo npm install -g pm2

# Crea directory progetto
echo -e "\n${BLUE}📁 Configurazione directory...${NC}"
mkdir -p ~/meluccio
cp -r ../* ~/meluccio/
cd ~/meluccio

# Crea directory per i log
mkdir -p logs

# Installa dipendenze progetto
echo -e "\n${BLUE}📦 Installazione dipendenze progetto...${NC}"
cd Meluccio-frontend && npm install --production
cd .. && npm install --production

# Build frontend ottimizzato
echo -e "\n${BLUE}🏗️  Build frontend...${NC}"
cd Meluccio-frontend
export NODE_OPTIONS="--max-old-space-size=512"
npm run build
cd ..

# Configura Nginx con health check
echo -e "\n${BLUE}🔧 Configurazione Nginx...${NC}"
sudo tee /etc/nginx/sites-available/meluccio << EOF
server {
    listen 80;
    server_name meluccio.local;

    location / {
        root /home/pi/meluccio/Meluccio-frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_http_version 1.1;
        access_log off;
        proxy_cache_bypass \$http_pragma;
        proxy_cache_revalidate on;
        expires 0;
        add_header Cache-Control private;
    }

    # Logging configurazione
    access_log /home/pi/meluccio/logs/nginx-access.log;
    error_log /home/pi/meluccio/logs/nginx-error.log;
}
EOF

sudo ln -sf /etc/nginx/sites-available/meluccio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# Configura Redis per la gestione sessioni
echo -e "\n${BLUE}⚙️  Configurazione Redis...${NC}"
sudo sed -i 's/# maxmemory <bytes>/maxmemory 100mb/g' /etc/redis/redis.conf
sudo sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/g' /etc/redis/redis.conf
sudo systemctl restart redis-server

# Configura Ngrok
echo -e "\n${BLUE}🌐 Configurazione Ngrok...${NC}"
if ! command -v ngrok &> /dev/null; then
    curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
    sudo apt update && sudo apt install ngrok
fi

# Copia configurazione Ngrok
mkdir -p ~/.config/ngrok
cp ngrok.yml ~/.config/ngrok/
chmod +x ngrok-manager.sh

# Crea servizio systemd per Ngrok
sudo tee /etc/systemd/system/ngrok.service << EOF
[Unit]
Description=Ngrok Tunnel Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/meluccio
ExecStart=/home/pi/meluccio/raspberry/ngrok-manager.sh start
ExecStop=/home/pi/meluccio/raspberry/ngrok-manager.sh stop
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ngrok

# Crea servizio systemd migliorato
echo -e "\n${BLUE}⚙️  Configurazione servizio...${NC}"
sudo tee /etc/systemd/system/meluccio.service << EOF
[Unit]
Description=Meluccio Chat Server
After=network.target redis-server.service
Requires=redis-server.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/meluccio
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
Environment=DEBUG=socket.io:*
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=append:/home/pi/meluccio/logs/server.log
StandardError=append:/home/pi/meluccio/logs/server-error.log

# Limiti di sistema
LimitNOFILE=65535
MemoryAccounting=true
MemoryHigh=512M
MemoryMax=600M

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable meluccio redis-server
sudo systemctl start meluccio

# Configura logrotate
sudo tee /etc/logrotate.d/meluccio << EOF
/home/pi/meluccio/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 640 pi pi
    sharedscripts
    postrotate
        systemctl reload meluccio
    endscript
}
EOF

echo -e "\n${GREEN}✅ Installazione completata!${NC}"
echo -e "\n📱 App disponibile su:"
echo -e "   Local: ${GREEN}http://localhost${NC}"
echo -e "   Network: ${GREEN}http://$(hostname -I | cut -d' ' -f1)${NC}"
echo -e "\n📊 Monitoraggio:"
echo -e "   Logs: ${GREEN}/home/pi/meluccio/logs/${NC}"
echo -e "   Status: ${GREEN}systemctl status meluccio${NC}"
