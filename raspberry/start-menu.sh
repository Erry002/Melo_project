#!/bin/bash

# Colori
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Percorsi principali
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PM2_CONFIG="${SCRIPT_DIR}/ecosystem.config.cjs"
MANUAL_DEPLOY="${SCRIPT_DIR}/manual-deploy.sh"

# Funzione menu
show_menu() {
    clear
    echo -e "${BLUE}╔════════════════════════════════╗"
    echo -e "║     Meluccio Chat Manager     ║"
    echo -e "╚════════════════════════════════╝${NC}"
    echo
    echo -e "${GREEN}[1]${NC} Stato servizi"
    echo -e "${GREEN}[2]${NC} Avvia/Ferma servizi"
    echo -e "${GREEN}[3]${NC} Visualizza log"
    echo -e "${GREEN}[4]${NC} Gestione sistema"
    echo -e "${GREEN}[5]${NC} Aggiorna applicazione"
    echo -e "${GREEN}[0]${NC} Esci"
    echo
    read -p "Seleziona un'opzione: " choice
}

# Funzione stato
show_status() {
    clear
    echo -e "${BLUE}📊 Stato Servizi${NC}\n"

    # Controlla stato server Node.js
    echo -e "🖥️  Server Node.js:"
    if pm2 list | grep -q "meluccio.*online"; then
        echo -e "   ${GREEN}✓ Attivo${NC}"
    else
        echo -e "   ${RED}✗ Inattivo${NC}"
    fi

    echo -e "\n🌐 Ngrok:"
    if pm2 list | grep -q "ngrok.*online"; then
        echo -e "   ${GREEN}✓ Attivo${NC}"
        # Controlla gli URL di Ngrok
        if curl -s http://localhost:4040/api/tunnels | grep -q "public_url"; then
            echo -e "   ${GREEN}✓ Tunnel attivi${NC}"
            # Mostra gli URL
            echo -e "\n   🔗 URL disponibili:"
            curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | cut -d'"' -f4 | while read url; do
                echo -e "   ${BLUE}$url${NC}"
            done
        else
            echo -e "   ${RED}✗ Tunnel inattivi${NC}"
        fi
    else
        echo -e "   ${RED}✗ Inattivo${NC}"
    fi

    # Mostra utilizzo memoria
    echo -e "\n💾 Utilizzo memoria:"
    free -h | awk '/^Mem:/ {print "   Usata: " $3 " / Totale: " $2}'

    # Mostra temperatura CPU
    echo -e "\n🌡️  Temperatura CPU:"
    if [ -f /sys/class/thermal/thermal_zone0/temp ]; then
        temp=$(cat /sys/class/thermal/thermal_zone0/temp)
        temp=$(awk "BEGIN {printf \"%.1f\", $temp/1000}")
        echo -e "   ${temp}'C"
    else
        echo -e "   ${RED}Non disponibile${NC}"
    fi

    read -p "Premi Enter per continuare"
}

# Funzione gestione servizi
manage_services() {
    while true; do
        clear
        echo -e "${BLUE}⚙️  Gestione Servizi${NC}\n"
        echo -e "${GREEN}[1]${NC} Avvia tutto"
        echo -e "${GREEN}[2]${NC} Ferma tutto"
        echo -e "${GREEN}[3]${NC} Riavvia tutto"
        echo -e "${GREEN}[4]${NC} Torna al menu"
        echo
        read -p "Seleziona un'opzione: " service_choice
        
        case $service_choice in
            1)
                echo -e "\n${YELLOW}⏳ Avvio servizi...${NC}"
                cd "${SCRIPT_DIR}"
                pm2 start "${PM2_CONFIG}"
                pm2 save
                echo -e "\n${GREEN}✅ Servizi avviati${NC}"
                ;;
            2)
                echo -e "\n${YELLOW}⏳ Arresto servizi...${NC}"
                pm2 stop meluccio >/dev/null 2>&1 || true
                pm2 delete ngrok >/dev/null 2>&1 || true
                echo -e "\n${GREEN}✅ Servizi fermati${NC}"
                ;;
            3)
                echo -e "\n${YELLOW}⏳ Riavvio servizi...${NC}"
                if pm2 describe meluccio >/dev/null 2>&1; then
                    pm2 restart meluccio
                else
                    pm2 start "${PM2_CONFIG}" --only meluccio
                fi
                pm2 delete ngrok >/dev/null 2>&1 || true
                echo -e "${YELLOW}🔁 Avvio processo ngrok${NC}"
                pm2 start "${PM2_CONFIG}" --only ngrok
                pm2 save
                echo -e "\n${GREEN}✅ Servizi riavviati${NC}"
                ;;
            4)
                break
                ;;
        esac
        read -p "Premi Enter per continuare"
    done
}

# Funzione visualizza log
show_logs() {
    while true; do
        clear
        echo -e "${BLUE}📋 Log Disponibili${NC}\n"
        echo -e "${GREEN}[1]${NC} Server Node.js"
        echo -e "${GREEN}[2]${NC} Nginx"
        echo -e "${GREEN}[3]${NC} Sistema"
        echo -e "${GREEN}[4]${NC} Torna al menu"
        echo
        read -p "Seleziona log da visualizzare: " log_choice
        
        case $log_choice in
            1)
                journalctl -u meluccio -n 50 --no-pager
                ;;
            2)
                tail -n 50 /var/log/nginx/error.log
                ;;
            3)
                tail -n 50 /var/log/syslog
                ;;
            4)
                break
                ;;
        esac
        read -p "Premi Enter per continuare"
    done
}

# Funzione gestione sistema
manage_system() {
    while true; do
        clear
        echo -e "${BLUE}🔧 Gestione Sistema${NC}\n"
        echo -e "${GREEN}[1]${NC} Pulisci cache"
        echo -e "${GREEN}[2]${NC} Aggiorna sistema"
        echo -e "${GREEN}[3]${NC} Backup configurazione"
        echo -e "${GREEN}[4]${NC} Torna al menu"
        echo
        read -p "Seleziona un'opzione: " system_choice
        
        case $system_choice in
            1)
                sudo sync && sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
                echo -e "\n${GREEN}✅ Cache pulita${NC}"
                ;;
            2)
                sudo apt-get update && sudo apt-get upgrade -y
                echo -e "\n${GREEN}✅ Sistema aggiornato${NC}"
                ;;
            3)
                backup_dir="/home/pi/meluccio_backup_$(date +%Y%m%d)"
                mkdir -p $backup_dir
                cp -r /home/pi/meluccio/* $backup_dir/
                cp /etc/nginx/sites-available/meluccio $backup_dir/
                cp /etc/systemd/system/meluccio.service $backup_dir/
                echo -e "\n${GREEN}✅ Backup creato in $backup_dir${NC}"
                ;;
            4)
                break
                ;;
        esac
        read -p "Premi Enter per continuare"
    done
}

# Funzione aggiornamento
update_app() {
    clear
    echo -e "${BLUE}🔄 Aggiornamento Applicazione${NC}\n"
    cd "${REPO_ROOT}"
    git pull --ff-only

    if [ -x "${MANUAL_DEPLOY}" ]; then
        "${MANUAL_DEPLOY}" "$(git rev-parse --abbrev-ref HEAD)"
    else
        echo -e "${YELLOW}⚠️ Script manual-deploy non eseguibile, eseguo installazione manuale${NC}"
        npm install
        cd "${REPO_ROOT}/Meluccio-frontend"
        npm install
        npm run build
        cd "${REPO_ROOT}"
        pm2 reload meluccio --update-env || pm2 start "${PM2_CONFIG}" --only meluccio
        pm2 save
    fi
    
    echo -e "\n${GREEN}✅ Applicazione aggiornata${NC}"
    read -p "Premi Enter per continuare"
}

# Loop principale
while true; do
    show_menu
    case $choice in
        1) show_status ;;
        2) manage_services ;;
        3) show_logs ;;
        4) manage_system ;;
        5) update_app ;;
        0) 
            echo -e "\n${BLUE}👋 Arrivederci!${NC}"
            exit 0
            ;;
    esac
done
