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
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx

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

# Configura Nginx
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
}
EOF

sudo ln -sf /etc/nginx/sites-available/meluccio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# Crea servizio systemd
echo -e "\n${BLUE}⚙️  Configurazione servizio...${NC}"
sudo tee /etc/systemd/system/meluccio.service << EOF
[Unit]
Description=Meluccio Chat Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/meluccio
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable meluccio
sudo systemctl start meluccio

echo -e "\n${GREEN}✅ Installazione completata!${NC}"
echo -e "\n📱 App disponibile su:"
echo -e "   Local: ${GREEN}http://localhost${NC}"
echo -e "   Network: ${GREEN}http://$(hostname -I | cut -d' ' -f1)${NC}"
