#!/bin/bash

# Colori
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

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
    
    echo -e "🖥️  Server Node.js:"
    systemctl is-active meluccio &>/dev/null && \
        echo -e "   ${GREEN}✓ Attivo${NC}" || \
        echo -e "   ${RED}✗ Inattivo${NC}"
    
    echo -e "\n🌐 Nginx:"
    systemctl is-active nginx &>/dev/null && \
        echo -e "   ${GREEN}✓ Attivo${NC}" || \
        echo -e "   ${RED}✗ Inattivo${NC}"
    
    echo -e "\n💾 Utilizzo memoria:"
    free -h | grep "Mem" | awk '{print "   Usata: "$3" / Totale: "$2}'
    
    echo -e "\n🌡️  Temperatura CPU:"
    temp=$(vcgencmd measure_temp | cut -d= -f2)
    echo -e "   $temp"
    
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
                sudo systemctl start meluccio nginx
                echo -e "\n${GREEN}✅ Servizi avviati${NC}"
                ;;
            2)
                sudo systemctl stop meluccio nginx
                echo -e "\n${GREEN}✅ Servizi fermati${NC}"
                ;;
            3)
                sudo systemctl restart meluccio nginx
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
    
    cd /home/pi/meluccio
    git pull
    
    cd Meluccio-frontend
    npm install --production
    export NODE_OPTIONS="--max-old-space-size=512"
    npm run build
    
    cd ..
    npm install --production
    
    sudo systemctl restart meluccio
    sudo systemctl restart nginx
    
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
