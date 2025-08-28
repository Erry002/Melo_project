import React, { useEffect, useState } from 'react';
import { io } from "socket.io-client";
import { MicrophoneIcon, SpeakerWaveIcon } from "@heroicons/react/24/solid";
import { useSimpleAudio } from './hooks/useSimpleAudio';

window.global = window;

const getServerUrl = async () => {
  try {
    const response = await fetch('/config');
    if (!response.ok) {
      throw new Error('Errore nel recupero della configurazione del server');
    }
    const { websocketUrl } = await response.json();
    return websocketUrl;
  } catch (error) {
    console.error('Errore:', error);
    throw error;
  }
};

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionError, setConnectionError] = useState(null);
  const [servers, setServers] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState([]);

  // 🎵 NUOVO: Sostituisce tutto il sistema WebRTC con il nostro hook semplificato
  const { 
    isRecording, 
    isConnected, 
    audioLevel, 
    connectedUsers,
    startAudio, 
    stopAudio 
  } = useSimpleAudio(socket);

  // 🗑️ RIMOSSO: Non servono più queste variabili WebRTC complesse
  // const [peers, setPeers] = useState(new Map());
  // const [localStream, setLocalStream] = useState(null);
  // const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  // const [audioElements, setAudioElements] = useState(new Map());

  // 🎵 NUOVO: Funzione semplificata per toggle audio
  const toggleAudio = async () => {
    try {
      if (isRecording) {
        stopAudio();
        // Informa il server che hai lasciato la chat audio
        if (socket && currentChannel) {
          socket.emit('leave-audio-room', currentChannel);
        }
      } else {
        await startAudio();
        // Informa il server che ti sei unito alla chat audio
        if (socket && currentChannel) {
          socket.emit('join-audio-room', currentChannel);
        }
      }
    } catch (error) {
      console.error('Error toggling audio:', error);
      alert(`Errore audio: ${error.message}`);
    }
  };

  useEffect(() => {
    const initializeSocket = async () => {
      try {
        const serverUrl = await getServerUrl();
        console.log('Connessione al server:', serverUrl);

        const socket = io(serverUrl, {
          withCredentials: true,
          transports: ['websocket'],
          extraHeaders: {
            "Access-Control-Allow-Origin": "*"
          }
        });

        socket.on("connect", () => {
          console.log('Connesso al server Socket.io');
          setConnectionStatus('connected');
          setConnectionError(null);
        });

        socket.on("connect_error", (error) => {
          console.error('Errore di connessione:', error);
          setConnectionStatus('error');
          setConnectionError(error.message);
        });

        socket.on("disconnect", () => {
          console.log('Disconnesso dal server');
          setConnectionStatus('disconnected');
        });

        socket.on("connect_error", (err) => {
          console.log("Errore di connessione:", err.message);
          console.log("Stato socket:", socket.connected);
        });

        socket.on("serverList", (data) => {
          setServers(data);
        });

        socket.on("newMessage", (msg) => {
          setMessages(prev => [...prev, msg]);
        });

        socket.on("userUpdate", ({ users }) => {
          setUsers(users);
        });

        socket.on('userList', (userList) => {
          console.log('Users online:', userList);
          setUsers(userList);
        });

        // 🗑️ RIMOSSO: Vecchi listener WebRTC sostituiti dal nuovo sistema
        // Ora la gestione audio è centralizzata nel hook useSimpleAudio
        
        setSocket(socket);

        return () => {
          socket.disconnect();
        };
      } catch (error) {
        console.error('Errore durante l\'inizializzazione:', error);
        setConnectionStatus('error');
        setConnectionError(error.message);
      }
    };

    initializeSocket();
  }, []);

  const joinChannel = (serverId, channelId) => {
    if (!username.trim()) return alert("Inserisci un username!");
    socket.emit("joinChannel", serverId, channelId, username);
    setCurrentChannel(channelId);
  };

  const sendMessage = () => {
    if (message.trim() && currentChannel) {
      socket.emit("sendMessage", currentChannel, message);
      setMessage("");
    }
  };

  const handleUsernameChange = (e) => {
    const newUsername = e.target.value;
    setUsername(newUsername);
    if (socket && socket.connected && newUsername) {
      socket.emit('setUsername', newUsername);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row h-screen bg-gray-900 text-white">
      <div className="w-full sm:w-64  bg-gray-800 p-4 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Server</h1>
        {servers.map(server => (
          <div key={server.id} className="mb-4">
            <h2 className="font-semibold text-gray-400">{server.name}</h2>
            <div className="ml-2 mt-2 flex sm:flex-col">
              {server.channels?.map(channel => (
                <button
                  key={channel.id}
                  onClick={() => joinChannel(server.id, channel.id)}
                  className={`w-full text-left p-2 rounded mb-1 ${
                    currentChannel === channel.id 
                      ? "bg-gray-700 text-white" 
                      : "hover:bg-gray-700/50 text-gray-300"
                  }`}
                >
                  {channel.name.startsWith("Vocale") ? (
                    <MicrophoneIcon className="h-4 w-4 inline-block mr-2" />
                  ) : (
                    <span className="mr-2">#</span>
                  )}
                  {channel.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="p-4 bg-gray-800 flex flex-col sm:flex-row  gap-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={handleUsernameChange}
            className="bg-blue-500 items-center w-44 sm:w-64 px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
          
          {currentChannel && (
            <div className="flex flex-col gap-2">
              {/* 🎵 NUOVO: Pulsante audio semplificato */}
              <button
                onClick={toggleAudio}
                disabled={!isConnected}
                className={`flex items-center w-44 gap-2 px-4 py-2 ${
                  isRecording ? 'bg-red-600' : 'bg-green-600'
                } rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <MicrophoneIcon className="h-5 w-5" />
                {isRecording ? 'Disattiva Audio' : 'Attiva Audio'}
              </button>
              
              {/* 🎵 NUOVO: Indicatore livello audio */}
              {isRecording && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="flex-1 bg-gray-700 rounded h-2 overflow-hidden">
                    <div 
                      className="bg-green-500 h-full transition-all duration-100"
                      style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
                    />
                  </div>
                  <span>🎤</span>
                </div>
              )}
              
              {/* 🎵 NUOVO: Lista utenti connessi audio */}
              {connectedUsers.length > 0 && (
                <div className="text-xs text-gray-400">
                  🔊 In chat: {connectedUsers.length} utent{connectedUsers.length === 1 ? 'e' : 'i'}
                </div>
              )}
            </div>
          )}

          <div className="sm:ml-auto flex items-center gap-2 text-gray-400">
            <SpeakerWaveIcon className="h-5 w-5" />
            <span>{users.length} utenti online</span>
            {/* 🎵 NUOVO: Indicatore connessione */}
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className="mb-3">
              <span className="font-bold text-blue-400">{msg.user}:</span>
              <span className="ml-2 text-gray-300">{msg.text}</span>
              <span className="ml-2 text-xs text-gray-500">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>

        <div className="p-4 bg-gray-800 border-t border-gray-700">
          <div className="flex gap-4">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Scrivi un messaggio..."
              className="flex-1 bg-gray-700 px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Invia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}