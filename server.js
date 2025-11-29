import express from "express";
import { Server } from "socket.io";
import { createServer } from "node:http";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

// 🎵 NUOVO: Import del nostro audio manager
import SimpleAudioManager from "./SimpleAudioManager.js";
import apiRoutes from "./api/routes.js";
import dbManager from "./database/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "MeloChat_Super_Secret_Key_2024";
const MESSAGE_HISTORY_LIMIT = 200;

await dbManager.initialize();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://*.ngrok-free.app",  // Permette tutti i domini Ngrok
  "http://localhost",
  "http://127.0.0.1"
];

const PRIVATE_NETWORK_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^\d{1,3}(\.\d{1,3}){3}$/
];

const wildcardToRegex = (pattern) => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`);
};

const matchesOriginList = (origin, origins) => origins.some((allowed) => {
  if (!allowed) return false;
  if (allowed.includes('*')) {
    return wildcardToRegex(allowed).test(origin);
  }
  return allowed === origin;
});

const isPrivateNetworkHost = (hostname) => PRIVATE_NETWORK_PATTERNS.some((pattern) => pattern.test(hostname));

const isAllowedOrigin = (origin, extraOrigins = []) => {
  if (!origin) return true;

  const candidates = [...allowedOrigins, ...extraOrigins].filter(Boolean);
  if (matchesOriginList(origin, candidates)) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);
    if (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname.endsWith('.local')
      || isPrivateNetworkHost(hostname)
    ) {
      return true;
    }
  } catch (error) {
    log(LOG_LEVELS.WARN, 'Origin non valido', { origin, error: error.message });
  }

  return false;
};

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
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    log(LOG_LEVELS.WARN, 'CORS non permesso', { origin });
    return callback(new Error('CORS non permesso'));
  },
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiRoutes);

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
        const dynamicOrigins = [
          urls.web,
          urls.websocket,
          'http://localhost:5173',
          'http://localhost:3001'
        ].filter(Boolean);

        if (isAllowedOrigin(origin, dynamicOrigins)) {
          return callback(null, true);
        }

        log(LOG_LEVELS.WARN, `Origin non permesso: ${origin}`);
        return callback(new Error('Origin non permesso'));
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

const DEFAULT_SERVER_ID = 'default-server';
const DEFAULT_SERVER_NAME = 'Melo Server';
const DEFAULT_CHANNELS = [
  { id: 'general-channel', name: 'Generale' },
  { id: 'voice-channel', name: 'Vocale' }
];

// 🎵 NUOVO: Inizializza l'audio manager
audioManager = new SimpleAudioManager(io);
audioManager.startStatsLogging(60000); // Log stats ogni minuto
console.log('🎵 Audio Manager initialized at startup');

const loadServersFromDatabase = async () => {
  servers.clear();

  const serverRows = await dbManager.db.all(
    `SELECT id, name FROM servers ORDER BY created_at ASC`
  );

  let rows = serverRows;

  if (rows.length === 0) {
    await dbManager.db.run(
      `INSERT INTO servers (id, name) VALUES (?, ?)`,
      [DEFAULT_SERVER_ID, DEFAULT_SERVER_NAME]
    );
    rows = [{ id: DEFAULT_SERVER_ID, name: DEFAULT_SERVER_NAME }];
  }

  for (const serverRow of rows) {
    let channelRows = await dbManager.db.all(
      `SELECT id, name FROM channels WHERE server_id = ? ORDER BY created_at ASC`,
      [serverRow.id]
    );

    if (channelRows.length === 0 && serverRow.id === DEFAULT_SERVER_ID) {
      await Promise.all(
        DEFAULT_CHANNELS.map((channel) => dbManager.db.run(
          `INSERT OR IGNORE INTO channels (id, server_id, name) VALUES (?, ?, ?)`,
          [channel.id, serverRow.id, channel.name]
        ))
      );

      channelRows = await dbManager.db.all(
        `SELECT id, name FROM channels WHERE server_id = ? ORDER BY created_at ASC`,
        [serverRow.id]
      );
    }

    const channels = new Map();
    channelRows.forEach((channel) => {
      channels.set(channel.id, {
        name: channel.name,
        users: []
      });
    });

    servers.set(serverRow.id, {
      id: serverRow.id,
      name: serverRow.name,
      channels
    });
  }
};

await loadServersFromDatabase();

// Middleware per gestire l'origin
io.use((socket, next) => {
  socket.request.headers.origin = socket.request.headers.origin || socket.handshake.headers.origin;
  next();
});

// Gestione WebSocket
io.on("connection", async (socket) => {
  log(LOG_LEVELS.INFO, `Nuova connessione WebSocket`, {
    id: socket.id,
    address: socket.handshake.address,
    headers: socket.handshake.headers
  });

  console.log(`✅ New connection: ${socket.id}`);

  const sendServerList = () => {
    const serverList = Array.from(servers.entries()).map(([serverId, server]) => ({
      id: serverId,
      name: server.name,
      channels: Array.from(server.channels.entries()).map(([channelId, channel]) => ({
        id: channelId,
        name: channel.name
      }))
    }));
    socket.emit("serverList", serverList);
  };

  const broadcastOnlineUsers = () => {
    io.emit(
      "userList",
      Array.from(connectedUsers.values()).map((user) => user.displayName || user.username)
    );
  };

  // Prova a risalire all'utente tramite token JWT trasmesso nello handshake
  const authToken = socket.handshake?.auth?.token;
  if (authToken) {
    try {
      jwt.verify(authToken, JWT_SECRET);
      const session = await dbManager.db.get(
        `SELECT s.user_id, u.username, u.display_name
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
        [authToken]
      );

      if (session) {
        socket.userId = session.user_id;
        socket.username = session.username;
        socket.displayName = session.display_name || session.username;
        connectedUsers.set(socket.id, {
          username: socket.username,
          displayName: socket.displayName,
          userId: socket.userId
        });
      }
    } catch (error) {
      log(LOG_LEVELS.WARN, 'Token socket non valido', { error: error.message });
    }
  }

  sendServerList();

  if (connectedUsers.has(socket.id)) {
    broadcastOnlineUsers();
  }

  socket.on("setUsername", (username) => {
    const safeName = typeof username === 'string' && username.trim().length ? username.trim() : `Utente-${socket.id.slice(-4)}`;
    socket.displayName = safeName;
    socket.username = safeName;
    const existing = connectedUsers.get(socket.id) || {};
    connectedUsers.set(socket.id, {
      ...existing,
      username: socket.username,
      displayName: socket.displayName
    });
    broadcastOnlineUsers();
  });

  socket.on("joinChannel", async (serverId, channelId, providedName) => {
    const server = servers.get(serverId);
    if (!server) {
      return;
    }

    const channel = server.channels.get(channelId);
    if (!channel) {
      return;
    }

    const effectiveName = providedName?.trim?.() || socket.displayName || socket.username || `Utente-${socket.id.slice(-4)}`;

    servers.forEach((srv) => {
      srv.channels.forEach((srvChannel, srvChannelId) => {
        const index = srvChannel.users.findIndex((user) => user.id === socket.id);
        if (index !== -1) {
          srvChannel.users.splice(index, 1);
          socket.leave(srvChannelId);
          io.to(srvChannelId).emit("userUpdate", {
            users: srvChannel.users.map((user) => user.displayName || user.username)
          });
        }
      });
    });

    socket.username = effectiveName;
    socket.displayName = effectiveName;
    socket.currentServerId = serverId;
    socket.currentChannelId = channelId;

    if (!channel.users.some((user) => user.id === socket.id)) {
      channel.users.push({ id: socket.id, username: socket.username, displayName: socket.displayName });
    }

    socket.join(channelId);

    io.to(channelId).emit("userUpdate", {
      users: channel.users.map((user) => user.displayName || user.username)
    });

    try {
      const historyRows = await dbManager.db.all(
        `SELECT id, username, display_name, text, created_at
         FROM messages
         WHERE server_id = ? AND channel_id = ?
         ORDER BY created_at ASC
         LIMIT ?`,
        [serverId, channelId, MESSAGE_HISTORY_LIMIT]
      );

      socket.emit("channelHistory", {
        serverId,
        channelId,
        messages: historyRows.map((row) => ({
          id: row.id,
          username: row.username,
          user: row.display_name || row.username,
          displayName: row.display_name || row.username,
          text: row.text,
          timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
        }))
      });
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Errore caricamento cronologia canale', { error: error.message, serverId, channelId });
      socket.emit("channelHistory", {
        serverId,
        channelId,
        messages: []
      });
    }
  });

  socket.on("joinVoiceChannel", (channelId) => {
    const channelUsers = Array.from(io.sockets.adapter.rooms.get(channelId) || []);
    socket.join(`voice-${channelId}`);

    const displayName = socket.displayName || socket.username || 'Unknown';

    socket.to(`voice-${channelId}`).emit("userJoinedVoice", {
      peerId: socket.id,
      username: displayName
    });

    socket.emit("voiceUsers", channelUsers.map((id) => {
      const user = connectedUsers.get(id);
      return {
        peerId: id,
        username: user ? (user.displayName || user.username) : 'Unknown'
      };
    }));
  });

  socket.on("leaveVoiceChannel", (channelId) => {
    socket.leave(`voice-${channelId}`);
    const displayName = socket.displayName || socket.username || 'Unknown';
    io.to(`voice-${channelId}`).emit("userLeftVoice", {
      peerId: socket.id,
      username: displayName
    });
  });

  socket.on("sendMessage", async (payload, legacyMessage) => {
    try {
      let serverId = socket.currentServerId;
      let channelId;
      let messageText;

      if (payload && typeof payload === 'object') {
        serverId = payload.serverId || socket.currentServerId;
        channelId = payload.channelId;
        messageText = payload.text;
      } else {
        channelId = payload;
        messageText = legacyMessage;
      }

      const trimmed = typeof messageText === 'string' ? messageText.trim() : '';
      if (!channelId || !trimmed) {
        return;
      }

      if (!serverId || !servers.get(serverId)?.channels.has(channelId)) {
        return;
      }

      const timestamp = Date.now();
      const displayName = socket.displayName || socket.username || 'Utente';

      const result = await dbManager.db.run(
        `INSERT INTO messages (server_id, channel_id, user_id, username, display_name, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          serverId,
          channelId,
          socket.userId || null,
          socket.username || displayName,
          displayName,
          trimmed,
          new Date(timestamp).toISOString()
        ]
      );

      const messagePayload = {
        id: result.lastID,
        user: displayName,
        username: socket.username || displayName,
        displayName,
        text: trimmed,
        timestamp
      };

      io.to(channelId).emit("newMessage", messagePayload);
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Errore invio messaggio', { error: error.message });
      socket.emit("chat-error", { message: 'Impossibile inviare il messaggio al momento.' });
    }
  });

  socket.on("clearChannelMessages", async (payload = {}, callback) => {
    const serverId = payload.serverId || socket.currentServerId;
    const channelId = payload.channelId || socket.currentChannelId;

    if (!serverId || !channelId) {
      callback?.({ ok: false, error: 'Canale non valido' });
      return;
    }

    try {
      await dbManager.db.run(
        `DELETE FROM messages WHERE server_id = ? AND channel_id = ?`,
        [serverId, channelId]
      );

      io.to(channelId).emit("chatCleared", { serverId, channelId });
      callback?.({ ok: true });
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Errore cancellazione chat', { error: error.message, serverId, channelId });
      callback?.({ ok: false, error: 'Impossibile svuotare la chat.' });
    }
  });

  socket.on("voiceSignal", ({ signal, targetPeerId }) => {
    io.to(targetPeerId).emit("voiceSignal", {
      signal,
      peerId: socket.id,
      username: socket.displayName || socket.username
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
    broadcastOnlineUsers();

    servers.forEach((server) => {
      server.channels.forEach((channel, channelId) => {
        const index = channel.users.findIndex((user) => user.id === socket.id);
        if (index !== -1) {
          channel.users.splice(index, 1);
          io.to(channelId).emit("userUpdate", {
            users: channel.users.map((user) => user.displayName || user.username)
          });
        }
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