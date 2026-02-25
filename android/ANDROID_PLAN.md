# 📱 Meluccio Chat — Piano di Sviluppo Android
> **Branch**: `feature/android-support`  
> **Redatto**: 25 Febbraio 2026  
> **Team**: Erry002  
> **Target hardware**: Huawei Mate 10 Pro · Kirin 970 · ARM64 · Android 10  
> **Approccio iniziale**: Terminal-based via Termux  

---

## 📋 Indice

1. [Executive Summary](#-executive-summary)
2. [Analisi Tecnica di Compatibilità](#-analisi-tecnica-di-compatibilità)
3. [Requisiti Tecnici](#-requisiti-tecnici)
4. [Analisi dei Rischi](#-analisi-dei-rischi)
5. [Architettura Target](#-architettura-target)
6. [Roadmap & Milestone](#-roadmap--milestone)
7. [Fase 1 — Setup Termux](#-fase-1--setup-termux-sprint-1)
8. [Fase 2 — Adattamento Script](#-fase-2--adattamento-script-sprint-2)
9. [Fase 3 — App Nativa Futura](#-fase-3--evoluzione-verso-app-nativa)
10. [Differenze Raspberry vs Android](#-differenze-raspberry-vs-android)
11. [Checklist Operativa](#-checklist-operativa)

---

## 🎯 Executive Summary

**Obiettivo**: Rendere Meluccio Chat eseguibile su dispositivo Android (Huawei Mate 10 Pro)
tramite Termux, mantenendo la piena compatibilità con il deployment esistente su Raspberry Pi 3B+.

**Approccio a tre fasi**:
| Fase | Descrizione | Stima |
|------|-------------|-------|
| **Fase 1** | Backend in Termux, frontend via browser Chrome | 1-2 settimane |
| **Fase 2** | Script dedicati Android, ottimizzazioni ARM64 | 2-3 settimane |
| **Fase 3** | App Android nativa (opzionale, futuro) | TBD |

**Decisione architetturale chiave**: La Web Audio API e getUserMedia **non sono disponibili** in Termux
(ambiente terminale). Il frontend React **deve essere aperto in Chrome su Android** e puntare al
backend che gira su Termux. Questo è il medesimo pattern usato su Raspberry Pi.

> ✅ **Root NON richiesto.** Tutto il workflow — installazione Node.js, compilazione `sqlite3`,
> avvio del server, gestione WakeLock — opera esclusivamente nello spazio utente di Termux
> (`$HOME` = `/data/data/com.termux/files/home`). Nessun accesso a partizioni di sistema Android.

---

## 🔬 Analisi Tecnica di Compatibilità

### Backend (Node.js + Express + Socket.IO)

| Componente | Stato su Termux | Note |
|------------|-----------------|------|
| `node` ≥ 18 | ✅ Disponibile | `pkg install nodejs-lts` |
| `npm` | ✅ Incluso | — |
| `express` | ✅ Compatibile | Pure JS |
| `socket.io` | ✅ Compatibile | Pure JS |
| `jsonwebtoken` | ✅ Compatibile | Pure JS |
| `dotenv` | ✅ Compatibile | Pure JS |
| `cors` | ✅ Compatibile | Pure JS |
| `multer` | ✅ Compatibile | Pure JS |
| `nodemailer` | ✅ Compatibile | Pure JS |
| `uuid` | ✅ Compatibile | Pure JS |
| `bcryptjs` | ✅ Compatibile | Pure JS (no native bindings) |
| `sqlite` | ✅ Compatibile | Pure JS (driver) |
| `sqlite3` | ⚠️ **Richiede compilazione** | Serve: `python`, `clang`, `make` |

> **Nota critica su `sqlite3`**: questo pacchetto ha binding nativi in C++.
> Su Termux è necessario installare le build tools prima di `npm install`.
> Alternativa: valutare migrazione a `better-sqlite3` che ha un processo di
> build più affidabile su ARM, oppure compilare con il flag `--build-from-source`.

### Frontend (React + Vite)

| Funzionalità | Disponibilità | Dettaglio |
|--------------|---------------|-----------|
| Build React/Vite | ✅ Build eseguibile in Termux | `npm run build` → cartella `dist/` |
| Serving file statici | ✅ Tramite Express o `serve` | Backend già serve `dist/` |
| Web Audio API | ❌ Non in Termux | Solo in browser (Chrome) |
| getUserMedia (mic) | ❌ Non in Termux | Solo in browser (Chrome) |
| Socket.IO client | ✅ Nel browser | — |
| HTTPS / WSS | ⚠️ Richiede ngrok o IP locale | Stesso approccio Raspberry |

**Conclusione frontend**: il frontend viene **servito da Express** (production build) e aperto in
**Chrome su Android**. Non è necessario eseguire Vite in Termux.

### Processo Manager

| Tool | Stato | Note |
|------|-------|------|
| PM2 | ⚠️ Funziona parzialmente | Gestione process OK; i daemon di sistema vengono kills da Android Doze |
| Termux services | ✅ Raccomandato | `termux-services` — esegue script come servizi foreground |
| Background nativo | ⚠️ Vincolato da Android Doze | WakeLock richiesto per sessioni lunghe |

### Networking

| Servizio | Stato | Note |
|----------|-------|------|
| ngrok | ✅ Disponibile per ARM64 | `.` disponibile dal sito ufficiale |
| Rete locale (LAN) | ✅ Preferibile | Latenza minima; nessun tunnel necessario |
| IP pubblico dinamico | ⚠️ Dipende dall'operatore | Molti carrier non assegnano IP pubblico a SIM |

---

## 📋 Requisiti Tecnici

### Requisiti Termux (da installare sul dispositivo)

```bash
# Aggiornamento repository
pkg upgrade -y

# Dipendenze di sistema
pkg install -y nodejs-lts python clang make git

# Strumenti opzionali
pkg install -y openssh curl wget nano

# Build tools per moduli nativi Node.js
npm install -g node-gyp

# Termux services (per avvio automatico processo)
pkg install termux-services
```

### Requisiti Node.js / npm

- Node.js: `>= 18.0.0` (LTS disponibile su Termux)
- npm: `>= 8.0.0`
- Dipendenze da ricompilare su ARM64: `sqlite3`

### File `.env` richiesto

```env
PORT=3001
JWT_SECRET=<tua_chiave>
NODE_ENV=production
# Email opzionale
# SMTP_HOST=...
```

### Hardware consigliato

| Risorsa | Minimo | Raccomandato |
|---------|--------|--------------|
| RAM libera | 512 MB | 1 GB+ |
| Storage | 500 MB | 2 GB |
| CPU | ARMv7 | ARM64 (Kirin 970 ✅) |
| Batteria | Modalità risparmio OFF | Plugin carica |
| Android | 8.0+ | 10+ |

---

## ⚠️ Analisi dei Rischi

### Rischi Tecnici

| ID | Rischio | Probabilità | Impatto | Mitigazione |
|----|---------|-------------|---------|-------------|
| R1 | `sqlite3` non si compila su ARM | **Alta** | Alto | Usare `better-sqlite3` o wrapper JS; testare build su device |
| R2 | Android Doze Mode killa il processo Node | **Alta** | Alto | `termux-wake-lock`; tenere schermo attivo o usare `termux-services` |
| R3 | Ngrok rallenta connessione audio | Media | Medio | Preferire LAN WiFi; ngrok solo per accesso remoto |
| R4 | Memoria insufficiente (altri app in foreground) | Media | Medio | Chiudere app background; limite 350M confermato compatibile |
| R5 | Build frontend fallisce per memoria | Bassa | Medio | Fare build su macOS e copiare la `dist/` sul device via `scp` |
| R6 | Android 10 restrizioni su operazioni network | Bassa | Alto | Verificare permessi `INTERNET` in Termux settings |
| R7 | Aggiornamenti Termux rompono dipendenze | Bassa | Basso | Fissare versioni in `package.json`; testare dopo ogni `pkg upgrade` |
| R11 | EMUI killa Termux entro pochi minuti | **Alta** (Huawei-specific) | Alto | Configurare "Avvio app" e "App protette" in Impostazioni Batteria EMUI; WakeLock; device in carica |

### Rischi Operativi

| ID | Rischio | Mitigazione |
|----|---------|-------------|
| R8 | Lo script Raspberry non funziona su Termux | Script separati `android/` (questo branch) |
| R9 | Path hardcoded `/home/erry002` negli script esistenti | Usare `$HOME` dinamico negli script Android |
| R10 | PM2 non disponibile / instabile | Sostituire con processo lanciato da Termux + `&` e log su file |

### Vincolo: Nessun accesso root

Il device non dispone di root. Tutte le operazioni devono funzionare nel contesto utente Termux.
Operazioni **escluse** di conseguenza:

| Operazione root | Alternativa no-root usata |
|-----------------|---------------------------|
| `sudo apt-get` | `pkg install` (Termux pkg manager, no root) |
| Disabilitare Doze Mode via ADB/sistema | `termux-wake-lock` + impostazioni EMUI manuale |
| `lsof -i :PORT` (richiede root su Android) | `awk` su `/proc/net/tcp` + `killall node` |
| Installare servizi systemd | `termux-services` (userspace) |
| `sysctl` / tuning kernel | Non applicabile — ottimizzazioni disabilitate |
| Accesso a `/system`, `/proc/sys` in scrittura | Non necessario per questo stack |

---

## 🏗️ Architettura Target (Fase 1)

```
Android Device (Huawei Mate 10 Pro)
│
├── Termux (terminal emulator)
│   ├── Node.js 18 LTS
│   ├── server.js  ──────────────────► porta 3001
│   │     ├── Express (REST API)
│   │     ├── Socket.IO (WebSocket)
│   │     ├── SQLite database
│   │     └── Serve frontend (dist/)
│   └── ngrok (opzionale)  ──────────► tunnel HTTPS
│
└── Chrome per Android
    └── http://localhost:3001  ────────► UI React
          ├── Web Audio API  ◄────────── getUserMedia (mic)
          └── Socket.IO client  ◄──────── WebSocket
```

**Flusso audio**:
- Il microfono viene catturato da Chrome su Android (non da Termux)
- L'audio viene inviato via Socket.IO al backend Node.js in Termux
- Lo stesso backend ridistribuisce agli altri client connessi

---

## 🗺️ Roadmap & Milestone

### Timeline Generale

```
Feb 2026        Mar 2026        Apr 2026        Mag 2026+
    │               │               │               │
    ▼               ▼               ▼               ▼
[Setup Termux] [Script Android] [Test & Fix]  [App Nativa?]
[Branch crea-] [Ottimizzazioni] [Documenta-]  [React Native]
[zione ✅    ] [sqlite3 fix   ] [zione      ]  [o PWA       ]
```

### Milestone

#### M1 — Backend operativo su Termux
**Target**: Entro 1 settimana  
**Criteri di accettazione**:
- [ ] `npm install` completa senza errori (incluso `sqlite3`)
- [ ] `node server.js` avviato senza crash
- [ ] API REST risponde su `http://localhost:3001/api/health`
- [ ] Database SQLite si inizializza correttamente

#### M2 — Frontend accessibile da Chrome su Android
**Target**: Entro 10 giorni  
**Criteri di accettazione**:
- [ ] `npm run build` completato (frontend)
- [ ] Express serve la `dist/` su porta 3001
- [ ] Il frontend si apre in Chrome Android senza errori
- [ ] Login / registrazione funzionanti

#### M3 — Audio funzionante su rete locale
**Target**: Entro 2 settimane  
**Criteri di accettazione**:
- [ ] Chrome Android richiede e riceve permesso microfono
- [ ] Stream audio inviato e ricevuto correttamente
- [ ] Test con almeno 2 client connessi simultaneamente

#### M4 — Script di avvio dedicati Android
**Target**: Entro 3 settimane  
**Criteri di accettazione**:
- [ ] Script `android/install.sh` funzionante su Termux
- [ ] Script `android/start.sh` avvia il server con un comando
- [ ] Documentazione differenze Raspberry ↔ Android completa

#### M5 — Stabilità e documentazione
**Target**: Entro 4 settimane  
**Criteri di accettazione**:
- [ ] 24h di uptime senza crash (con device in carica)
- [ ] Gestione Doze Mode documentata e mitigata
- [ ] Merge request verso `test` pronta per review

---

## 🔧 Fase 1 — Setup Termux (Sprint 1)

### Procedura di installazione manuale (da eseguire sul device)

```bash
# 1. Aggiorna Termux
pkg update && pkg upgrade -y

# 2. Installa dipendenze sistema
pkg install -y nodejs-lts python clang make git openssh

# 3. Clona il repository (o copia via scp/USB)
git clone https://github.com/Erry002/Melo_project.git
cd Melo_project
git checkout feature/android-support

# 4. Installa dipendenze backend
npm install

# 5. Crea file .env
cp .env.example .env  # oppure crealo manualmente
nano .env

# 6. Avvia il server
node server.js
```

### Installazione `sqlite3` su ARM (workaround)

Se `npm install` fallisce su `sqlite3`:

```bash
# Opzione A: build esplicita
npm install sqlite3 --build-from-source

# Opzione B: usa better-sqlite3 (da valutare in fase 2)
# npm uninstall sqlite3
# npm install better-sqlite3

# Opzione C: fallback a sqlite puro JS (solo driver, senza native)
# Già presente in package.json come 'sqlite' — verificare compatibilità
```

---

## 🔧 Fase 2 — Adattamento Script (Sprint 2)

Gli script nella cartella `android/` verranno sviluppati in questo sprint:

```
android/
├── install.sh          ← installazione completa su Termux
├── start.sh            ← avvio backend
├── start-dev.sh        ← avvio in modalità development
├── stop.sh             ← stop del processo
├── status.sh           ← check stato server
├── update.sh           ← git pull + restart
├── build-frontend.sh   ← build frontend da Termux
└── SETUP.md            ← guida passo-passo per il device
```

### Modifiche agli script esistenti (raspberry/)

| File | Modifica necessaria | Priorità |
|------|---------------------|----------|
| `install.sh` | Rimuovere `apt-get`, sostituire con `pkg` | Alta |
| `start-dev.sh` | Path `/home/erry002` → `$HOME` | Alta |
| `ecosystem.config.cjs` | PM2 → avvio diretto (Termux non ha systemd) | Media |
| `optimize.sh` | `sysctl` non disponibile in Termux | Media |

---

## 🚀 Fase 3 — Evoluzione verso App Nativa

> **Nota**: questa fase è pianificazione futura, non implementazione immediata.

### Opzione A — Progressive Web App (PWA)
**Effort**: Basso  
**Pro**: zero codice nativo, installa da Chrome, usa le stesse API  
**Contro**: limitazioni audio background su Android  
**Azioni**:
- Aggiungere `manifest.json` al frontend
- Registrare un Service Worker
- Abilitare HTTPS (requis. per PWA)

### Opzione B — React Native
**Effort**: Alto  
**Pro**: accesso completo alle API Android, performance nativa  
**Contro**: codebase separata dal frontend React Web  
**Considerazioni**:
- Riuso della logica business e degli hook
- Socket.IO supportato (`socket.io-client` funziona)
- Audio: libreria `react-native-audio-recorder-player` o WebRTC nativo

### Opzione C — Capacitor (Ionic)
**Effort**: Medio  
**Pro**: wrappa il frontend React esistente in un'app Android  
**Contro**: limitazioni Web Audio API in WebView  
**Azioni**:
- `npm install @capacitor/core @capacitor/android`
- `npx cap init`
- Adattare le chiamate audio per funzionare in WebView

### Raccomandazione
Per il **breve termine**: PWA (modifica minima al codebase esistente).  
Per il **medio termine**: valutare Capacitor per un'esperienza più nativa.  
Per il **lungo termine**: React Native se si necessita audio background stabile.

---

## 🔄 Differenze Raspberry vs Android

| Aspetto | Raspberry Pi 3B+ | Android (Termux) |
|---------|------------------|-----------------|
| OS | Raspberry Pi OS (Debian ARM) | Android 10 (Termux userspace) |
| Package manager | `apt-get` | `pkg` |
| Process manager | PM2 + systemd | Termux foreground process / termux-services |
| Node.js install | `nodesource` curl script | `pkg install nodejs-lts` |
| Build tools | `build-essential` (apt) | `clang make python` (pkg) |
| nginx | `apt-get install nginx` | Non disponibile (usare Express serve) |
| redis | `apt-get install redis` | Non disponibile (non necessario) |
| certbot | Disponibile | Non necessario (HTTP locale + ngrok HTTPS) |
| File path home | `/home/erry002` | `/data/data/com.termux/files/home` (`$HOME`) |
| Avvio automatico | PM2 `startup` / systemd | `termux-services` o lancio manuale |
| Power management | Nessuna restrizione | Android Doze Mode (processo può essere killa) |
| RAM disponibile | ~1 GB (shared con OS) | ~4-5 GB (Mate 10 Pro 6GB) |
| Rete | Ethernet/WiFi stabile | WiFi/4G variabile |
| Uptime atteso | 24/7 | Limitato alla sessione Termux attiva |

---

## ✅ Checklist Operativa

### Pre-sviluppo (completato)
- [x] Branch `feature/android-support` creato e pubblicato su GitHub
- [x] Analisi compatibilità componenti completata
- [x] Documento di piano scritto

### Sprint 1 — Setup iniziale
- [ ] Installare Termux sul Huawei Mate 10 Pro (F-Droid, non Play Store)
- [ ] Eseguire procedura di installazione manuale (sezione Fase 1)
- [ ] Risolvere eventuale problema di compilazione `sqlite3`
- [ ] Verificare avvio `node server.js` senza errori
- [ ] Aprire frontend in Chrome Android: `http://localhost:3001`
- [ ] Testare login e registrazione
- [ ] Testare connessione vocale con un secondo dispositivo

### Sprint 2 — Script e automazione
- [ ] Creare `android/install.sh`
- [ ] Creare `android/start.sh`
- [ ] Documentare ogni differenza rispetto agli script Raspberry
- [ ] Aggiornare `package.json` con script `android:start` e `android:install`
- [ ] Testare build frontend da Termux (o via pre-build da Mac)

### Sprint 3 — Stabilità
- [ ] Testare uptime 1h, 4h, 8h
- [ ] Documentare comportamento Doze Mode e workaround
- [ ] Creare `android/SETUP.md` (guida utente finale)
- [ ] Aprire Merge Request verso branch `test`

---

## 📊 Budget Risorse (Stima)

| Risorsa | Valore |
|---------|--------|
| **Tempo sviluppo stimato** | 3-4 settimane (part-time) |
| **Costo infrastruttura** | €0 (hardware già disponibile) |
| **Costo ngrok** | €0 (free tier) o ~€8/mese (plan a pagamento per dominio fisso) |
| **Dipendenze aggiuntive** | Nessuna a pagamento |

---

*Documento generato il 25 Febbraio 2026 — branch `feature/android-support`*  
*Da aggiornare progressivamente durante lo sviluppo.*
