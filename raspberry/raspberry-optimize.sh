#!/bin/bash

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Ottimizzazione per Raspberry Pi 3B+ per Meluccio...${NC}\n"

# Ottimizza la swap
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo /etc/init.d/dphys-swapfile restart
echo -e "${GREEN}✅ Swap impostata a 2GB${NC}"

# Riduce la pressione sulla cache
echo 75 | sudo tee /proc/sys/vm/vfs_cache_pressure
echo -e "${GREEN}✅ Pressione cache ottimizzata${NC}"

# Aumenta la swappiness per usare più swap
echo 70 | sudo tee /proc/sys/vm/swappiness
echo -e "${GREEN}✅ Swappiness aumentata${NC}"

# Ottimizza parametri di rete per WebRTC
sudo sysctl -w net.core.rmem_max=8388608
sudo sysctl -w net.core.wmem_max=8388608
echo -e "${GREEN}✅ Buffer di rete ottimizzati${NC}"

# Cambia governatore CPU per bilanciare prestazioni/energia
echo ondemand | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
echo -e "${GREEN}✅ Governatore CPU impostato su ondemand${NC}"

# Disabilita servizi non necessari
sudo systemctl disable bluetooth
sudo systemctl disable triggerhappy
sudo systemctl disable avahi-daemon
echo -e "${GREEN}✅ Servizi non necessari disabilitati${NC}"

# Crea script per il periodic cleanup
cat > ~/periodic-cleanup.sh << EOF
#!/bin/bash
sync
echo 3 > /proc/sys/vm/drop_caches
echo "Cache pulita: \$(date)" >> /tmp/cleanup.log
EOF

chmod +x ~/periodic-cleanup.sh

# Imposta un cron job per la pulizia periodica
(crontab -l 2>/dev/null; echo "0 */3 * * * ~/periodic-cleanup.sh") | crontab -
echo -e "${GREEN}✅ Pulizia automatica della cache configurata${NC}"

echo -e "\n${BLUE}🎉 Ottimizzazioni completate!${NC}"
echo -e "Sistema ottimizzato per Raspberry Pi 3B+ con Meluccio"
