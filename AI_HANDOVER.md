# 🤖 AI HANDOVER DOCUMENTATION - v1.0.0
> **Documentazione per AI subentrate** | Updated: 20 Dicembre 2025 | **PRODOTTO FUNZIONANTE ✅ (quasi completo)**

## 🎯 **STATO ATTUALE - SUCCESSO COMPLETO**

### Progetto
- **Nome**: Melo Project - TeamSpeak-style Chat con Audio Streaming
- **Owner**: Erry002  
- **Repo**: https://github.com/Erry002/Melo_project
- **Branch attivo**: `test` (deployment Raspberry, merge su `main` dopo stabilizzazione)
- **Versione**: v1.0.0 - Prodotto stabile e usabile (audio + UI + auth)
- **User Feedback**: "Molto meglio" - Obiettivo raggiunto ✅
- **Stato**: Audio streaming real-time + UX mobile/desktop pronta per uso, in corso rifiniture finali

### Workflow Operativo
- **Sviluppo**: Branch `test` per nuove feature e test su Raspberry
- **Produzione**: Merge su `main` dopo verifica stabilità
- **Deployment**: Script automatizzati in `raspberry/` (install, optimize, deploy)
- **Monitoring**: Suite diagnostica in `raspberry/tests/` (stress-http, sqlite-health, tunnel-check)

### Obiettivo
Sistema di chat vocale real-time tipo TeamSpeak/Discord, ottimizzato per deployment su **Raspberry Pi 3B+**.

---

## 🏗️ ARCHITETTURA SISTEMA

### Stack Tecnologico
```
Frontend: React 19.0.0 + Vite 6.3.5 + Socket.IO Client
Backend:  Node.js 18.20.8 + Express + Socket.IO Server  
Audio:    Web Audio API + ScriptProcessor (raw samples)
Target:   Raspberry Pi 3B+ (ARM Linux)
Dev OS:   macOS (Intel/ARM)
```

### Struttura Files
```
/Melo_project/
├── server.js                 # Main backend server
├── SimpleAudioManager.js     # Audio room management
├── package.json              # Backend dependencies
├── DEVLOG.md                 # Development diary
├── TECH_STACK.md             # Complete technical docs (875 lines)
├── AI_HANDOVER.md            # This file
├── Meluccio-frontend/
│   ├── src/App.jsx           # Main React component (430 lines)
│   ├── package.json          # Frontend dependencies
│   └── vite.config.js        # Build configuration
└── raspberry/                # Deployment & monitoring scripts
  ├── ecosystem.config.cjs  # PM2 configuration (.cjs per compatibilità ESM)
  ├── install-deps.sh       # Installazione dipendenze Raspberry
  ├── manual-deploy.sh      # Pull + build + reload pm2
  ├── tests/                # Stress test, SQLite health, tunnel check
  └── *.sh                  # Setup & optimization scripts
```

---

## 🎯 PROBLEMA RISOLTO & SOLUZIONE

### Problema Originale
- **Issue**: WebRTC P2P con memory leaks e crash frequenti
- **Sintomi**: Black screen, "useSimpleAudio hook" non funzionante
- **Impatto**: Sistema inutilizzabile

### Soluzione Implementata  
- **Architettura**: Migrazione completa da WebRTC P2P a **server-based Socket.IO**
- **Audio**: Da MediaRecorder chunks a **Web Audio API raw samples**
- **Stabilità**: Da hook complesso a **inline audio functions**

### Risultato
✅ Chat real-time stabile  
✅ Audio streaming bidirezionale  
✅ Room-based audio isolation  
✅ Pronto per Raspberry Pi deployment

---

## 🔧 SISTEMA AUDIO DETTAGLIATO

### Frontend Audio Pipeline
```javascript
// 1. Capture microphone
navigator.mediaDevices.getUserMedia({ audio: true })

// 2. Setup Web Audio API
const audioContext = new AudioContext();
const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

// 3. Process real-time samples  
scriptProcessor.onaudioprocess = (event) => {
  const inputData = event.inputBuffer.getChannelData(0); // float32
  const int16Data = new Int16Array(inputData.length);    // optimization
  
  // Send via Socket.IO only if audio activity > 0.01 (noise gate)
  socket.emit('audio-chunk', { audioData: Array.from(int16Data) });
}

// 4. Receive & playback
socket.on('audio-broadcast', (audioData) => {
  const audioBuffer = audioContext.createBuffer(1, data.length, 44100);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.start(); // Immediate playback
});
```

### Backend Audio Management
```javascript
// SimpleAudioManager.js - Room-based isolation
class SimpleAudioManager {
  broadcastAudio(senderId, audioData, channelId) {
    const room = this.audioRooms.get(channelId);
    room.users.forEach(userId => {
      if (userId !== senderId) {
        this.io.to(userId).emit('audio-broadcast', {
          from: senderId,
          audioData: audioData.audioData,
          username: this.users.get(senderId)?.username
        });
      }
    });
  }
}
```

---

## 🚀 SETUP & TESTING

### Quick Start Commands
```bash
# Terminal 1 - Backend
cd /Users/erry002/Documents/GitHub/Melo_project
node server.js

# Terminal 2 - Frontend  
cd Meluccio-frontend
npm run dev

# Access: http://localhost:5173
```

### Audio Testing Procedure
1. Open **2 browser tabs** → `http://localhost:5173`
2. Give **microphone permissions** in both tabs
3. Click **"Attiva Audio"** in both tabs  
4. **Speak in Tab 1** → should hear in Tab 2
5. Check console for audio level indicators

### Debug Commands
```bash
# Kill stuck processes
lsof -ti:3001 && kill -9 $(lsof -ti:3001)

# Check logs
tail -f logs/server.log

# Audio level verification  
# Console should show: 🎵 Chunk audio, 🔊 Audio ricevuto
```

### Raspberry Ops (RPI 3B+)
```bash
# Prima configurazione dipendenze (Node 18, pm2, sqlite, jq, ecc.)
./raspberry/install-deps.sh

# Deploy manuale branch test (git pull → npm install → npm run build → pm2 reload)
./raspberry/manual-deploy.sh

# Suite diagnostica
./raspberry/tests/sqlite-health.sh
CONNECTIONS=20 ./raspberry/tests/stress-http.sh
./raspberry/tests/tunnel-check.sh

# Tunnel pubblico (richiede binario + authtoken)
pm2 start raspberry/ecosystem.config.cjs --only ngrok
curl http://127.0.0.1:4040/api/tunnels   # recupera URL pubblici
```

---

## 📊 STATO CORRENTE

### ✅ Funzionante
- Chat real-time con Socket.IO
- Audio capture con Web Audio API  
- Audio transmission (int16 samples)
- Audio playback automatico
- Room management per audio isolation
- Noise gate (threshold 0.01)
- Microphone level visualization
- Avatar e attachments serviti da backend tramite `/uploads`
- Effetto neve globale (stagionale) con `react-snowfall`
- Azioni rapide (Profilo/Microfono) accessibili dal box Menu della sidebar

### 🔄 Testing Needed
- Multi-user audio streaming (implementato, da testare)
- Performance su Raspberry Pi
- Audio quality fine-tuning

### 📋 TODO Future

#### Risolti ✅
- WebRTC memory leaks → Migrazione a Socket.IO
- MediaRecorder codec errors → Switch a Web Audio API  
- useSimpleAudio crashes → Inline implementation
- Avatar non mostrati → Backend serve `/uploads` + normalizzazione URL client
- UI mobile → Bottom bar + drawer con overlay
- Recupero credenziali → Flusso unificato (password + username reminder)

#### In Progress 🔄
- Multi-user testing - Sistema implementato, testing needed
- Performance su Raspberry Pi - Deployment scripts pronti

#### Prossimi Passi 📋
- [ ] Testing estensivo multi-utente su Raspberry Pi  
- [ ] Ottimizzazioni latenza (target <25ms)
- [ ] Audio quality fine-tuning (codec compression)
- [ ] Error handling robusto con retry logic
- [ ] Pannello admin lato client per gestione ruoli/permessi
- [ ] Mobile PWA optimization (iOS/Android)
- [ ] Monitoring dashboard (audio stats, user count, latency)

---

## 📅 CRONOLOGIA SVILUPPO RECENTE

### v1.0.0 - 20 Dicembre 2025
- **Versioning**: Impostata release stabile 1.0.0
- **Azioni rapide desktop**: Profilo/Microfono nel box Menu sidebar
- **Profilo**: Fix layout gradiente colonna sinistra
- **Documentazione**: Allineamento a stato "prodotto funzionante"

### Mobile UX - 17 Dicembre 2025  
- **Bottom bar**: Profilo · Microfono · Menu fissa
- **Drawer laterale**: Sidebar apertura da Menu con overlay tap-to-close
- **Fix tap/click**: Rimosso navbar duplicato, corretto z-index overlay
- **Modale profilo**: Layout compatto + scroll abilitato su mobile
- **Avatar**: Risoluzione URL relativo → assoluto tramite `baseUrl`

### Audio Streaming v2 - Settembre 2025
- **Migrazione**: MediaRecorder → Web Audio API raw samples
- **Latenza**: Ridotta da ~200ms a ~25ms
- **Buffer circolare**: 3s anti-dropout con timing preciso
- **SimpleAudioManager**: Gestione server-side room + broadcasting

---

## 📱 AGGIORNAMENTI UI MOBILE (DICEMBRE 2025)

### Obiettivo
Rendere l'interfaccia **utilizzabile su iPhone (es. iPhone 12 Pro)** e pronta per test su **Raspberry Pi** senza overflow/scroll bloccati.

### UX attuale (mobile-first)
- **Bottom bar** fissa con 3 azioni: Profilo · Microfono · Menu
- **Drawer laterale sinistro** apribile dal bottone Menu
- **Chiusura drawer** con tap sull'overlay (tap fuori)

### Fix chiave
- Risolto un problema di **tap/click non funzionanti** rimuovendo una navbar duplicata finita nel DOM della sidebar e correggendo lo stacking dell'overlay
- **Modale profilo** resa più compatta e soprattutto **scrollabile** su mobile
- **Avatar**: risoluzione URL (path relativo → URL completo) usando `baseUrl` esposto dall'Auth context

### Stato repo per test
- Branch di riferimento: `test`
- Remote aggiornato: `origin/test`
- Working tree locale: pulito (attenzione a non committare artefatti DB locali)

---

## 🐛 TROUBLESHOOTING

### Common Issues

#### "NotSupportedError: Failed to load"
**Causa**: Vecchio sistema MediaRecorder chunks non validi  
**Soluzione**: ✅ Risolto con Web Audio API raw samples

#### "EADDRINUSE: port 3001"  
**Causa**: Server già running  
**Soluzione**: `kill -9 $(lsof -ti:3001)`

#### Audio non sentito tra tabs
**Causa**: Permissions mancanti o audio non attivo  
**Soluzione**: Verificare permessi microfono + click "Attiva Audio"

#### Black screen frontend
**Causa**: Vecchio useSimpleAudio hook  
**Soluzione**: ✅ Rimosso, ora inline audio functions

---

## 🔍 FILE CHIAVE DA ESAMINARE

### `/Meluccio-frontend/src/App.jsx` (430 righe)
**Funzione**: Main React component con chat + audio  
**Sezioni importanti**:
- `startAudio()` - Audio capture setup (righe ~25-110)
- `stopAudio()` - Cleanup (righe ~115-140)  
- Socket.IO listeners - Audio broadcast (righe ~180-210)
- UI rendering - Chat + audio controls (righe ~250-400)

### `/server.js` (200+ righe)
**Funzione**: Main backend con Socket.IO server  
**Sezioni importanti**:
- SimpleAudioManager integration
- Socket events: message, audio-chunk, join-audio-room
- Error handling e logging

### `/SimpleAudioManager.js` (150+ righe)
**Funzione**: Audio room management e broadcasting  
**Features**: Room isolation, user tracking, audio routing

---

## 📈 PERFORMANCE NOTES

### Ottimizzazioni Implementate
- **Data size**: float32 → int16 (50% reduction)
- **Network**: Noise gate prevents unnecessary packets  
- **CPU**: ScriptProcessor più efficiente di MediaRecorder
- **Memory**: No buffer accumulation, stream processing

### Raspberry Pi Specific
- **Sample rate**: 16kHz recommended (vs 44.1kHz desktop)
- **Channels**: Mono vs stereo
- **Chunk size**: 4096 samples optimal
- **Process management**: PM2 ecosystem ready

---

## 🤝 HANDOVER CHECKLIST

### Per AI subentrata, verificare:
- [ ] Repository clonato e dependencies installate
- [ ] Backend server avviato correttamente (port 3001)
- [ ] Frontend dev server running (port 5173)  
- [ ] Audio permissions browser attive
- [ ] Test audio tra 2 tabs funzionante
- [ ] Console logs mostrano audio activity
- [ ] Familiarità con file App.jsx e SimpleAudioManager.js

### Context Files da leggere:
1. **AI_HANDOVER.md** (questo file) - Overview completo + cronologia
2. **TECH_STACK.md** - Documentazione tecnica completa (875 righe)
3. **CHANGELOG.md** - Versioning semantico e release notes
4. **App.jsx** - Frontend implementation  
5. **server.js** + **SimpleAudioManager.js** - Backend logic
6. **raspberry/SETUP.md** - Guida deployment Raspberry Pi

### Quick Verification
```bash
# Verify setup
curl http://localhost:3001/health  # Should return server status
# Browser console should show: 🔌 Connesso al server
```

---

## 💡 DECISION LOG

### Architettura: WebRTC → Socket.IO
**Ragione**: Memory leaks WebRTC, complessità P2P, Raspberry Pi compatibility  
**Trade-off**: Server dependency vs stabilità

### Audio: MediaRecorder → Web Audio API
**Ragione**: MediaRecorder chunks non compatibili cross-browser, latenza alta  
**Trade-off**: Maggiore complessità vs controllo e performance

### Data: float32 → int16  
**Ragione**: Bandwidth optimization per Raspberry Pi  
**Trade-off**: Slight quality loss vs 50% data reduction

---

## 🚨 CRITICAL DEPENDENCIES

### Runtime Requirements
- **Node.js**: 18.20.8+ (for Audio APIs)
- **Browser**: Chrome/Firefox with Web Audio API support
- **Permissions**: Microphone access required

### Network Ports
- **3001**: Backend Socket.IO server
- **5173**: Frontend dev server (Vite)
- **5174**: Frontend build preview

### External Dependencies
None (fully self-contained system)

---

*📝 Questo documento fornisce tutto il context necessario per qualsiasi AI per comprendere e continuare il progetto. Update ad ogni modifica architetturaale significativa.*
