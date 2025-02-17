const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require('path');

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://88ca-95-247-188-40.ngrok-free.app",
  "https://*.ngrok-free.app"
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true
}));

// Servi i file statici dalla cartella dist
app.use(express.static(path.join(__dirname, 'Meluccio-frontend/dist')));

// Route per tutte le altre richieste
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'Meluccio-frontend/dist/index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

io.engine.on("connection_error", (err) => {
  console.log("Socket.io error:", err.message);
});

const servers = new Map();
const connectedUsers = new Map();

const setupExampleServer = () => {
  const exampleServerId = uuidv4();
  const channels = new Map([
    [uuidv4(), { name: "Generale", users: [] }],
    [uuidv4(), { name: "Vocale", users: [] }]
  ]);

  servers.set(exampleServerId, {
    id: exampleServerId,
    name: "Esempio Server",
    channels
  });
};

setupExampleServer();

io.on("connection", (socket) => {
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
    socket.emit("voiceUsers", channelUsers.map(id => ({
      peerId: id,
      username: connectedUsers.get(id)?.username
    })));
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

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
    io.emit("userList", Array.from(connectedUsers.values()).map(u => u.username));
    
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

httpServer.listen(3001, '0.0.0.0', () => {
  console.log("🚀 Server ready on port 3001");
});