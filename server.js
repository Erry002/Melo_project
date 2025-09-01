const express = require("express");
const { Server } = require("socket.io");
const { createServer } = require("http");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require('path');

// 🎵 NUOVO: Import del nostro audio manager
const SimpleAudioManager = require('./SimpleAudioManager');

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://*.ngrok-free.app",  // Permette tutti i domini Ngrok
  "http://localhost",
  "http://127.0.0.1"
];

// Configurazione logging
const LOG_LEVELS = {
  DEBUG: '🔍 DEBUG',
  INFO: 'ℹ️ INFO',
  WARN: '⚠️ WARN',
  ERROR: '❌ ERROR'
};

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level}: ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Permetti richieste senza origin (es. WebSocket)
    if (!origin) return callback(null, true);
    
    // Controlla se l'origin è permesso
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = new RegExp(allowed.replace('*', '.*'));
        return pattern.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('CORS non permesso'));
    }
  },
  methods: ["GET", "POST"],
  credentials: true
}));

// Middleware per logging richieste HTTP
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    log(LOG_LEVELS.INFO, `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  log(LOG_LEVELS.ERROR, 'Express error:', err);
  res.status(500).send('Internal Server Error');
});

// API endpoints prima del serve statico
app.get('/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    status: 'OK',
    timestamp: new Date()
  };
  res.json(health);
});

app.get('/config', async (req, res) => {
  try {
    const response = await fetch('http://localhost:4040/api/tunnels');
    const data = await response.json();
    const websocketTunnel = data.tunnels.find(t => t.name === 'websocket');
    const websocketUrl = websocketTunnel ? websocketTunnel.public_url : null;
    res.json({ websocketUrl });
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Errore nel recupero configurazione:', error);
    res.status(500).json({ error: 'Errore nel recupero configurazione' });
  }
});

// 🎵 NUOVO: Endpoint dedicato per statistiche audio - PRIMA del catch-all
app.get('/audio-stats', (req, res) => {
  try {
    if (!audioManager) {
      return res.json({ error: 'Audio manager not initialized' });
    }
    
    const stats = audioManager.getStats();
    res.json(stats);
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Errore nel recupero statistiche audio:', error);
    res.status(500).json({ error: 'Errore nel recupero statistiche audio' });
  }
});

// Health check endpoint - PRIMA del catch-all
app.get('/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    memory: process.memoryUsage(),
    connections: io ? io.engine.clientsCount : 0,
    users: typeof connectedUsers !== 'undefined' ? connectedUsers.size : 0,
    // 🎵 NUOVO: Aggiungi statistiche audio al health check
    audio: audioManager ? audioManager.getStats() : { status: 'not initialized' }
  };
  log(LOG_LEVELS.DEBUG, 'Health check', health);
  res.json(health);
});

// Serve statico del frontend DOPO gli endpoint API
app.use(express.static(path.join(__dirname, 'Meluccio-frontend/dist')));

// Tutte le altre route al frontend - ULTIMO
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'Meluccio-frontend/dist/index.html'));
});

// Funzione per ottenere gli URL di ngrok
async function getNgrokUrls() {
  try {
    const response = await fetch('http://localhost:4040/api/tunnels');
    const data = await response.json();
    return data.tunnels.reduce((urls, tunnel) => {
      urls[tunnel.name] = tunnel.public_url;
      return urls;
    }, {});
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Errore nel recupero URL ngrok:', error);
    return {};
  }
}

const httpServer = createServer(app);

// Configurazione ottimizzata per Raspberry Pi 3B+
const io = new Server(httpServer, {
  cors: {
    origin: async (origin, callback) => {
      try {
        const urls = await getNgrokUrls();
        const allowedOrigins = [
          urls.web,
          urls.websocket,
          'http://localhost:5173',
          'http://localhost:3001'
        ].filter(Boolean);

        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          log(LOG_LEVELS.WARN, `Origin non permesso: ${origin}`);
          callback(new Error('Origin non permesso'));
        }
      } catch (error) {
        log(LOG_LEVELS.ERROR, 'Errore nella verifica origin:', error);
        callback(error);
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  // Ridurre il timeout di upgrade per liberare risorse
  upgradeTimeout: 15000,
  allowUpgrades: true,
  // Disabilita la compressione che consuma CPU
  perMessageDeflate: false
});

io.engine.on("connection_error", (err) => {
  console.log("Socket.io error:", err.message);
});

const servers = new Map();
const connectedUsers = new Map();
let audioManager; // Dichiarazione audio manager

// 🎵 NUOVO: Inizializza l'audio manager
audioManager = new SimpleAudioManager(io);
audioManager.startStatsLogging(60000); // Log stats ogni minuto
console.log('🎵 Audio Manager initialized at startup');

const setupExampleServer = () => {
  const exampleServerId = uuidv4();
  const channels = new Map([
    [uuidv4(), { name: "Generale", users: [] }],
    [uuidv4(), { name: "Vocale", users: [] }]
  ]);

  servers.set(exampleServerId, {
    id: exampleServerId,
    name: "Esempio di un Meluccio Server",
    channels
  });
};

setupExampleServer();

// Middleware per gestire l'origin
io.use((socket, next) => {
  socket.request.headers.origin = socket.request.headers.origin || socket.handshake.headers.origin;
  next();
});

// Gestione WebSocket
io.on("connection", (socket) => {
  log(LOG_LEVELS.INFO, `Nuova connessione WebSocket`, {
    id: socket.id,
    address: socket.handshake.address,
    headers: socket.handshake.headers
  });
  
  console.log(`✅ New connection: ${socket.id}`);

  const sendServerList = () => {
    const serverList = Array.from(servers.values()).map(server => ({
      id: server.id,
      name: server.name,
      channels: Array.from(server.channels.values()).map(channel => ({
        id: [...server.channels.keys()].find(key => server.channels.get(key) === channel),
        name: channel.name
      }))
    }));
    socket.emit("serverList", serverList);
  };

  sendServerList();

  socket.on("setUsername", (username) => {
    connectedUsers.set(socket.id, { username });
    io.emit("userList", Array.from(connectedUsers.values()).map(u => u.username));
  });

  socket.on("joinChannel", (serverId, channelId, username) => {
    const server = servers.get(serverId);
    if (!server) return;

    const channel = server.channels.get(channelId);
    if (!channel) return;

    socket.username = username;
    channel.users.push({ id: socket.id, username });
    socket.join(channelId);

    io.to(channelId).emit("userUpdate", {
      users: channel.users.map(u => u.username)
    });
  });

  socket.on("joinVoiceChannel", (channelId) => {
    const channelUsers = Array.from(io.sockets.adapter.rooms.get(channelId) || []);
    socket.join(`voice-${channelId}`);
    
    // Notifica gli altri utenti nel canale
    socket.to(`voice-${channelId}`).emit("userJoinedVoice", {
      peerId: socket.id,
      username: socket.username
    });
    
    // Invia la lista degli utenti già presenti nel canale
    socket.emit("voiceUsers", channelUsers.map(id => {
      const user = connectedUsers.get(id);
      return {
        peerId: id,
        username: user ? user.username : 'Unknown'
      };
    }));
  });

  socket.on("leaveVoiceChannel", (channelId) => {
    socket.leave(`voice-${channelId}`);
    io.to(`voice-${channelId}`).emit("userLeftVoice", {
      peerId: socket.id,
      username: socket.username
    });
  });

  socket.on("sendMessage", (channelId, message) => {
    if (!socket.username || !message.trim()) return;

    io.to(channelId).emit("newMessage", {
      user: socket.username,
      text: message,
      timestamp: Date.now()
    });
  });

  socket.on("voiceSignal", ({ signal, targetPeerId }) => {
    io.to(targetPeerId).emit("voiceSignal", {
      signal,
      peerId: socket.id,
      username: socket.username
    });
  });

  // 🎵 NUOVO: Gestori Audio Streaming
  socket.on("join-audio-room", (roomId) => {
    try {
      audioManager.joinAudioRoom(socket, roomId);
    } catch (error) {
      console.error('❌ Error joining audio room:', error);
      audioManager.handleAudioError(socket, error);
    }
  });

  socket.on("leave-audio-room", (roomId) => {
    try {
      audioManager.leaveAudioRoom(socket, roomId);
    } catch (error) {
      console.error('❌ Error leaving audio room:', error);
      audioManager.handleAudioError(socket, error);
    }
  });

  socket.on("audio-chunk", (audioData) => {
    try {
      // Validazione base dell'audio data
      if (!audioData || audioData.byteLength === 0) {
        console.warn('⚠️ Received empty audio chunk from', socket.id);
        return;
      }
      
      audioManager.handleAudioChunk(socket, audioData);
    } catch (error) {
      console.error('❌ Error handling audio chunk:', error);
      audioManager.handleAudioError(socket, error);
    }
  });

  socket.on("audio-stream", (audioData) => {
    try {
      // Validazione stream audio
      if (!audioData || !audioData.samples || audioData.samples.length === 0) {
        console.warn('⚠️ Received empty audio stream from', socket.id);
        return;
      }
      
      audioManager.handleAudioStream(socket, audioData);
    } catch (error) {
      console.error('❌ Error handling audio stream:', error);
      audioManager.handleAudioError(socket, error);
    }
  });

  // 🎵 NUOVO: Endpoint per statistiche audio (debug)
  socket.on("get-audio-stats", () => {
    try {
      const stats = audioManager.getStats();
      socket.emit("audio-stats", stats);
    } catch (error) {
      console.error('❌ Error getting audio stats:', error);
    }
  });

  socket.on("error", (error) => {
    log(LOG_LEVELS.ERROR, `Errore WebSocket`, {
      id: socket.id,
      error: error.message
    });
    console.error(`❌ Socket error (${socket.id}):`, error);
  });

  socket.on("disconnect", (reason) => {
    log(LOG_LEVELS.INFO, `Disconnessione WebSocket`, {
      id: socket.id,
      reason
    });
    console.log(`❌ Disconnection (${socket.id}): ${reason}`);
    
    // 🎵 NUOVO: Cleanup audio quando user si disconnette
    if (audioManager) {
      audioManager.handleUserDisconnect(socket);
    }
    
    connectedUsers.delete(socket.id);
    sendServerList();
    
    servers.forEach(server => {
      server.channels.forEach(channel => {
        channel.users = channel.users.filter(user => user.id !== socket.id);
        io.to([...server.channels.keys()]).emit("userUpdate", {
          users: channel.users.map(u => u.username)
        });
      });
    });
  });
});

// Gestione pulizia memoria
setInterval(() => {
  if (global.gc) {
    global.gc();
    log(LOG_LEVELS.DEBUG, 'Garbage collection eseguita');
  }
}, 30 * 60 * 1000); // Ogni 30 minuti

httpServer.listen(3001, '0.0.0.0', () => {
  console.log("🚀 Server ready on port 3001");
});