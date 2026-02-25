# 📋 DEVLOG - Melo Project
> **Diario di bordo dello sviluppo** | Ultima modifica: 25 Febbraio 2026

## 🎯 STATUS PROGETTO
- **Stato attuale**: ✅ Audio streaming stabile · ✅ UX mobile pronta · ✅ Recupero credenziali · 📱 Pianificazione Android in corso
- **Ultima sessione**: Pianificazione strategica Android/Termux + creazione branch `feature/android-support`
- **Prossimi obiettivi**: Setup Termux su Huawei Mate 10 Pro · Fix `sqlite3` ARM64 · Test backend da device
- **Branch corrente**: `feature/android-support`

---

## 🏗️ ARCHITETTURA CORRENTE

### Frontend (React + Vite)
- **File principale**: `Meluccio-frontend/src/App.jsx`
- **Port**: 5173 (dev) / 5174 (build)
- **Tech stack**: React 19.0.0, Socket.IO client, Web Audio API
- **Audio**: ScriptProcessor + AudioContext per streaming real-time

### Backend (Node.js + Express)
- **File principale**: `server.js`
- **Port**: 3001
- **Tech stack**: Node.js 18.20.8, Express, Socket.IO server
- **Audio manager**: `SimpleAudioManager.js` per room-based audio
- **Permessi**: Tabelle `server_roles`, `server_members`, `server_role_permissions` con seed owner/member

### Target deployment
- **Hardware**: Raspberry Pi 3B+
- **Ottimizzazioni**: 16kHz mono, low-latency processing

---

## 📅 CRONOLOGIA SVILUPPO

### 📱 Sessione 25 Febbraio 2026 — PIANIFICAZIONE ANDROID
**Focus**: Avvio del piano di sviluppo per supporto Android (Termux) su Huawei Mate 10 Pro

#### Attività completate:
1. Analisi completa compatibilità stack esistente con ambiente Termux/ARM64
2. Creato branch `feature/android-support` (pubblicato su GitHub)
3. Redatto documento `android/ANDROID_PLAN.md` con:
   - Analisi tecnica di compatibilità (backend, frontend, audio, networking)
   - Analisi dei rischi (10 rischi identificati con mitigazione)
   - Roadmap a 3 fasi (Termux → Script Android → App Nativa)
   - 5 Milestone con criteri di accettazione
   - Tabella differenze Raspberry ↔ Android
   - Checklist operativa Sprint 1/2/3
4. Identificato problema critico: `sqlite3` richiede compilazione su ARM (soluzione: `--build-from-source` o `better-sqlite3`)
5. Identificato workaround per Android Doze Mode: `termux-wake-lock` + `termux-services`

#### Architettura confermata (Fase 1):
- Backend Node.js gira in Termux sulla porta 3001
- Frontend React (build statica) servito da Express
- Chrome Android apre `http://localhost:3001` per accedere alla UI
- Web Audio API / getUserMedia opera nel browser, non in Termux

#### 🐛 Bug trovato e documentato (sessione serale 25 Feb):
- `sqlite3` non compila su Android/Termux: causa **`No module named 'distutils'`**
  - Root cause: `node-gyp 8.4.1` (bundled npm 11) usa `distutils`, rimosso in Python 3.12
  - Termux installa `nodejs-lts 24.13.0` + `python 3.12.12` → combinazione rotta
  - Fix: `pip install setuptools` ripristina distutils + `npm install -g node-gyp@latest`
  - Script dedicato: `android/fix-sqlite3.sh`
- `install.sh` aggiornato con il fix preventivo (setuptools + node-gyp upgrade prima di npm install)
- `SETUP.md` aggiornato con troubleshooting preciso
- **Buona notizia**: frontend build (`npm run build`) completata con successo su ARM64 in 59s

#### TODO Sprint 1:
- [x] Installare Termux da F-Droid sul Huawei Mate 10 Pro
- [x] Eseguire `pkg install nodejs-lts python clang make git`
- [x] Clonare repo e fare checkout `feature/android-support`
- [x] Eseguire `android/install.sh` (completato)
- [x] Frontend compilato con successo (dist/ generata sul device)
- [ ] **NEXT**: Eseguire `bash android/fix-sqlite3.sh` per fix sqlite3
- [ ] Smoke test: `node server.js` + login da Chrome Android

---

### ✅ Sessione 20 Dicembre 2025 - RELEASE 1.0.0
**Focus**: Consolidamento prodotto (quasi completo) + rifiniture UX

#### Attività completate:
1. Versioning: impostata release `1.0.0` (root + frontend)
2. Azioni rapide desktop: pulsanti Profilo e Microfono inseriti nel box **Menu** della sidebar
3. Profilo: fix layout colonna sinistra (gradiente esteso a tutta l’altezza del box)
4. Allineamento documentazione a stato “prodotto funzionante / quasi completo”

#### Note operative:
- Continuare a usare il branch `test` per i deploy Raspberry, poi merge su `main` quando stabile

### 📱 Sessione 17 Dicembre 2025 - COMPLETATA
**Focus**: UX mobile “app-like” (bottom bar + drawer), profilo usabile su iPhone, fix tap/click

#### Attività completate:
1. Implementata bottom bar mobile con azioni: Profilo · Microfono · Menu
2. Aggiunto drawer laterale sinistro (menu) con overlay e chiusura “tap fuori”
3. Sistemata la logica toggle: Profilo apre/chiude; Menu chiude profilo e apre/chiude drawer
4. Risolto bug critico “menu non cliccabile” (navbar duplicata nella sidebar + overlay che intercettava input)
5. Modale profilo resa più compatta e **scrollabile** su mobile (max-height + overflow)
6. Avatar: normalizzazione URL (path relativo → URL assoluto) tramite `baseUrl` dell’Auth context
7. Commit e push su `origin/test` per test su Raspberry

#### Note operative:
- Evitare di committare artefatti locali tipo `database/melo_chat.db` quando si fanno prove locali

#### TODO immediati:
- [ ] Test su Raspberry: `git checkout test && git pull`, rebuild/restart (PM2/script) e smoke test mobile
- [ ] Verifica su iPhone: drawer cliccabile, scroll profilo, chat vuota (altezza), safe-area bottom

### 🛠️ Sessione 11 Dicembre 2025 - IN CORSO
**Focus**: Recupero credenziali (password + username), email SMTP e flusso token

#### Attività completate:
1. Aggiunto endpoint backend `POST /api/auth/forgot-username` con email di promemoria
2. Esteso `sendPasswordResetEmail` per includere il token in chiaro oltre al link
3. Creato `sendUsernameReminderEmail` per recap username e logging debug
4. Modal frontend unificato: selezione recupero password/username, parsing token da URL e auto-verifica
5. Gestione `PASSWORD_RESET_DEBUG` e log token per ambienti di test

#### TODO immediati:
- [ ] Test end-to-end multi-browser del flusso password (richiesta → token → reset → login)
- [ ] Test recap username via SMTP con provider alternativi (non-Gmail) per deliverability
- [ ] Piccole migliorie UX copy nel modal (messaggi di conferma differenziati)

### 🛠️ Sessione 6 Dicembre 2025 - COMPLETATA
**Focus**: Preparazione Raspberry Pi & consolidamento branch `test`

#### Attività completate:
1. Audit branch attivi (`feature/mobile-ui`, `audio-streaming-v1`, `test`) e piano di merge su `test`
2. Aggiornamento credenziali GitHub per Raspberry Pi 3B (SSH key Ed25519 + trust host)
3. Clonazione repository su Raspberry e allineamento al branch `test`
4. Definizione procedura di deploy manuale (pull → install → build → pm2)
5. Creazione guida `raspberry/SETUP.md` con checklist completa e prossimi step
6. Automatizzazione setup/deploy (`raspberry/install-deps.sh`, `raspberry/manual-deploy.sh`) e suite test (`raspberry/tests/*`)
7. Configurazione tunnel ngrok su Raspberry (token, PM2 dedicato, endpoint verificati)
8. Validazione script test (`sqlite-health`, `stress-http`, `tunnel-check`) con risultati documentati
  - Stress test `/health`: ~146 req/s medi, latenza p50 ~133 ms su Raspberry Pi 3B
  - SQLite integrity check: ok, dimensione DB ~0.48 MB

#### TODO immediati:
- [ ] Benchmark approfondito Node + SQLite su Raspberry e monitoraggio CPU/RAM a lungo termine
- [ ] Stesura piano backup/ripristino database e configurazioni ngrok/Tailscale
- [ ] Automatizzare rotazione URL ngrok / aggiornamento client

---

### 📱 Sessione 2 Dicembre 2025 - IN CORSO
**Focus**: Milestone 2 – Ottimizzazione UI/UX mobile e persistenza chat

#### Modifiche principali:
1. **Layout**: `Meluccio-frontend/src/App.jsx` ora mobile-first con header/footer sticky e toggle sidebar
2. **Utility CSS**: `Meluccio-frontend/src/Global.css` arricchito con classi safe-area e pannello mobile scrollabile
3. **Sidebar**: Azioni rapide, link e elenco canali/utenti consolidati nella nuova barra laterale mobile
4. **Auth layout**: Pagina di login ridisegnata con hero compatto, toggle segmentato e card mobile-first
5. **Styling form**: `Meluccio-frontend/src/LoginForm.jsx` e `Meluccio-frontend/src/RegisterForm.jsx` con spacing tipografia ottimizzati per schermi piccoli
6. **Bugfix**: Toggle microfono unico nella sidebar e cleanup membership canali per prevenire duplicati utenti
7. **Chat history**: `server.js` e `Meluccio-frontend/src/App.jsx` ora salvano e sincronizzano la cronologia messaggi da database
8. **Clear chat**: Pulsante "Svuota chat" con feedback stato ed errori lato client via Socket.IO
9. **Ruoli & permessi**: Schema SQLite esteso (`server_roles`, `server_members`) e controlli permesso in `server.js` per chat clear/send

#### Stato test & note:
- 🔄 Da verificare comportamento sticky con tastiera mobile aperta
- 🔄 Valutare bottom nav dedicata dopo review team
- 🔄 Test end-to-end multi-client per cronologia persistente e comando svuota chat
- 🔄 UI gestione ruoli/permessi lato frontend + inviti canale

### 🔥 **Sessione 1 Settembre 2025 - COMPLETATA**
**Problema**: Memory leaks e crash con WebRTC P2P
**Soluzione**: Migrazione completa a server-based con Socket.IO + Audio streaming ottimizzato

#### Modifiche principali:
1. **Architettura**: WebRTC P2P → Server-based Socket.IO ✅
2. **Audio system**: MediaRecorder chunks → Web Audio API raw samples ✅  
3. **Frontend**: Rimosso useSimpleAudio hook, implementato inline audio ✅
4. **Backend**: Creato SimpleAudioManager per gestione room audio ✅
5. **Audio streaming**: Sistema buffer circolare con timing perfetto ✅

#### File modificati:
- ✅ `App.jsx` - Sistema audio completo con streaming continuo ottimizzato
- ✅ `server.js` - Server Socket.IO con audio manager + handler stream
- ✅ `SimpleAudioManager.js` - Gestione room e broadcast audio + stream support  
- ✅ `TECH_STACK.md` - Documentazione completa (875 righe)
- ✅ `AI_HANDOVER.md` - Documentazione per AI subentrate

#### Issues risolti:
- ❌ **WebRTC memory leaks** → ✅ Socket.IO stabile
- ❌ **useSimpleAudio black screen** → ✅ Inline audio functions  
- ❌ **MediaRecorder NotSupportedError** → ✅ Raw audio samples
- ❌ **Audio "ballerino" e con salti** → ✅ Buffer circolare + timing perfetto
- ❌ **ScriptProcessor deprecation** → ✅ Sistema moderno ottimizzato

#### Sistema audio finale:
- **Invio**: ScriptProcessor 512 samples, RMS 0.005, float32 + smoothing
- **Trasporto**: Socket.IO evento `audio-stream` real-time  
- **Ricezione**: Buffer circolare 3s, playback timing perfetto 1024 samples
- **Qualità**: Latenza ~25ms, audio naturale e continuo

---

## 🎵 SISTEMA AUDIO DETTAGLI

### Invio Audio (Frontend)
```javascript
// ScriptProcessor per cattura real-time
scriptProcessor.onaudioprocess = (event) => {
  const inputData = event.inputBuffer.getChannelData(0);
  const int16Data = new Int16Array(inputData.length);
  // Conversione float32 → int16 per ottimizzazione
  socket.emit('audio-chunk', { audioData: Array.from(int16Data) });
}
```

### Ricezione Audio (Frontend)
```javascript
// Conversione int16 → float32 + AudioBuffer playback
newSocket.on('audio-broadcast', (audioData) => {
  const audioBuffer = audioContext.createBuffer(1, data.length, sampleRate);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.start();
});
```

### Gestione Server (Backend)
```javascript
// Room-based audio isolation
socket.on('audio-chunk', (data) => {
  audioManager.broadcastAudio(socket.id, data, data.channelId);
});
```

---

## 🚀 COMANDI QUICK-START

### Sviluppo locale
```bash
# Backend
cd /Users/erry002/Documents/GitHub/Melo_project
node server.js

# Frontend  
cd Meluccio-frontend
npm run dev
```

### Testing audio
1. Apri due tab: `http://localhost:5173`
2. Attiva audio in entrambe
3. Parla in una tab → senti nell'altra

### Debug utili
```bash
# Porta occupata
lsof -ti:3001 && kill -9 $(lsof -ti:3001)

# Logs server
tail -f logs/server.log
```

---

## 🐛 ISSUES TRACKER

### ✅ Risolti
- **WebRTC memory leaks** - Migrazione a Socket.IO
- **MediaRecorder codec errors** - Switch a Web Audio API
- **useSimpleAudio crashes** - Inline implementation

### 🔄 In progress  
- **Multi-user testing** - Sistema implementato, testing needed
- **Audio quality optimization** - int16 samples working

### 📋 TODO
- [ ] Testing estensivo multi-utente  
- [ ] Ottimizzazioni latenza su Raspberry Pi
- [ ] Audio quality fine-tuning
- [ ] Error handling robusto
- [ ] UI/UX improvements
- [ ] Pannello ruoli/admin lato client con assegnazione permessi
- [ ] Flusso recupero password (bottone "Password dimenticata" + reset)

---

## 🔧 CONFIGURAZIONI CHIAVE

### Audio Settings
- **Sample rate**: 44.1kHz (configurable)
- **Chunk size**: 4096 samples
- **Format**: int16 (da float32)
- **Threshold**: 0.01 (noise gate)

### Socket.IO Events
- `audio-chunk` - Invio dati audio raw
- `audio-broadcast` - Ricezione dati per playback  
- `join-audio-room` - Gestione room audio
- `message` - Chat real-time
- `channelHistory` - Invio cronologia messaggi persistita
- `chatCleared` - Notifica svuotamento chat
- `chat-error` - Eventi errore chat lato client

### Performance
- **Raspberry Pi**: 16kHz mono recommended
- **Desktop**: 44.1kHz stereo supportato
- **Latency**: ~100ms target

---

## 💡 NOTE TECNICHE

### Perché Web Audio API vs MediaRecorder?
- ✅ **Latenza**: Molto più bassa (~50ms vs ~200ms)
- ✅ **Controllo**: Accesso diretto ai samples audio
- ✅ **Compatibilità**: Funziona meglio cross-browser
- ✅ **Raspberry Pi**: Meno overhead computazionale

### Ottimizzazioni implementate
- **Noise gate**: Invio solo con attività audio > 0.01
- **Data compression**: float32 → int16 (50% size reduction)
- **Room isolation**: Audio broadcast solo nella stessa room

---

## 📚 RIFERIMENTI RAPIDI

### File importanti
- `App.jsx` - Frontend audio + chat
- `server.js` - Main server con Socket.IO
- `SimpleAudioManager.js` - Audio room management
- `TECH_STACK.md` - Documentazione completa
- `package.json` - Dependencies e scripts

### Ports
- **3001**: Backend server
- **5173**: Frontend dev server  
- **5174**: Frontend build preview

### Dependencies principali
- React 19.0.0, Socket.IO, Web Audio API
- Node.js 18.20.8, Express, PM2

---

## 🎉 MILESTONE RAGGIUNTI

- ✅ **Chat real-time** funzionante
- ✅ **Audio streaming** bidirezionale
- ✅ **Room management** audio
- ✅ **Documentazione** completa
- ✅ **Architecture** scalabile per Raspberry Pi

---

*💡 Questo file viene aggiornato ad ogni sessione di sviluppo significativa*
