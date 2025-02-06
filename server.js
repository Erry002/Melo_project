const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://*.ngrok-free.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

const servers = new Map();

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

  socket.on("sendMessage", (channelId, message) => {
    if (!socket.username || !message.trim()) return;

    io.to(channelId).emit("newMessage", {
      user: socket.username,
      text: message,
      timestamp: Date.now()
    });
  });

  socket.on("disconnect", () => {
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

httpServer.listen(3000, '0.0.0.0', () => {
  console.log("🚀 Server ready on port 3000");
});