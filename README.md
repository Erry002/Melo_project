# 🎙️ Melo Project

**Chat vocale in tempo reale di alta qualità simile a TeamSpeak**

**Versione**: 1.0.0 (20 dicembre 2025)

Un'applicazione moderna per comunicazioni vocali istantanee tra utenti, costruita con tecnologie web avanzate e ottimizzata per performance eccellenti.

[![Node.js](https://img.shields.io/badge/Node.js-18.20.8-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-blue)](https://reactjs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8.1-black)](https://socket.io/)
[![Audio API](https://img.shields.io/badge/Web%20Audio%20API-Latest-orange)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## ✨ Caratteristiche Principali

- 🎵 **Audio HD**: Streaming raw audio con latenza ultra-bassa (~25ms)
- 🔄 **Real-time**: Comunicazione istantanea tramite Socket.IO
- 🎛️ **Audio Engine**: Web Audio API con buffer circolare e timing perfetto
- 🏠 **Room System**: Gestione automatica delle stanze di chat
- 📱 **Responsive**: Interfaccia moderna e adattiva
- 🚀 **Performance**: Ottimizzato per Raspberry Pi e dispositivi limitati

## 🛠️ Stack Tecnologico

### Frontend
- **React 19.0.0** - Framework UI moderno
- **Vite 6.3.5** - Build tool ultra-veloce
- **Socket.IO Client 4.8.1** - Real-time communication
- **Tailwind CSS** - Styling utility-first
- **Web Audio API** - Elaborazione audio nativa

### Backend
- **Node.js 18.20.8** - Runtime JavaScript server-side
- **Express 4.21.2** - Framework web minimalista
- **Socket.IO 4.8.1** - Engine real-time bidirezionale
- **Custom Audio Manager** - Gestione ottimizzata delle sessioni audio

### Audio System
- **Raw Float32 Samples** - Qualità audio nativa senza compressione
- **Circular Buffer (3s)** - Buffering intelligente anti-dropout
- **ScriptProcessor** - Elaborazione audio real-time
- **Timing Precision** - Scheduling basato su AudioContext.currentTime

## 🚀 Installazione

### Prerequisiti

- **Node.js 18+** ([Download](https://nodejs.org/))
- **npm** o **yarn**
- **Browser moderno** con supporto Web Audio API

### Setup Locale

1. **Clona il repository**:
```bash
git clone https://github.com/Erry002/Melo_project.git
cd Melo_project
```

2. **Installa dipendenze backend**:
```bash
npm install
```

3. **Installa dipendenze frontend**:
```bash
cd Meluccio-frontend
npm install
cd ..
```

### ⚡ Avvio Rapido

**Opzione 1: Avvio automatico (raccomandato)**
```bash
npm run dev
```

**Opzione 2: Avvio manuale**
```bash
# Terminal 1 - Backend
npm start

# Terminal 2 - Frontend  
cd Meluccio-frontend
npm run dev
```

🌐 **Apri il browser su**: `http://localhost:5173`

## 📁 Struttura del Progetto

```
Melo_project/
├── 📄 server.js                    # Server Express + Socket.IO
├── 🎵 SimpleAudioManager.js        # Engine gestione audio server-side
├── 📊 package.json                 # Dipendenze e scripts backend
├── 🌐 Meluccio-frontend/          # Applicazione React
│   ├── 📄 src/App.jsx              # Componente principale + audio engine
│   ├── 🎨 src/App.css              # Stili componente
│   ├── 🔧 vite.config.js           # Configurazione Vite
│   ├── 🎯 tailwind.config.cjs      # Configurazione Tailwind
│   └── 📦 package.json             # Dipendenze frontend
├── 🤖 raspberry/                   # Scripts deployment Raspberry Pi
│   ├── 📜 install.sh               # Installazione automatica
│   ├── ⚙️ ecosystem.config.cjs     # Configurazione PM2
│   └── 🔧 optimize.sh              # Ottimizzazioni sistema
└── 📁 docs/                        # Documentazione progetto
    ├── 📁 ai/                      # Documentazione per AI/sviluppatori
    │   ├── AI_HANDOVER.md          # Guida completa per AI (consolidata)
    │   └── TECH_STACK.md           # Documentazione tecnica completa
    ├── CHANGELOG.md                # Release notes e versioning
    ├── mobile-ui-audit.md          # Audit UI mobile
    └── relazione-basi-di-dati.md   # Documentazione database
```

## 🎵 Sistema Audio Avanzato

### Architettura Audio
- **Acquisizione**: ScriptProcessor 512 samples con filtro RMS (0.005)
- **Elaborazione**: Smoothing filter + lowpass 15kHz per qualità ottimale
- **Trasporto**: Socket.IO real-time con eventi `audio-stream`
- **Riproduzione**: Buffer circolare 3s con scheduling perfetto (1024 samples)

### Performance
- ⚡ **Latenza**: ~25ms end-to-end
- 🔊 **Qualità**: Float32 nativo 44.1kHz
- 🛡️ **Stabilità**: Anti-dropout con buffer intelligente
- 🎛️ **Controlli**: Volume, mute, filtri automatici

## 🧪 Testing

### Test Locale
1. Apri **2+ tab** dello stesso browser su `http://localhost:5173`
2. Concedi permessi microfono a tutti i tab
3. Parla in un tab → sentilo negli altri istantaneamente

### Test Multi-Device
1. Connetti dispositivi alla stessa rete
2. Usa l'IP locale del server (es. `http://192.168.1.100:5173`)
3. Testa comunicazione cross-device

## 🐧 Deployment Raspberry Pi

### Setup Consigliato
```bash
# Primo setup dipendenze / tool (Node, pm2, sqlite, jq, ecc.)
./raspberry/install-deps.sh

# Deploy manuale (pull → install → build → pm2 reload)
./raspberry/manual-deploy.sh

# Avvia tunnel ngrok (dopo aver installato il binario e authtoken)
pm2 start raspberry/ecosystem.config.cjs --only ngrok

# Salva i processi per il reboot
pm2 save
```

### Diagnostica & Stress Test
```bash
./raspberry/tests/sqlite-health.sh          # Integrità DB e vacuum opzionale
CONNECTIONS=20 ./raspberry/tests/stress-http.sh  # Load test endpoint /health
./raspberry/tests/tunnel-check.sh           # Stato Tailscale + tunnel ngrok
```

### Ottimizzazioni Hardware/OS
```bash
sudo ./raspberry/optimize.sh
```

## 📊 Scripts Disponibili

### Backend
- `npm start` - Avvia server produzione
- `npm run dev` - Avvia backend + frontend in sviluppo
- `npm test` - Esegue test suite

### Frontend  
- `npm run dev` - Server sviluppo Vite
- `npm run build` - Build produzione
- `npm run preview` - Preview build locale

### Raspberry Pi
- `./raspberry/install-deps.sh` - Installa dipendenze sistema + Node/pm2
- `./raspberry/manual-deploy.sh` - Deploy manuale branch (default `test`)
- `./raspberry/start-dev.sh` - Avvio ambiente sviluppo con PM2
- `./raspberry/start-menu.sh` - Menu interattivo gestione
- `pm2 start raspberry/ecosystem.config.cjs --only ngrok` - Avvia tunnel ngrok

## 🔧 Configurazione Avanzata

### Variabili Ambiente
```bash
# .env file
PORT=3000
NODE_ENV=production
AUDIO_BUFFER_SIZE=3
SAMPLE_RATE=44100
```

### Audio Tuning
Nel file `App.jsx` puoi modificare:
- `RMS_THRESHOLD`: Soglia attivazione voce (default: 0.005)
- `BUFFER_SIZE`: Dimensione buffer circolare (default: 44100*3)
- `CHUNK_SIZE`: Dimensione chunk audio (default: 1024)

## 🤝 Contribuire

1. **Fork** il repository
2. **Crea** un branch feature (`git checkout -b feature/amazing-feature`)
3. **Committa** le modifiche (`git commit -m 'Add amazing feature'`)
4. **Push** sul branch (`git push origin feature/amazing-feature`)
5. **Apri** una Pull Request

## 📋 TODO

- [ ] Hardening & test (smoke test Raspberry + checklist rilascio)
- [ ] Pannello ruoli/permessi lato client (assegnazione + gestione)
- [ ] Rifiniture UX desktop (fullscreen) e accessibilità
- [ ] Feature future: recording sessioni audio / app React Native / bot

## 📄 Licenza

**MIT License** - vedi [LICENSE](LICENSE) per dettagli completi.

## 🆘 Supporto

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/Erry002/Melo_project/issues)
- 💬 **Discussioni**: [GitHub Discussions](https://github.com/Erry002/Melo_project/discussions)
- 📧 **Contatto**: [erry002@github.com](mailto:erry002@github.com)
