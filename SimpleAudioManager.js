// SimpleAudioManager.js - Gestione audio server-based semplificata
class SimpleAudioManager {
  constructor(io) {
    this.io = io;
    this.audioRooms = new Map(); // roomId -> Set di userId
    this.userAudioBuffer = new Map(); // userId -> audio buffer temporaneo
    this.roomStats = new Map(); // roomId -> statistiche
    
    console.log('🎵 SimpleAudioManager inizializzato');
  }

  // User si unisce a una room audio
  joinAudioRoom(socket, roomId) {
    const userId = socket.id;
    const username = socket.username || 'Sconosciuto';
    
    console.log(`🎤 User ${username} (${userId}) joining audio room: ${roomId}`);
    
    // Inizializza room se non esiste
    if (!this.audioRooms.has(roomId)) {
      this.audioRooms.set(roomId, new Set());
      this.roomStats.set(roomId, {
        created: Date.now(),
        totalUsers: 0,
        activeUsers: 0,
        audioChunksReceived: 0
      });
    }
    
    // Aggiungi user alla room
    this.audioRooms.get(roomId).add(userId);
    socket.join(`audio-${roomId}`);
    
    // Aggiorna statistiche
    const stats = this.roomStats.get(roomId);
    stats.totalUsers++;
    stats.activeUsers = this.audioRooms.get(roomId).size;
    
    // Notifica altri utenti nella room
    socket.to(`audio-${roomId}`).emit('user-joined-audio', {
      userId: userId,
      username: username
    });
    
    // Conferma al client
    socket.emit('audio-room-joined', {
      roomId: roomId,
      usersInRoom: stats.activeUsers
    });
    
    console.log(`✅ User ${username} joined audio room ${roomId}. Active users: ${stats.activeUsers}`);
  }

  // User lascia la room audio
  leaveAudioRoom(socket, roomId) {
    const userId = socket.id;
    const username = socket.username || 'Sconosciuto';
    
    console.log(`🔇 User ${username} (${userId}) leaving audio room: ${roomId}`);
    
    if (!this.audioRooms.has(roomId)) return;
    
    // Rimuovi user dalla room
    this.audioRooms.get(roomId).delete(userId);
    socket.leave(`audio-${roomId}`);
    
    // Cleanup buffer audio
    this.userAudioBuffer.delete(userId);
    
    // Aggiorna statistiche
    const stats = this.roomStats.get(roomId);
    if (stats) {
      stats.activeUsers = this.audioRooms.get(roomId).size;
      
      // Se room vuota, cleanup
      if (stats.activeUsers === 0) {
        this.audioRooms.delete(roomId);
        this.roomStats.delete(roomId);
        console.log(`🗑️ Audio room ${roomId} cleaned up (empty)`);
      }
    }
    
    // Notifica altri utenti
    socket.to(`audio-${roomId}`).emit('user-left-audio', {
      userId: userId,
      username: username
    });
    
    console.log(`✅ User ${username} left audio room ${roomId}`);
  }

  // Gestisci chunk audio ricevuto
  handleAudioChunk(socket, audioChunk) {
    const userId = socket.id;
    const username = socket.username || 'Sconosciuto';
    
    // Validazione dati audio
    if (!audioChunk || !audioChunk.audioData || !Array.isArray(audioChunk.audioData)) {
      console.warn(`⚠️ Invalid audio chunk from ${username}:`, audioChunk);
      return;
    }
    
    // Trova in che room è l'utente (usa channelId se disponibile)
    let userRoom = audioChunk.channelId;
    
    // Se non specificato channelId, cerca nella prima room dell'utente
    if (!userRoom) {
      for (const [roomId, users] of this.audioRooms) {
        if (users.has(userId)) {
          userRoom = roomId;
          break;
        }
      }
    }
    
    if (!userRoom) {
      console.warn(`⚠️ User ${username} sent audio but not in any room`);
      return;
    }
    
    // Verifica che l'utente sia nella room
    if (!this.audioRooms.has(userRoom) || !this.audioRooms.get(userRoom).has(userId)) {
      console.warn(`⚠️ User ${username} not in room ${userRoom}`);
      return;
    }
    
    // Aggiorna statistiche
    const stats = this.roomStats.get(userRoom);
    if (stats) {
      stats.audioChunksReceived++;
    }
    
    console.log(`🎵 Broadcasting audio from ${username} to room ${userRoom}, samples:`, audioChunk.audioData.length);
    
    // Broadcast audio a tutti gli altri nella room
    socket.to(`audio-${userRoom}`).emit('audio-broadcast', {
      audioData: audioChunk.audioData,  // Solo i dati audio
      sampleRate: audioChunk.sampleRate,
      from: userId,
      username: username,
      timestamp: audioChunk.timestamp
    });
  }

  // Gestisci stream audio continuo (nuovo approccio)
  handleAudioStream(socket, audioStream) {
    const userId = socket.id;
    const username = socket.username || 'Sconosciuto';
    
    // Validazione dati stream
    if (!audioStream || !audioStream.samples || !Array.isArray(audioStream.samples)) {
      console.warn(`⚠️ Invalid audio stream from ${username}:`, audioStream);
      return;
    }
    
    // Trova room utente
    let userRoom = audioStream.channelId;
    
    if (!userRoom) {
      for (const [roomId, users] of this.audioRooms) {
        if (users.has(userId)) {
          userRoom = roomId;
          break;
        }
      }
    }
    
    if (!userRoom) {
      console.warn(`⚠️ User ${username} sent stream but not in any room`);
      return;
    }
    
    // Verifica che l'utente sia nella room
    if (!this.audioRooms.has(userRoom) || !this.audioRooms.get(userRoom).has(userId)) {
      console.warn(`⚠️ User ${username} not in room ${userRoom}`);
      return;
    }
    
    // Aggiorna statistiche
    const stats = this.roomStats.get(userRoom);
    if (stats) {
      stats.audioChunksReceived++;
    }
    
    // Log molto ridotto per performance
    if (Math.random() < 0.01) {
      console.log(`🌊 Streaming audio from ${username} to room ${userRoom}, samples:`, audioStream.samples.length);
    }
    
    // Broadcast stream a tutti gli altri nella room
    socket.to(`audio-${userRoom}`).emit('audio-stream', {
      samples: audioStream.samples,
      sampleRate: audioStream.sampleRate,
      from: userId,
      username: username,
      timestamp: audioStream.timestamp
    });
  }

  // Cleanup quando user si disconnette
  handleUserDisconnect(socket) {
    const userId = socket.id;
    const username = socket.username || 'Sconosciuto';
    
    console.log(`👋 Cleaning up audio for disconnected user: ${username} (${userId})`);
    
    // Trova tutte le room dove è presente l'utente
    const roomsToCleanup = [];
    for (const [roomId, users] of this.audioRooms) {
      if (users.has(userId)) {
        roomsToCleanup.push(roomId);
      }
    }
    
    // Cleanup da tutte le room
    roomsToCleanup.forEach(roomId => {
      this.leaveAudioRoom(socket, roomId);
    });
    
    // Cleanup buffer
    this.userAudioBuffer.delete(userId);
  }

  // Gestisci errori audio
  handleAudioError(socket, error) {
    const userId = socket.id;
    const username = socket.username || 'Sconosciuto';
    
    console.error(`🚨 Audio error from ${username} (${userId}):`, error);
    
    socket.emit('audio-error', {
      message: 'Errore nella gestione audio',
      code: 'AUDIO_PROCESSING_ERROR',
      timestamp: Date.now()
    });
  }

  // Statistiche per debugging
  getStats() {
    const totalRooms = this.audioRooms.size;
    const totalUsers = Array.from(this.audioRooms.values())
      .reduce((sum, users) => sum + users.size, 0);
    
    const roomDetails = Array.from(this.roomStats.entries()).map(([roomId, stats]) => {
      const room = this.audioRooms.get(roomId);
      return {
        roomId,
        activeUsers: room ? room.size : 0,
        ...stats
      };
    });
    
    return {
      totalRooms,
      totalUsers,
      roomDetails,
      timestamp: Date.now()
    };
  }

  // Log periodico delle statistiche
  startStatsLogging(intervalMs = 60000) { // Default: ogni minuto
    setInterval(() => {
      const stats = this.getStats();
      if (stats.totalUsers > 0) {
        console.log('📊 Audio Stats:', JSON.stringify(stats, null, 2));
      }
    }, intervalMs);
  }
}

module.exports = SimpleAudioManager;
