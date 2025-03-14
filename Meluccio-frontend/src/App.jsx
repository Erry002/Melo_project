import React, { useEffect, useState, useCallback } from 'react';
import { io } from "socket.io-client";
import SimplePeer from 'simple-peer';
import { MicrophoneIcon, SpeakerWaveIcon } from "@heroicons/react/24/solid";

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
  const [peers, setPeers] = useState(new Map());
  const [localStream, setLocalStream] = useState(null);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const [audioElements, setAudioElements] = useState(new Map());

  const createPeer = useCallback(async (targetPeerId, initiator = false) => {
    if (!localStream) return;
    
    const peer = new SimplePeer({
      initiator,
      stream: localStream,
      trickle: false,
      config: { 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
          // Ridotto a un solo server STUN per diminuire il carico
        ]
      }
    });

    peer.on('signal', signal => {
      socket.emit('voiceSignal', { signal, targetPeerId });
    });

    peer.on('stream', stream => {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.play().catch(console.error);
      
      setAudioElements(prev => new Map(prev).set(targetPeerId, audio));
    });

    // Aggiungi gestione errori
    peer.on('error', err => {
      console.error('Peer error:', err);
      // Riprova la connessione solo se necessario, non automaticamente
    });
    
    // Pulizia esplicita quando la connessione viene chiusa
    peer.on('close', () => {
      // Libera risorse
    });

    return peer;
  }, [localStream]);

  const startVoiceChat = async () => {
    try {
      if (isVoiceConnected) {
        // Disconnetti
        localStream?.getTracks().forEach(track => track.stop());
        peers.forEach(peer => peer.destroy());
        setPeers(new Map());
        setLocalStream(null);
        setIsVoiceConnected(false);
        socket.emit('leaveVoiceChannel', currentChannel);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      setLocalStream(stream);
      setIsVoiceConnected(true);
      socket.emit('joinVoiceChannel', currentChannel);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Errore accesso microfono: ' + error.message);
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

        socket.on('userJoinedVoice', async ({ peerId, username }) => {
          console.log(`${username} joined voice chat`);
          const peer = await createPeer(peerId, true);
          if (peer) {
            setPeers(prev => new Map(prev).set(peerId, peer));
          }
        });

        socket.on('userLeftVoice', ({ peerId }) => {
          setPeers(prev => {
            const newPeers = new Map(prev);
            newPeers.get(peerId)?.destroy();
            newPeers.delete(peerId);
            return newPeers;
          });
          
          // Pulisci anche l'elemento audio
          setAudioElements(prev => {
            const newAudioElements = new Map(prev);
            if (newAudioElements.has(peerId)) {
              const audio = newAudioElements.get(peerId);
              audio.srcObject = null;
              audio.pause();
              newAudioElements.delete(peerId);
            }
            return newAudioElements;
          });
        });

        socket.on('voiceSignal', async ({ signal, peerId, username }) => {
          let peer = peers.get(peerId);
          
          if (!peer) {
            peer = await createPeer(peerId, false);
            if (peer) {
              setPeers(prev => new Map(prev).set(peerId, peer));
            }
          }

          try {
            peer?.signal(signal);
          } catch (error) {
            console.error('Error signaling peer:', error);
          }
        });

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
            <button
              onClick={startVoiceChat}
              className={`flex items-center w-44  gap-2 px-4 py-2 ${
                isVoiceConnected ? 'bg-red-600' : 'bg-green-600'
              } rounded-lg hover:opacity-90 transition-colors`}
            >
              <MicrophoneIcon className="h-5 w-5" />
              {isVoiceConnected ? 'Disconnetti' : 'Connetti'}
            </button>
          )}

          <div className="sm:ml-auto flex items-center gap-2 text-gray-400">
            <SpeakerWaveIcon className="h-5 w-5" />
            <span>{users.length} utenti online</span>
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