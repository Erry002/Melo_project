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

# Crea lo script di avvio
echo -e "\n${BLUE}📝 Creazione script di avvio...${NC}"
cat > $PROJECT_DIR/start-server.sh << EOF
#!/bin/bash

# Imposta variabili ambiente
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=512"

# Vai alla directory del progetto
cd $PROJECT_DIR

# Verifica dipendenze
if [ ! -d "node_modules" ]; then
    echo "Installazione dipendenze..."
    npm install --production
fi

# Avvia il server
exec /usr/bin/node server.js
EOF

chmod +x $PROJECT_DIR/start-server.sh
chown erry002:erry002 $PROJECT_DIR/start-server.sh

# Configura il servizio systemd
echo -e "\n${BLUE}⚙️  Configurazione servizio systemd...${NC}"
sudo tee /etc/systemd/system/meluccio.service << EOF
[Unit]
Description=Meluccio Chat Server
After=network.target

[Service]
Type=simple
User=erry002
Group=erry002
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=/bin/bash $PROJECT_DIR/start-server.sh
Restart=always
RestartSec=10

# Logging
StandardOutput=append:$LOGS_DIR/node.log
StandardError=append:$LOGS_DIR/node-error.log

[Install]
WantedBy=multi-user.target
EOF

# Crea directory per i log
mkdir -p $LOGS_DIR
touch $LOGS_DIR/node.log $LOGS_DIR/node-error.log
chown -R erry002:erry002 $LOGS_DIR
chmod -R 755 $LOGS_DIR

# Ricarica systemd
sudo systemctl daemon-reload

# Prova ad avviare il server manualmente per verificare
echo -e "\n${BLUE}🔍 Verifica server Node.js...${NC}"
if node $PROJECT_DIR/server.js --test; then
    echo -e "${GREEN}✅ Server Node.js funzionante${NC}"
    sudo systemctl enable meluccio
    sudo systemctl start meluccio
else
    echo -e "${RED}❌ Errore nell'avvio del server Node.js${NC}"
    echo -e "Controlla i log in $LOGS_DIR/node-error.log"
    exit 1
fi

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

# Backup e pulizia
sudo systemctl stop nginx
sudo rm -f /etc/nginx/sites-enabled/*
sudo rm -f /etc/nginx/sites-available/*

# Crea directory per i file statici
mkdir -p $PROJECT_DIR/Meluccio-frontend/dist
sudo chown -R erry002:erry002 $PROJECT_DIR/Meluccio-frontend

# Crea configurazione principale
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

        # Configurazione base
        location / {
            try_files \$uri \$uri/ /index.html;
            add_header Cache-Control "no-cache";
        }

        # API e WebSocket
        location /socket.io/ {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_read_timeout 86400;
            proxy_connect_timeout 7d;
            proxy_send_timeout 7d;
        }

        # Gestione errori
        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
        
        location = /50x.html {
            root /usr/share/nginx/html;
        }
    }
}
EOF

# Crea pagina di errore personalizzata
sudo tee $PROJECT_DIR/Meluccio-frontend/dist/50x.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Errore Server</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
        }
        h1 { color: #333; }
        p { color: #666; }
    </style>
</head>
<body>
    <h1>Oops! Qualcosa è andato storto</h1>
    <p>Stiamo lavorando per risolvere il problema. Riprova tra qualche minuto.</p>
</body>
</html>
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
