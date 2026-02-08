# 🎵 Meluccio Chat - Stack Tecnologico

> **Progetto**: Chat real-time con audio streaming  
> **Target**: Raspberry Pi 3B+  
> **Architettura**: Client-Server con WebSocket  
> **Branch**: `test`

---

## 📋 Indice

- [Architettura Generale](#-architettura-generale)
- [Frontend](#-frontend)
- [Backend](#-backend)
- [Comunicazione](#-comunicazione)
- [Sistema Audio](#-sistema-audio)
- [Gestione Dati](#-gestione-dati)
- [Strumenti Sviluppo](#-strumenti-sviluppo)
- [Deployment](#-deployment)
- [Performance & Monitoring](#-performance--monitoring)
- [Prossimi Step](#-prossimi-step)

---

## 🏗️ Architettura Generale

### Tipo di Applicazione
- **Categoria**: Real-time chat application con voice streaming
- **Pattern**: Client-Server (non P2P)
- **Comunicazione**: WebSocket + REST API
- **Deployment finale**: Raspberry Pi 3B+ single board computer

### Benefici dell'Architettura Scelta
- ✅ **Semplicità**: Server centralizzato facile da debuggare
- ✅ **Stabilità**: Meno problemi di NAT/firewall rispetto a P2P
- ✅ **Scalabilità**: Gestione rooms centralizzata
- ✅ **Compatibilità**: Funziona su reti limitate (IoT)

---

## 🎯 Frontend

### Framework e Librerie Core
```json
{
  "react": "19.0.0",           // Framework UI moderno
  "vite": "6.3.5",            // Build tool ultra-veloce
  "socket.io-client": "^4.x"   // Client WebSocket real-time
}
```

### Tecnologie Frontend
| Tecnologia | Versione | Scopo |
|------------|----------|-------|
| **React** | 19.0.0 | Framework UI principale |
| **Vite** | 6.3.5 | Build tool + dev server |
| **Socket.IO Client** | Latest | Comunicazione real-time |
| **JavaScript ES6+** | Native | Linguaggio principale |
| **JSX** | Native | Template React |
| **Tailwind CSS** | Utility-first | Styling UI/UX |
| **getUserMedia** | Native | Cattura audio microfono |
| **WebAudio API** | Native | Elaborazione audio + analisi livelli |

### Struttura Directory Frontend
```
Meluccio-frontend/
├── 📁 src/
│   ├── 📄 App.jsx                 # Componente principale chat + audio
│   ├── 📄 main.jsx                # Entry point React
│   ├── 📄 index.css               # Stili globali
│   ├── 📁 hooks/
│   │   └── 📄 useSimpleAudio.js   # Hook personalizzato audio (backup)
│   └── 📁 utils/
│       └── 📄 connection.js       # Utilità connessione
├── 📄 package.json                # Dipendenze npm frontend
├── 📄 vite.config.js              # Configurazione Vite
├── 📄 index.html                  # Template HTML base
├── 📄 tailwind.config.cjs         # Configurazione CSS (se usato)
└── 📄 eslint.config.js            # Linting regole
```

### Componenti React Implementati
- **App.jsx**: Componente root con chat + controlli audio
- **Chat Interface**: Messaggi real-time con timestamp
- **Audio Controls**: Pulsanti start/stop, indicatori livello
- **Server/Channel UI**: Lista server e canali automatica
- **Debug Panel**: Informazioni stato connessione

---

## ⚙️ Backend

### Runtime e Framework
```json
{
  "node": "18.20.8",              // LTS stabile per Raspberry Pi
  "express": "^4.x",              // Web framework minimalista
  "socket.io": "^4.x",            // WebSocket server
  "uuid": "^9.x"                  // Generazione ID univoci
}
```

### Stack Backend Dettagliato
| Componente | Tecnologia | Funzione |
|------------|------------|----------|
| **Runtime** | Node.js 18.20.8 | Esecuzione JavaScript server-side |
| **Web Server** | Express.js | REST API endpoints |
| **Real-time** | Socket.IO Server | WebSocket bidirectional communication |
| **Audio Manager** | Custom Class | Gestione streaming audio centralizzata |
| **Routing** | Express Router | Endpoint REST (/health, /audio-stats) |
| **CORS** | cors middleware | Cross-origin requests handling |
| **Logging** | Custom + Console | Debug e monitoring |

### Struttura Directory Backend
```
/ (root project)
├── 📄 server.js                   # Server principale Express + Socket.IO
├── 📄 SimpleAudioManager.js       # Classe gestione audio server-side
├── 📄 package.json                # Dipendenze npm backend
├── 📄 .nvmrc                      # Versione Node.js (18.20.8)
├── 📁 logs/                       # Directory logging
│   ├── 📄 server.log              # Log server principale
│   ├── 📄 frontend.log            # Log frontend build
│   └── 📄 ngrok.log               # Log tunneling
├── 📁 raspberry/                  # Script deployment Raspberry Pi
└── 📁 Meluccio-frontend/          # Directory frontend separata
```

### Moduli Backend Principali

#### **server.js** - Server Principale
```javascript
// Funzionalità implementate:
- Express server setup
- Socket.IO WebSocket server
- CORS configuration per sviluppo
- Auto-setup server e canali esempio
- Gestione eventi chat (join, message, disconnect)
- Integrazione SimpleAudioManager
- Health check endpoints
- Error handling e logging
```

#### **SimpleAudioManager.js** - Gestione Audio
```javascript
// Funzionalità implementate:
- Gestione room audio isolate
- Broadcast audio chunks tra utenti
- Statistiche real-time (utenti, messaggi audio)
- Memory management per performance
- Integration con Socket.IO events
- Logging dettagliato per debug
```

---

## 🔗 Comunicazione

### Protocolli di Rete
| Protocollo | Porto | Utilizzo |
|------------|-------|----------|
| **HTTP** | 3001 | REST API endpoints |
| **WebSocket** | 3001 | Real-time communication |
| **HTTP Dev** | 5174 | Vite dev server frontend |

### REST API Endpoints
```http
GET  /health           # Health check server
GET  /audio-stats      # Statistiche audio real-time
GET  /api/audio-stats  # Alias endpoint statistiche
```

### Eventi Socket.IO Implementati

#### **Eventi Chat**
```javascript
// Client → Server
'connect'                    // Connessione iniziale
'setUsername'               // Imposta username utente
'joinChannel'               // Unisciti a canale specifico
'sendMessage'               // Invia messaggio chat

// Server → Client  
'disconnect'                // Disconnessione
'serverList'               // Lista server e canali disponibili
'newMessage'               // Nuovo messaggio ricevuto
'userUpdate'               // Aggiornamento utenti in canale
```

#### **Eventi Audio (Sistema futuro)**
```javascript
// Client → Server
'join-audio-room'          // Unisciti a room audio
'leave-audio-room'         // Lascia room audio
'audio-chunk'              // Chunk audio da trasmettere

// Server → Client
'audio-broadcast'          // Audio chunk da altri utenti
'user-joined-audio'        // Utente entrato in audio
'user-left-audio'          // Utente uscito da audio
'audio-room-users'         // Lista utenti in room audio
```

### Formato Messaggi
```javascript
// Messaggio Chat
{
  user: "User_abc123",
  text: "Ciao a tutti!",
  timestamp: 1693486920000
}

// Messaggio Audio (futuro)
{
  audioData: ArrayBuffer,
  from: "socketId",
  username: "User_abc123", 
  timestamp: 1693486920000
}
```

---

## 🎵 Sistema Audio

### Tecnologie Audio Frontend
| API | Funzione | Stato |
|-----|----------|-------|
| **MediaRecorder API** | Cattura audio microfono | ✅ Implementato |
| **AudioContext** | Analisi real-time | 🔄 In sviluppo |
| **MediaStream** | Stream audio | ✅ Base implementata |
| **getUserMedia** | Permessi microfono | ✅ Implementato |

### Tecnologie Audio Backend
| Componente | Funzione | Stato |
|------------|----------|-------|
| **SimpleAudioManager** | Gestione room audio | ✅ Implementato |
| **Socket.IO Events** | Trasmissione chunk | ✅ Eventi definiti |
| **Buffer Management** | Memory optimization | ✅ Cleanup automatico |
| **Room Isolation** | Audio per canali | ✅ Implementato |

### Configurazione Audio Ottimizzata
```javascript
// Configurazione MediaRecorder (Raspberry Pi friendly)
{
  sampleRate: 16000,        // Bassa qualità = meno bandwidth
  channelCount: 1,          // Mono = dimezza traffico
  echoCancellation: true,   // Cancellazione eco
  noiseSuppression: true,   // Riduzione rumore
  autoGainControl: true,    // Controllo volume automatico
  latency: 0.01            // 10ms latenza target
}
```

### Architettura Audio
```
[Microfono] → [MediaRecorder] → [AudioChunk] → [Socket.IO] 
                    ↓
[Speaker] ← [AudioPlayback] ← [AudioChunk] ← [Socket.IO]
```

---

## 🗄️ Gestione Dati

### Storage Strategy
| Tipo | Implementazione | Scopo |
|------|----------------|-------|
| **Runtime Memory** | JavaScript Maps | Server state (temporaneo) |
| **Session Storage** | Browser storage | Frontend state |
| **File Logging** | Text files | Debug e monitoring |
| **No Database** | N/A | Semplicità iniziale |

### Strutture Dati Principali

#### **Server Data Structure**
```javascript
// In-memory Maps per performance
servers: Map<serverId, {
  id: UUID,
  name: String,
  channels: Map<channelId, {
    name: String,
    users: Array<{id, username}>
  }>
}>

connectedUsers: Map<socketId, {
  username: String
}>
```

#### **Audio Data Structure**
```javascript
// SimpleAudioManager state
audioRooms: Map<roomId, Set<userId>>
userAudioBuffer: Map<userId, AudioData>
roomStats: Map<roomId, {
  created: Timestamp,
  totalUsers: Number,
  activeUsers: Number,
  audioChunksReceived: Number
}>
```

### Vantaggi Approccio In-Memory
- ✅ **Performance**: Accesso dati ultra-veloce
- ✅ **Semplicità**: No setup database
- ✅ **RAM Efficiency**: Ideale per Raspberry Pi
- ✅ **Auto-cleanup**: Restart pulisce state corrotto

---

## 🔧 Strumenti Sviluppo

### Version Control
```bash
# Git workflow
git branch audio-streaming-v1    # Branch sviluppo corrente
git add .                        # Stage modifiche
git commit -m "feat: audio UI"   # Commit semantici
git push origin audio-streaming-v1
```

### Package Managers
```bash
# Node Version Manager
nvm use 18.20.8                 # Forza versione Node.js
nvm install 18.20.8             # Installa versione specifica

# NPM Commands
npm install                      # Installa dipendenze
npm run dev                      # Avvia dev server (frontend)
node server.js                   # Avvia server (backend)
```

### Development Environment
| Tool | Versione | Utilizzo |
|------|----------|----------|
| **VS Code** | Latest | Editor principale |
| **Node.js** | 18.20.8 | Runtime JavaScript |
| **npm** | 10.8.2 | Package manager |
| **Git** | Latest | Version control |
| **Terminal** | macOS/Linux | Command line interface |

### URLs Sviluppo
```bash
# Frontend Development
http://localhost:5174           # Vite dev server
http://localhost:5174/?debug    # Con debug logs

# Backend Development  
http://localhost:3001           # Express server
http://localhost:3001/health    # Health check
http://localhost:3001/audio-stats # Audio statistics

# WebSocket Connection
ws://localhost:3001             # Socket.IO endpoint
```

### Scripts Utili
```bash
# Frontend
cd Meluccio-frontend
nvm use 18.20.8
npm run dev                     # Start dev server

# Backend
nvm use 18.20.8  
node server.js                  # Start server manuale
pm2 start server.js             # Start con PM2 (produzione)

# Debug
curl http://localhost:3001/health
ps aux | grep "node server.js"
tail -f logs/server.log
```

---

## 🏠 Deployment

### Target Hardware
```
Raspberry Pi 3B+ Specifications:
├── CPU: Broadcom BCM2837B0 (ARM Cortex-A53 64-bit @ 1.4GHz)
├── RAM: 1GB LPDDR2 
├── Storage: MicroSD card (16GB+ raccomandato)
├── Network: WiFi 802.11ac + Ethernet
├── OS: Raspberry Pi OS (Debian-based Linux)
└── Architecture: ARM v7/v8
```

### Sistema Operativo Target
```bash
# Raspberry Pi OS Setup
sudo apt update && sudo apt upgrade -y
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18.20.8
npm install -g pm2

# Clone repository
git clone https://github.com/Erry002/Melo_project.git
cd Melo_project
git checkout audio-streaming-v1
```

### Process Management
```bash
# PM2 Configuration per Raspberry Pi
pm2 start server.js --name "meluccio-server"
pm2 startup                     # Auto-start on boot
pm2 save                        # Save current processes
pm2 monit                       # Real-time monitoring
```

### Network & Tunneling
```bash
# Ngrok per accesso esterno (development)
ngrok http 3001                 # Tunnel server backend
ngrok http 5174                 # Tunnel frontend (se necessario)

# Configurazione firewall
sudo ufw allow 3001             # Allow backend port
sudo ufw allow 5174             # Allow frontend port (dev)
```

---

## 📊 Performance & Monitoring

### Logging Strategy
```javascript
// Livelli logging implementati
LOG_LEVELS = {
  ERROR: 'ERROR',   // Errori critici
  WARN: 'WARN',     // Warning non bloccanti  
  INFO: 'INFO',     // Informazioni generali
  DEBUG: 'DEBUG'    // Debug dettagliato
}

// File di log
logs/server.log     // Log server principale
logs/frontend.log   // Log build frontend
logs/ngrok.log      // Log tunnel
```

### Monitoring Endpoints
```http
GET /health
Response: {
  "uptime": 312.477,
  "status": "OK", 
  "timestamp": "2025-08-30T15:21:53.323Z"
}

GET /audio-stats  
Response: {
  "connectedUsers": 2,
  "rooms": ["general"],
  "totalAudioChunks": 0,
  "serverUptime": "312.48s",
  "memoryUsage": {...}
}
```

### Performance Ottimizzazioni

#### **Frontend**
- ✅ **Vite**: Build ultra-veloce
- ✅ **CSS-in-JS**: No CSS bundle separato
- ✅ **ES6 Modules**: Tree shaking automatico
- 🔄 **Audio Compression**: 16kHz mono

#### **Backend**  
- ✅ **In-Memory Maps**: Zero DB overhead
- ✅ **Event-driven**: Node.js async I/O
- ✅ **Memory Cleanup**: Auto garbage collection
- 🔄 **Audio Buffering**: Chunk size optimization

#### **Network**
- ✅ **WebSocket**: Low-latency real-time
- ✅ **CORS Optimized**: Development friendly
- 🔄 **Audio Codec**: Opus compression planned

---

## 🔜 Prossimi Step

### Immediate Next Steps (Priority 1)
- [ ] **Real Audio Streaming**: Sostituire simulazione con vero MediaRecorder
- [ ] **Audio Playback**: Implementare riproduzione audio altri utenti
- [ ] **Volume Controls**: UI sliders controllo volume
- [ ] **Error Handling**: Gestione errori audio robusti

### Short Term (Priority 2)  
- [ ] **Audio Compression**: Implementare Opus codec
- [ ] **Mobile Optimization**: Test e fix mobile Safari/Chrome
- [ ] **Room Management**: UI per creare/gestire room custom
- [ ] **User Management**: Avatar, status online/offline

### Medium Term (Priority 3)
- [ ] **Raspberry Pi Deployment**: Test performance reale
- [ ] **Auto-scaling**: Gestione multiple concurrent users
- [ ] **Persistence**: Database per chat history
- [ ] **Security**: Authentication e authorization

### Long Term (Nice to Have)
- [ ] **Video Streaming**: Aggiungere video calls
- [ ] **File Sharing**: Upload/download files in chat
- [ ] **Mobile App**: React Native version
- [ ] **Desktop App**: Electron wrapper

---

## 🎯 Obiettivi di Learning

### Competenze Sviluppate
✅ **Full-Stack Development**: Frontend + Backend integration  
✅ **Real-time Applications**: WebSocket programming  
✅ **Audio Streaming**: WebRTC/MediaRecorder APIs  
✅ **IoT Deployment**: Raspberry Pi optimization  
✅ **Modern JavaScript**: ES6+, async/await, modules  
✅ **React Ecosystem**: Hooks, state management, effects  
✅ **Node.js Server**: Express, middleware, routing  
✅ **Network Programming**: HTTP, WebSocket, real-time events  

### Sfide Tecniche Risolte
🔧 **Memory Leaks**: Migrazione da P2P a server-based  
🔧 **Version Compatibility**: Node.js 18 + Vite 6  
🔧 **Real-time Sync**: Socket.IO event handling  
🔧 **Audio Permissions**: Browser MediaRecorder API  
🔧 **Cross-platform**: Development Mac → Deploy Raspberry Pi  

---

## 📚 Risorse e Documentazione

### Documentazione Tecnica
- [React 19 Docs](https://react.dev)
- [Vite Guide](https://vitejs.dev/guide/)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [Node.js 18 API](https://nodejs.org/dist/latest-v18.x/docs/api/)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Raspberry Pi Documentation](https://www.raspberrypi.org/documentation/)

### Repository Structure
```
📁 Melo_project/
├── 📄 README.md                    # Documentazione progetto
├── � docs/
│   ├── 📁 ai/
│   │   ├── AI_HANDOVER.md         # Guida per AI/sviluppatori
│   │   └── TECH_STACK.md          # Questo file
│   └── CHANGELOG.md               # Storia modifiche  
├── 📄 package.json                # Dipendenze backend
├── 📄 server.js                   # Server principale
├── 📄 SimpleAudioManager.js       # Audio manager
├── 📁 Meluccio-frontend/          # Applicazione React
├── 📁 raspberry/                  # Script deployment Pi
└── 📁 logs/                       # File di logging
```

---

*Documento aggiornato: 1 Settembre 2025*  
*Progetto: Meluccio Chat v1.0*  
*Branch: audio-streaming-v1*  
*Target: Raspberry Pi 3B+ deployment*
