#!/bin/bash

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Ottimizzazione Raspberry Pi 3B per Meluccio...${NC}\n"

# Funzione per controllare lo spazio disponibile
check_space() {
    local space=$(df -h / | awk 'NR==2 {print $4}')
    echo -e "${BLUE}💾 Spazio disponibile: ${GREEN}$space${NC}"
}

# Funzione per controllare la memoria
check_memory() {
    local total=$(free -m | awk 'NR==2 {print $2}')
    local used=$(free -m | awk 'NR==2 {print $3}')
    local free=$(free -m | awk 'NR==2 {print $4}')
    echo -e "${BLUE}🧠 Memoria totale: ${GREEN}${total}MB${NC}"
    echo -e "${BLUE}🧠 Memoria usata: ${GREEN}${used}MB${NC}"
    echo -e "${BLUE}🧠 Memoria libera: ${GREEN}${free}MB${NC}"
}

# Funzione per ottimizzare la memoria
optimize_memory() {
    echo -e "\n${BLUE}🔧 Ottimizzazione memoria...${NC}"
    
    # Configura lo swap
    sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
    sudo /etc/init.d/dphys-swapfile restart
    
    # Ottimizza la cache del filesystem
    echo 1024 | sudo tee /proc/sys/vm/min_free_kbytes
    echo 50 | sudo tee /proc/sys/vm/vfs_cache_pressure
    echo 60 | sudo tee /proc/sys/vm/swappiness
}

# Funzione per ottimizzare Node.js
optimize_nodejs() {
    echo -e "\n${BLUE}⚙️  Ottimizzazione Node.js...${NC}"
    
    # Imposta le variabili d'ambiente per Node.js
    echo "export NODE_OPTIONS='--max-old-space-size=512'" >> ~/.bashrc
    echo "export UV_THREADPOOL_SIZE=2" >> ~/.bashrc
    
    # Configura PM2 per la gestione dei processi
    npm install -g pm2
    
    # Crea configurazione PM2
        cat > ecosystem.config.cjs << EOF
module.exports = {
  apps: [{
    name: 'meluccio-server',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      UV_THREADPOOL_SIZE: 2
    }
  }]
}
EOF
}

# Funzione per ottimizzare Nginx
optimize_nginx() {
    echo -e "\n${BLUE}🌐 Ottimizzazione Nginx...${NC}"
    
    # Backup configurazione esistente
    sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
    
    # Crea configurazione ottimizzata
    sudo tee /etc/nginx/nginx.conf << EOF
user www-data;
worker_processes 2;
worker_rlimit_nofile 1024;
pid /run/nginx.pid;

events {
    worker_connections 256;
    multi_accept off;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    client_body_buffer_size 10K;
    client_header_buffer_size 1k;
    client_max_body_size 8m;
    large_client_header_buffers 2 1k;

    open_file_cache max=1000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF
}

# Funzione per ottimizzare il sistema
optimize_system() {
    echo -e "\n${BLUE}💻 Ottimizzazione sistema...${NC}"
    
    # Disabilita servizi non necessari
    sudo systemctl disable bluetooth
    sudo systemctl disable triggerhappy
    sudo systemctl disable avahi-daemon
    
    # Ottimizza le impostazioni di rete
    sudo sysctl -w net.core.somaxconn=1024
    sudo sysctl -w net.ipv4.tcp_max_syn_backlog=1024
    sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535"
    
    # Ottimizza le prestazioni CPU
    echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
    
    # Aumenta il limite di file aperti
    echo "* soft nofile 10240" | sudo tee -a /etc/security/limits.conf
    echo "* hard nofile 10240" | sudo tee -a /etc/security/limits.conf
}

# Menu principale
echo -e "Seleziona le ottimizzazioni da applicare:"
echo -e "${GREEN}1${NC}. Ottimizza tutto"
echo -e "${GREEN}2${NC}. Ottimizza solo memoria"
echo -e "${GREEN}3${NC}. Ottimizza solo Node.js"
echo -e "${GREEN}4${NC}. Ottimizza solo Nginx"
echo -e "${GREEN}5${NC}. Ottimizza solo sistema"
echo -e "${GREEN}6${NC}. Controlla stato sistema"
echo -e "${GREEN}7${NC}. Esci"

read -p "Scelta (1-7): " choice

case $choice in
    1)
        check_space
        check_memory
        optimize_memory
        optimize_nodejs
        optimize_nginx
        optimize_system
        echo -e "\n${GREEN}✅ Ottimizzazioni completate!${NC}"
        ;;
    2)
        check_memory
        optimize_memory
        echo -e "\n${GREEN}✅ Ottimizzazione memoria completata!${NC}"
        ;;
    3)
        optimize_nodejs
        echo -e "\n${GREEN}✅ Ottimizzazione Node.js completata!${NC}"
        ;;
    4)
        optimize_nginx
        echo -e "\n${GREEN}✅ Ottimizzazione Nginx completata!${NC}"
        ;;
    5)
        optimize_system
        echo -e "\n${GREEN}✅ Ottimizzazione sistema completata!${NC}"
        ;;
    6)
        check_space
        check_memory
        ;;
    7)
        echo -e "${GREEN}👋 Arrivederci!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Scelta non valida!${NC}"
        exit 1
        ;;
esac
