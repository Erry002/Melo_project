#!/bin/bash

# ============================================================
# Meluccio Chat — Fix sqlite3 su Android/Termux
# Causa: node-gyp 8.x usa distutils, rimosso in Python 3.12
# Fix:   pip install setuptools ripristina distutils
# ============================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$HOME/Melo_project"

echo -e "${BLUE}🔧 Fix sqlite3 per Android/Termux (Python 3.12 + node-gyp)${NC}\n"

# ── Diagnosi ─────────────────────────────────────────────────
echo -e "${BLUE}🔍 Diagnostica ambiente...${NC}"
echo -e "   Node.js : $(node --version 2>/dev/null || echo 'NON TROVATO')"
echo -e "   npm     : $(npm --version 2>/dev/null || echo 'NON TROVATO')"
echo -e "   Python  : $(python3 --version 2>/dev/null || echo 'NON TROVATO')"
echo -e "   node-gyp: $(node-gyp --version 2>/dev/null || echo 'NON TROVATO')"

# ── Step 1: installa setuptools (ripristina distutils per Python 3.12) ──
echo -e "\n${BLUE}📦 Step 1: installazione setuptools (fix distutils per Python 3.12)...${NC}"
pip install setuptools --quiet && \
    echo -e "${GREEN}✅ setuptools installato.${NC}" || \
    echo -e "${RED}❌ pip install setuptools fallito.${NC}"

# Verifica
python3 -c "from distutils.version import StrictVersion; print('distutils OK')" 2>/dev/null && \
    echo -e "${GREEN}✅ distutils disponibile.${NC}" || \
    echo -e "${YELLOW}⚠️  distutils ancora mancante. Provo con setuptools via pip3...${NC}" && \
    pip3 install setuptools --quiet

# ── Step 2: aggiorna node-gyp globale ───────────────────────
echo -e "\n${BLUE}📦 Step 2: aggiornamento node-gyp (v8 → latest, supporta Python 3.12)...${NC}"
npm install -g node-gyp@latest --quiet && \
    echo -e "${GREEN}✅ node-gyp aggiornato: $(node-gyp --version)${NC}" || \
    echo -e "${YELLOW}⚠️  aggiornamento node-gyp non riuscito, continuo con versione esistente.${NC}"

# ── Step 3: pulisce e ricompila sqlite3 ─────────────────────
echo -e "\n${BLUE}🔨 Step 3: ricompilazione sqlite3 da sorgenti...${NC}"
cd "$PROJECT_DIR"

# Rimuovi build precedente fallita
rm -rf node_modules/sqlite3/build 2>/dev/null

# Ricompila puntando alla libsqlite di Termux
LDFLAGS="-L$PREFIX/lib" \
CFLAGS="-I$PREFIX/include" \
npm rebuild sqlite3 --build-from-source

SQLITE3_EXIT=$?

if [ $SQLITE3_EXIT -eq 0 ]; then
    echo -e "\n${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ sqlite3 compilato con successo!${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "\nPuoi ora avviare il server:"
    echo -e "  ${BLUE}bash android/start.sh${NC}"
else
    echo -e "\n${RED}════════════════════════════════════════${NC}"
    echo -e "${RED}❌ Compilazione sqlite3 ancora fallita.${NC}"
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e ""
    echo -e "${YELLOW}▶ Esegui il fallback automatico verso better-sqlite3:${NC}"
    echo -e "  ${BLUE}bash android/migrate-to-better-sqlite3.sh${NC}"
    echo -e ""
    echo -e "${YELLOW}Oppure esegui manualmente:${NC}"
    echo -e "  ${BLUE}pip install setuptools${NC}"
    echo -e "  ${BLUE}npm install -g node-gyp@latest${NC}"
    echo -e "  ${BLUE}LDFLAGS=\"-L\$PREFIX/lib\" CFLAGS=\"-I\$PREFIX/include\" npm rebuild sqlite3 --build-from-source${NC}"
    exit 1
fi
