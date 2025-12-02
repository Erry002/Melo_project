import express from "express";
import { Server } from "socket.io";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

// 🎵 NUOVO: Import del nostro audio manager
import SimpleAudioManager from "./SimpleAudioManager.js";
import apiRoutes from "./api/routes.js";
import dbManager, { DEFAULT_ROLE_PERMISSIONS } from "./database/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "MeloChat_Super_Secret_Key_2024";
const MESSAGE_HISTORY_LIMIT = 200;

const SERVER_PERMISSIONS = {
  MANAGE_SERVER: 'server.manage',
  MANAGE_ROLES: 'roles.manage',
  INVITE_MEMBER: 'member.invite',
  REMOVE_MEMBER: 'member.remove',
  ASSIGN_ROLE: 'member.assignRole',
  CLEAR_CHAT: 'chat.clear',
  CREATE_CHANNEL: 'channel.create',
  EDIT_CHANNEL: 'channel.edit',
  DELETE_CHANNEL: 'channel.delete',
  SEND_MESSAGE: 'chat.send',
  READ_CHAT: 'chat.read',
  CONNECT_VOICE: 'voice.connect'
};

const FALLBACK_MEMBER_PERMISSIONS = new Set(DEFAULT_ROLE_PERMISSIONS.member);

const clonePermissionSet = (value) => {
  if (value instanceof Set) {
    return new Set(value);
  }
  if (Array.isArray(value)) {
    return new Set(value);
  }
  if (!value) {
    return new Set();
  }
  return new Set([value]);
};

const ensureMembershipCache = (socket) => {
  if (!socket.serverMemberships) {
    socket.serverMemberships = new Map();
  }
  return socket.serverMemberships;
};

const setSocketMembership = (socket, serverId, membership) => {
  const cache = ensureMembershipCache(socket);
  cache.set(serverId, membership);
};

const getSocketMembership = (socket, serverId) => (
  socket.serverMemberships ? socket.serverMemberships.get(serverId) || null : null
);

const clearSocketMemberships = (socket) => {
  if (socket.serverMemberships) {
    socket.serverMemberships.clear();
  }
};

const removeSocketMembership = (socket, serverId) => {
  if (!socket?.serverMemberships) {
    return;
  }

  if (serverId) {
    socket.serverMemberships.delete(serverId);
  } else {
    socket.serverMemberships.clear();
  }
};

const hasPermission = (socket, serverId, permission) => {
  if (!permission) {
    return true;
  }

  if (socket?.isGlobalAdmin) {
    return true;
  }

  const membership = getSocketMembership(socket, serverId);
  if (!membership) {
    return false;
  }

  return membership.permissions?.has(permission) || false;
};

const emitServerPermissions = (socket, serverId) => {
  const membership = getSocketMembership(socket, serverId);
  if (!membership) {
    return;
  }

  socket.emit("serverPermissions", {
    serverId,
    roleId: membership.roleId || null,
    roleKey: membership.roleKey || null,
    roleName: membership.roleName || null,
    permissions: Array.from(membership.permissions || [])
  });
};

const buildServerListPayload = () => Array.from(servers.entries()).map(([serverId, server]) => ({
  id: serverId,
  name: server.name,
  channels: Array.from(server.channels.values()).map((channel) => ({
    id: channel.id,
    name: channel.name,
    parentId: channel.parentId || null,
    type: channel.type || 'text'
  })),
  roles: Array.from(server.roles.values()).map((role) => ({
    id: role.id,
    name: role.name,
    key: role.key,
    description: role.description,
    isOwner: role.isOwner,
    isDefault: role.isDefault,
    priority: role.priority,
    permissions: Array.from(role.permissions || [])
  }))
}));

const buildChannelUsersPayload = (channel) => (
  channel?.users?.map((user) => ({
    socketId: user.id,
    username: user.username,
    displayName: user.displayName,
    userId: user.userId,
    roleId: user.roleId || null,
    roleKey: user.roleKey || null,
    roleName: user.roleName || null
  })) || []
);

const emitChannelUserUpdate = (serverId, channelId) => {
  const server = servers.get(serverId);
  if (!server) {
    return;
  }

  const channel = server.channels.get(channelId);
  if (!channel) {
    return;
  }

  io.to(channelId).emit("userUpdate", {
    serverId,
    channelId,
    users: buildChannelUsersPayload(channel)
  });
};

const getSocketsForUser = (userId) => {
  if (!userId) {
    return [];
  }

  const sockets = [];
  io.sockets.sockets.forEach((clientSocket) => {
    if (clientSocket.userId === userId) {
      sockets.push(clientSocket);
    }
  });
  return sockets;
};

const refreshServerRoles = async (serverId) => {
  const server = servers.get(serverId);
  if (!server) {
    return;
  }

  const roleRows = await dbManager.getServerRolesWithPermissions(serverId);
  const roles = new Map();
  const rolesByKey = new Map();

  roleRows.forEach((role) => {
    const roleData = {
      id: role.id,
      name: role.name,
      key: role.key,
      description: role.description,
      isOwner: Boolean(role.is_owner),
      isDefault: Boolean(role.is_default),
      priority: role.priority,
      permissions: clonePermissionSet(role.permissions)
    };
    roles.set(role.id, roleData);
    if (role.key) {
      rolesByKey.set(role.key, role.id);
    }
  });

  const defaultRole = roleRows.find((role) => role.is_default);
  const ownerRole = roleRows.find((role) => role.is_owner);

  server.roles = roles;
  server.rolesByKey = rolesByKey;
  server.defaultRoleId = defaultRole?.id || null;
  server.ownerRoleId = ownerRole?.id || null;
};

await dbManager.initialize();
await dbManager.ensureSuperAdminByUsername('Erry');

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

const hydrateServer = async (serverRow) => {
  if (!serverRow) {
    return null;
  }

  let channelRows = await dbManager.db.all(
    `SELECT id, name, parent_id, type FROM channels WHERE server_id = ? ORDER BY created_at ASC`,
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
      `SELECT id, name, parent_id, type FROM channels WHERE server_id = ? ORDER BY created_at ASC`,
      [serverRow.id]
    );
  }

  const channels = new Map();
  channelRows.forEach((channel) => {
    channels.set(channel.id, {
      id: channel.id,
      name: channel.name,
      parentId: channel.parent_id || null,
      type: channel.type || 'text',
      users: []
    });
  });

  await dbManager.assignDefaultOwnerIfMissing(serverRow.id);
  const roleRows = await dbManager.getServerRolesWithPermissions(serverRow.id);
  const roles = new Map();
  const rolesByKey = new Map();

  roleRows.forEach((role) => {
    const roleData = {
      id: role.id,
      name: role.name,
      key: role.key,
      description: role.description,
      isOwner: Boolean(role.is_owner),
      isDefault: Boolean(role.is_default),
      priority: role.priority,
      permissions: clonePermissionSet(role.permissions)
    };
    roles.set(role.id, roleData);
    if (role.key) {
      rolesByKey.set(role.key, role.id);
    }
  });

  const defaultRole = roleRows.find((role) => role.is_default);
  const ownerRole = roleRows.find((role) => role.is_owner);

  return {
    id: serverRow.id,
    name: serverRow.name,
    channels,
    roles,
    rolesByKey,
    defaultRoleId: defaultRole?.id || null,
    ownerRoleId: ownerRole?.id || null
  };
};

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
    const hydrated = await hydrateServer(serverRow);
    if (hydrated) {
      servers.set(hydrated.id, hydrated);
    }
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
  socket.serverMemberships = new Map();
  socket.isGlobalAdmin = false;

  const sendServerList = () => {
    socket.emit("serverList", buildServerListPayload());
  };

  const broadcastServerList = () => {
    const payload = buildServerListPayload();
    io.emit("serverList", payload);
    return payload;
  };

  const emitServerRoles = (serverId) => {
    const server = servers.get(serverId);
    if (!server) {
      return;
    }

    const rolesPayload = Array.from(server.roles.values()).map((role) => ({
      id: role.id,
      name: role.name,
      key: role.key,
      description: role.description,
      isOwner: role.isOwner,
      isDefault: role.isDefault,
      priority: role.priority,
      permissions: Array.from(role.permissions || [])
    }));

    io.emit('serverRolesUpdated', { serverId, roles: rolesPayload });
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
        `SELECT s.user_id, u.username, u.display_name, u.is_admin, u.global_role, u.server_quota
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
        [authToken]
      );

      if (session) {
        socket.userId = session.user_id;
        socket.username = session.username;
        socket.displayName = session.display_name || session.username;
        socket.isGlobalAdmin = session.is_admin === 1 || (session.global_role === 'AmministraMelucci');
        socket.globalRole = session.global_role || 'creator';
        socket.serverQuota = session.server_quota;
        connectedUsers.set(socket.id, {
          username: socket.username,
          displayName: socket.displayName,
          userId: socket.userId,
          isAdmin: socket.isGlobalAdmin
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

  socket.on("createServer", async (payload = {}, callback) => {
    if (!socket.userId) {
      callback?.({ ok: false, error: 'Autenticazione richiesta per creare una stanza.' });
      return;
    }

    const rawName = typeof payload.name === 'string' ? payload.name : '';

    try {
      const result = await dbManager.createServerForUser(socket.userId, rawName);
      const hydrated = await hydrateServer(result.server);

      if (!hydrated) {
        callback?.({ ok: false, error: 'Impossibile inizializzare la nuova stanza.' });
        return;
      }

      servers.set(hydrated.id, hydrated);
      broadcastServerList();

      const channelIterator = hydrated.channels.values().next();
      const defaultChannelId = channelIterator?.value?.id || null;

      callback?.({ ok: true, serverId: hydrated.id, defaultChannelId });
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Errore creazione stanza', {
        error: error.message,
        userId: socket.userId
      });
      callback?.({ ok: false, error: error.message || 'Impossibile creare la stanza.' });
    }
  });

  socket.on("createServerRole", async (payload = {}, callback) => {
    const serverId = payload.serverId || socket.currentServerId;
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';

    if (!serverId || !name) {
      callback?.({ ok: false, error: 'Server o nome ruolo non validi.' });
      return;
    }

    if (!hasPermission(socket, serverId, SERVER_PERMISSIONS.MANAGE_ROLES)) {
      callback?.({ ok: false, error: 'Permessi insufficienti per gestire i ruoli.' });
      return;
    }

    try {
      const newRole = await dbManager.createServerRole(serverId, {
        name,
        description: typeof payload.description === 'string' ? payload.description : '',
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
        priority: payload.priority,
        createdBy: socket.userId || null
      });

      await refreshServerRoles(serverId);
      emitServerRoles(serverId);
      broadcastServerList();

      callback?.({ ok: true, roleId: newRole.id });
    } catch (error) {
      const isUniqueConstraint = /UNIQUE constraint failed/i.test(error?.message || '');
      const message = isUniqueConstraint
        ? 'Esiste già un ruolo con questo nome.'
        : 'Impossibile creare il ruolo in questo momento.';
      log(LOG_LEVELS.ERROR, 'Errore creazione ruolo', {
        error: error.message,
        serverId,
        requestedName: name
      });
      callback?.({ ok: false, error: message });
    }
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

    if (socket.userId) {
      try {
        const membership = await dbManager.ensureServerMember(serverId, socket.userId);
        const roleFromCache = server.roles?.get(membership?.role_id);
        const permissionSet = roleFromCache
          ? clonePermissionSet(roleFromCache.permissions)
          : clonePermissionSet(membership?.permissions);

        setSocketMembership(socket, serverId, {
          serverId,
          userId: socket.userId,
          roleId: membership?.role_id || roleFromCache?.id || null,
          roleKey: membership?.role_key || roleFromCache?.key || null,
          roleName: membership?.role_name || roleFromCache?.name || null,
          permissions: permissionSet
        });
      } catch (error) {
        log(LOG_LEVELS.ERROR, 'Errore gestione membership server', {
          serverId,
          userId: socket.userId,
          error: error.message
        });
        const fallbackPermissions = clonePermissionSet(FALLBACK_MEMBER_PERMISSIONS);
        setSocketMembership(socket, serverId, {
          serverId,
          userId: socket.userId,
          roleId: null,
          roleKey: 'member',
          roleName: 'Membro',
          permissions: fallbackPermissions
        });
      }
    } else {
      const defaultRole = server.defaultRoleId ? server.roles?.get(server.defaultRoleId) : null;
      const fallbackPermissions = defaultRole
        ? clonePermissionSet(defaultRole.permissions)
        : clonePermissionSet(FALLBACK_MEMBER_PERMISSIONS);

      setSocketMembership(socket, serverId, {
        serverId,
        userId: null,
        roleId: defaultRole?.id || null,
        roleKey: defaultRole?.key || 'guest',
        roleName: defaultRole?.name || 'Ospite',
        permissions: fallbackPermissions
      });
    }

    const effectiveName = providedName?.trim?.() || socket.displayName || socket.username || `Utente-${socket.id.slice(-4)}`;

    const membership = getSocketMembership(socket, serverId);
    emitServerPermissions(socket, serverId);

    servers.forEach((srv, srvId) => {
      srv.channels.forEach((srvChannel, srvChannelId) => {
        const index = srvChannel.users.findIndex((user) => user.id === socket.id);
        if (index !== -1) {
          srvChannel.users.splice(index, 1);
          socket.leave(srvChannelId);
          emitChannelUserUpdate(srvId, srvChannelId);
        }
      });
    });

    socket.username = effectiveName;
    socket.displayName = effectiveName;
    socket.currentServerId = serverId;
    socket.currentChannelId = channelId;

    if (!channel.users.some((user) => user.id === socket.id)) {
      channel.users.push({
        id: socket.id,
        username: socket.username,
        displayName: socket.displayName,
        userId: socket.userId || null,
        roleId: membership?.roleId || null,
        roleKey: membership?.roleKey || null,
        roleName: membership?.roleName || null
      });
    }

    socket.join(channelId);
    emitChannelUserUpdate(serverId, channelId);

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

      if (!hasPermission(socket, serverId, SERVER_PERMISSIONS.SEND_MESSAGE)) {
        const message = 'Non hai i permessi per inviare messaggi in questo server.';
        socket.emit("chat-error", { message });
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

    if (!hasPermission(socket, serverId, SERVER_PERMISSIONS.CLEAR_CHAT)) {
      const message = 'Non hai i permessi per svuotare la chat.';
      callback?.({ ok: false, error: message });
      socket.emit('chat-error', { message });
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

  socket.on("assignMemberRole", async (payload = {}, callback) => {
    const serverId = payload.serverId || socket.currentServerId;
    const targetUserId = payload.targetUserId;
    const roleId = payload.roleId;

    if (!serverId || !targetUserId || !roleId) {
      callback?.({ ok: false, error: 'Parametri mancanti' });
      return;
    }

    if (!hasPermission(socket, serverId, SERVER_PERMISSIONS.ASSIGN_ROLE)) {
      callback?.({ ok: false, error: 'Permessi insufficienti per assegnare ruoli.' });
      return;
    }

    const server = servers.get(serverId);
    if (!server) {
      callback?.({ ok: false, error: 'Server non trovato' });
      return;
    }

    if (!server.roles?.has(roleId)) {
      await refreshServerRoles(serverId);
    }

    let targetRole = server.roles.get(roleId);
    if (!targetRole) {
      callback?.({ ok: false, error: 'Ruolo non valido' });
      return;
    }

    try {
      const currentMember = await dbManager.getServerMember(serverId, targetUserId);

      if (currentMember?.role_id === server.ownerRoleId && !targetRole.isOwner) {
        callback?.({ ok: false, error: 'Non puoi rimuovere il proprietario dalla stanza.' });
        return;
      }

      const membership = await dbManager.ensureServerMember(serverId, targetUserId, { roleId });

      if (!server.roles?.has(membership.role_id)) {
        await refreshServerRoles(serverId);
      }

      const roleFromCache = server.roles.get(membership.role_id) || targetRole;
      const permissionSet = roleFromCache
        ? clonePermissionSet(roleFromCache.permissions)
        : clonePermissionSet(membership.permissions);

      const targetSockets = getSocketsForUser(targetUserId);

      targetSockets.forEach((targetSocket) => {
        setSocketMembership(targetSocket, serverId, {
          serverId,
          userId: targetUserId,
          roleId: membership.role_id,
          roleKey: membership.role_key || roleFromCache?.key || null,
          roleName: membership.role_name || roleFromCache?.name || null,
          permissions: permissionSet
        });
        emitServerPermissions(targetSocket, serverId);
      });

      server.channels.forEach((srvChannel, srvChannelId) => {
        const userIndex = srvChannel.users.findIndex((user) => user.userId === targetUserId);
        if (userIndex !== -1) {
          const userEntry = srvChannel.users[userIndex];
          userEntry.roleId = membership.role_id;
          userEntry.roleKey = membership.role_key || roleFromCache?.key || null;
          userEntry.roleName = membership.role_name || roleFromCache?.name || null;
          emitChannelUserUpdate(serverId, srvChannelId);
        }
      });

      callback?.({ ok: true, roleId: membership.role_id });
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Errore assegnazione ruolo membro', {
        error: error.message,
        serverId,
        targetUserId,
        roleId
      });
      callback?.({ ok: false, error: 'Impossibile assegnare il ruolo.' });
    }
  });

  socket.on("removeMember", async (payload = {}, callback) => {
    const serverId = payload.serverId || socket.currentServerId;
    const targetUserId = payload.targetUserId;
    const reason = payload.reason || 'Rimosso dal proprietario';

    if (!serverId || !targetUserId) {
      callback?.({ ok: false, error: 'Parametri mancanti' });
      return;
    }

    if (!hasPermission(socket, serverId, SERVER_PERMISSIONS.REMOVE_MEMBER)) {
      callback?.({ ok: false, error: 'Permessi insufficienti per rimuovere membri.' });
      return;
    }

    const server = servers.get(serverId);
    if (!server) {
      callback?.({ ok: false, error: 'Server non trovato' });
      return;
    }

    try {
      const membership = await dbManager.getServerMember(serverId, targetUserId);

      if (!membership) {
        callback?.({ ok: false, error: 'Utente non presente nella stanza' });
        return;
      }

      if (membership.role_id === server.ownerRoleId) {
        callback?.({ ok: false, error: 'Non puoi rimuovere il proprietario della stanza.' });
        return;
      }

      await dbManager.db.run(
        `DELETE FROM server_members WHERE server_id = ? AND user_id = ?`,
        [serverId, targetUserId]
      );

      server.channels.forEach((srvChannel, srvChannelId) => {
        const userIndex = srvChannel.users.findIndex((user) => user.userId === targetUserId);
        if (userIndex !== -1) {
          const socketId = srvChannel.users[userIndex].id;
          srvChannel.users.splice(userIndex, 1);
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket) {
            targetSocket.leave(srvChannelId);
            if (targetSocket.currentChannelId === srvChannelId) {
              targetSocket.currentChannelId = null;
            }
          }
          emitChannelUserUpdate(serverId, srvChannelId);
        }
      });

      const targetSockets = getSocketsForUser(targetUserId);

      targetSockets.forEach((targetSocket) => {
        removeSocketMembership(targetSocket, serverId);
        emitServerPermissions(targetSocket, serverId);
        targetSocket.emit("memberRemoved", {
          serverId,
          reason
        });
      });

      callback?.({ ok: true });
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Errore rimozione membro dalla stanza', {
        error: error.message,
        serverId,
        targetUserId
      });
      callback?.({ ok: false, error: 'Impossibile rimuovere il membro.' });
    }
  });

  socket.on("createChannel", async (payload = {}, callback) => {
    const serverId = payload.serverId || socket.currentServerId;
    const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
    const parentId = payload.parentId || null;
    const typeValue = typeof payload.type === 'string' && payload.type.trim().length ? payload.type.trim().toLowerCase() : 'text';
    const allowedTypes = new Set(['text', 'voice']);
    const type = allowedTypes.has(typeValue) ? typeValue : 'text';
    const normalizedParentId = parentId || null;

    if (!serverId || !rawName) {
      callback?.({ ok: false, error: 'Nome canale obbligatorio' });
      return;
    }

    if (!hasPermission(socket, serverId, SERVER_PERMISSIONS.CREATE_CHANNEL)) {
      callback?.({ ok: false, error: 'Permessi insufficienti per creare canali.' });
      return;
    }

    const server = servers.get(serverId);
    if (!server) {
      callback?.({ ok: false, error: 'Server non trovato' });
      return;
    }

    if (normalizedParentId && !server.channels.has(normalizedParentId)) {
      callback?.({ ok: false, error: 'Canale padre non valido' });
      return;
    }

    const channelId = `channel-${randomUUID()}`;
    const safeName = rawName.slice(0, 64);

    try {
      await dbManager.db.run(
        `INSERT INTO channels (id, server_id, name, parent_id, type)
         VALUES (?, ?, ?, ?, ?)`,
        [channelId, serverId, safeName, normalizedParentId, type]
      );

      server.channels.set(channelId, {
        id: channelId,
        name: safeName,
        parentId: normalizedParentId,
        type,
        users: []
      });

      broadcastServerList();
      callback?.({ ok: true, channel: { id: channelId, name: safeName, parentId: normalizedParentId, type } });
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Errore creazione canale', {
        error: error.message,
        serverId,
        name: safeName
      });
      callback?.({ ok: false, error: 'Impossibile creare il canale.' });
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
    
    clearSocketMemberships(socket);
    connectedUsers.delete(socket.id);
    broadcastOnlineUsers();

    servers.forEach((server, serverId) => {
      server.channels.forEach((channel, channelId) => {
        const index = channel.users.findIndex((user) => user.id === socket.id);
        if (index !== -1) {
          channel.users.splice(index, 1);
          emitChannelUserUpdate(serverId, channelId);
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