#!/bin/bash

# ============================================================
# Meluccio Chat — Android/Termux Install Script
# Branch: feature/android-support
# Target: Termux on Android (ARM64 / ARMv7)
# ============================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$HOME/Melo_project"
FRONTEND_DIR="$PROJECT_DIR/Meluccio-frontend"

echo -e "${BLUE}📱 Installazione Meluccio Chat su Android/Termux...${NC}\n"

# ── 1. Verifica ambiente Termux ──────────────────────────────
echo -e "${BLUE}🔍 Verifica ambiente...${NC}"
if [ -z "$TERMUX_VERSION" ] && [ ! -d "/data/data/com.termux" ]; then
    echo -e "${YELLOW}⚠️  Questo script è pensato per Termux su Android.${NC}"
    echo -e "${YELLOW}   Continuo comunque (potrebbe funzionare su altri ambienti Unix).${NC}"
fi

# ── 2. Aggiornamento pacchetti Termux ───────────────────────
echo -e "\n${BLUE}📦 Aggiornamento repository pacchetti Termux...${NC}"
pkg update -y && pkg upgrade -y

# ── 3. Installazione dipendenze di sistema ──────────────────
echo -e "\n${BLUE}🔧 Installazione dipendenze di sistema...${NC}"
pkg install -y nodejs-lts python clang make git openssh curl

# ── 4. Verifica Node.js ─────────────────────────────────────
echo -e "\n${BLUE}✅ Verifica Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js non trovato dopo installazione. Interrompo.${NC}"
    exit 1
fi
echo -e "   Node.js: $(node --version)"
echo -e "   npm:     $(npm --version)"

# ── 5. Fix Python 3.12 / distutils (necessario per node-gyp < 10) ───────
# Python 3.12 ha rimosso il modulo 'distutils' usato da node-gyp 8.x.
# setuptools lo ripristina senza richiedere root.
echo -e "\n${BLUE}🐍 Step 5a: installazione setuptools (fix distutils per Python 3.12)...${NC}"
pip install setuptools --quiet && \
    echo -e "${GREEN}✅ setuptools installato.${NC}" || \
    echo -e "${YELLOW}⚠️  pip install setuptools fallito — la compilazione nativa potrebbe fallire.${NC}"

# ── 5b. Aggiornamento node-gyp (v8 non supporta Python 3.12) ────────────
echo -e "\n${BLUE}📦 Step 5b: aggiornamento node-gyp (Python 3.12 support)...${NC}"
npm install -g node-gyp@latest --quiet && \
    echo -e "${GREEN}✅ node-gyp aggiornato: $(node-gyp --version)${NC}" || \
    echo -e "${YELLOW}⚠️  aggiornamento node-gyp non riuscito, continuo.${NC}"

# ── 6. Clone / aggiornamento repository ─────────────────────
echo -e "\n${BLUE}📥 Configurazione repository...${NC}"
if [ -d "$PROJECT_DIR" ]; then
    echo -e "   Directory $PROJECT_DIR già esistente. Aggiorno branch..."
    cd "$PROJECT_DIR"
    git fetch origin
    git checkout feature/android-support
    git pull origin feature/android-support
else
    echo -e "   Clono il repository in $PROJECT_DIR..."
    git clone https://github.com/Erry002/Melo_project.git "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    git checkout feature/android-support
fi

# ── 7. Installazione dipendenze npm ─────────────────────────
echo -e "\n${BLUE}📦 Installazione dipendenze npm (backend)...${NC}"
cd "$PROJECT_DIR"

# Tentativo 1: installazione standard
if npm install; then
    echo -e "${GREEN}✅ npm install completato.${NC}"
else
    echo -e "${YELLOW}⚠️  npm install fallito. Provo ricompilazione sqlite3 con librerie Termux...${NC}"
    # Tentativo 2: installa tutto senza script nativi, poi ricompila sqlite3
    # puntando esplicitamente alle librerie di sistema di Termux ($PREFIX/lib)
    npm install --ignore-scripts
    LDFLAGS="-L$PREFIX/lib" \
    CFLAGS="-I$PREFIX/include" \
    npm rebuild sqlite3 --build-from-source || {
        echo -e "${RED}❌ Compilazione sqlite3 fallita.${NC}"
        echo -e "${YELLOW}   Esegui il fix dedicato: bash android/fix-sqlite3.sh${NC}"
    }
fi

# ── 8. File .env ─────────────────────────────────────────────
echo -e "\n${BLUE}⚙️  Configurazione .env...${NC}"
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cat > "$PROJECT_DIR/.env" << 'EOF'
PORT=3001
NODE_ENV=production
JWT_SECRET=MeloChat_Android_Secret_Change_Me
# PASSWORD_RESET_DEBUG=true
# SMTP_HOST=
# SMTP_PORT=
# SMTP_USER=
# SMTP_PASS=
EOF
    echo -e "${GREEN}✅ File .env creato. Modifica JWT_SECRET prima di usare in produzione!${NC}"
else
    echo -e "   File .env già presente, non sovrascritto."
fi

# ── 9. Build frontend (opzionale) ────────────────────────────
echo -e "\n${BLUE}🌐 Build frontend React...${NC}"
if [ -d "$FRONTEND_DIR" ]; then
    cd "$FRONTEND_DIR"
    echo -e "${YELLOW}   L'installazione delle dipendenze frontend può richiedere qualche minuto...${NC}"
    npm install && npm run build && echo -e "${GREEN}✅ Frontend compilato in dist/${NC}" || {
        echo -e "${YELLOW}⚠️  Build frontend fallita. Il server avvia comunque il backend.${NC}"
        echo -e "${YELLOW}   In alternativa: fai la build su macOS e copia la dist/ via scp.${NC}"
    }
fi

# ── 10. Riepilogo ─────────────────────────────────────────────
echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Installazione completata!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e ""
echo -e "Per avviare il server:"
echo -e "  ${BLUE}cd $PROJECT_DIR && bash android/start.sh${NC}"
echo -e ""
echo -e "Poi apri Chrome Android su:"
echo -e "  ${BLUE}http://localhost:3001${NC}"
echo -e ""
echo -e "${YELLOW}⚡ Consiglio: tieni il device in carica e disabilita il risparmio energetico${NC}"
echo -e "${YELLOW}   per evitare che Android chiuda il processo Termux.${NC}"
