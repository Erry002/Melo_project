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

# Verifica permessi directory
echo -e "\n${BLUE}🔍 Verifica permessi...${NC}"
sudo chown -R $USER:$USER /home/pi/meluccio
sudo chmod -R 755 /home/pi/meluccio

# Installa dipendenze
echo -e "\n${BLUE}📦 Installazione dipendenze...${NC}"
cd /home/pi/meluccio
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

# Fix problemi Nginx
echo -e "\n${BLUE}🔧 Configurazione Nginx...${NC}"

# Ferma Nginx prima di tutto
sudo systemctl stop nginx

# Pulisci le vecchie configurazioni
sudo rm -f /etc/nginx/sites-enabled/default
sudo rm -f /etc/nginx/sites-enabled/meluccio

# Crea e imposta i permessi delle directory
echo -e "${BLUE}📁 Creazione directory logs...${NC}"
sudo mkdir -p /home/pi/meluccio/logs
sudo touch /home/pi/meluccio/logs/nginx-access.log
sudo touch /home/pi/meluccio/logs/nginx-error.log
sudo chown -R www-data:www-data /home/pi/meluccio/logs
sudo chmod -R 755 /home/pi/meluccio/logs
sudo chmod 644 /home/pi/meluccio/logs/nginx-*.log

# Verifica che i file esistano
if [ ! -f "/home/pi/meluccio/logs/nginx-access.log" ] || [ ! -f "/home/pi/meluccio/logs/nginx-error.log" ]; then
    echo -e "${RED}❌ Errore nella creazione dei file di log${NC}"
    exit 1
fi

# Backup configurazione esistente
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup

# Crea configurazione pulita
echo -e "${BLUE}⚙️  Configurazione Nginx...${NC}"
sudo tee /etc/nginx/nginx.conf << EOF
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

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

    ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    access_log /home/pi/meluccio/logs/nginx-access.log;
    error_log /home/pi/meluccio/logs/nginx-error.log warn;

    gzip on;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF

# Crea configurazione del sito
sudo tee /etc/nginx/sites-available/meluccio << EOF
server {
    listen 80 default_server;
    server_name _;
    root /home/pi/meluccio/Meluccio-frontend/dist;

    access_log /home/pi/meluccio/logs/nginx-access.log;
    error_log /home/pi/meluccio/logs/nginx-error.log warn;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
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
sudo ln -sf /etc/nginx/sites-available/meluccio /etc/nginx/sites-enabled/

# Test configurazione
echo -e "\n${BLUE}🔍 Verifica configurazione Nginx...${NC}"
sudo nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Configurazione Nginx valida${NC}"
    sudo systemctl restart nginx
    
    # Verifica che Nginx sia effettivamente in esecuzione
    if sudo systemctl is-active --quiet nginx; then
        echo -e "${GREEN}✅ Nginx avviato con successo${NC}"
    else
        echo -e "${RED}❌ Nginx non si è avviato correttamente${NC}"
        echo -e "Ultimi log:"
        sudo journalctl -u nginx.service -n 50 --no-pager
        exit 1
    fi
else
    echo -e "${RED}❌ Errore nella configurazione Nginx${NC}"
    echo -e "Controlla i log:"
    sudo journalctl -u nginx.service -n 50 --no-pager
    exit 1
fi

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

# Configura servizio systemd
echo -e "\n${BLUE}⚙️  Configurazione servizio systemd...${NC}"

# Crea directory per i log
sudo mkdir -p /home/pi/meluccio/logs
sudo chown -R pi:pi /home/pi/meluccio/logs

# Crea lo script di avvio
cat > /home/pi/meluccio/start-server.sh << EOF
#!/bin/bash
cd /home/pi/meluccio
exec /usr/bin/node server.js 2>&1
EOF

chmod +x /home/pi/meluccio/start-server.sh
chown pi:pi /home/pi/meluccio/start-server.sh

# Crea il servizio
sudo tee /etc/systemd/system/meluccio.service << EOF
[Unit]
Description=Meluccio Chat Server
After=network.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/meluccio
ExecStart=/bin/bash /home/pi/meluccio/start-server.sh
Restart=on-failure
RestartSec=10

# Limiti di sistema
LimitNOFILE=4096

# Logging
StandardOutput=append:/home/pi/meluccio/logs/server.log
StandardError=append:/home/pi/meluccio/logs/error.log

[Install]
WantedBy=multi-user.target
EOF

# Ricarica e abilita
echo -e "\n${BLUE}🔄 Riavvio servizio...${NC}"
sudo systemctl daemon-reload
sudo systemctl enable meluccio

# Verifica permessi finali
sudo chown -R pi:pi /home/pi/meluccio
sudo chmod -R 755 /home/pi/meluccio

echo -e "\n${GREEN}✅ Installazione completata!${NC}"
echo -e "\n📱 App disponibile su:"
echo -e "   Local: ${GREEN}http://localhost${NC}"
echo -e "   Network: ${GREEN}http://$(hostname -I | cut -d' ' -f1)${NC}"
echo -e "\n📊 Monitoraggio:"
echo -e "   Logs: ${GREEN}/home/pi/meluccio/logs/${NC}"
echo -e "   Status: ${GREEN}systemctl status meluccio${NC}"
