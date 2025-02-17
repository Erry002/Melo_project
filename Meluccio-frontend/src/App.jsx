import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";
import { MicrophoneIcon, SpeakerWaveIcon } from "@heroicons/react/24/solid";

window.global = window;

const SOCKET_URL = "https://7331-95-247-188-40.ngrok-free.app";
  ? "https://2d83-95-247-188-40.ngrok-free.app"  // URL produzione
  : "http://localhost:3001";      // URL sviluppo

const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  withCredentials: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  extraHeaders: {
    "ngrok-skip-browser-warning": "true"
  }
});

socket.on("connect_error", (err) => {
  console.log("Errore di connessione:", err.message);
  console.log("Stato socket:", socket.connected);
});

socket.on("connect", () => {
  console.log("Connesso al server! ✅");
});

export default function App() {
  const [servers, setServers] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [username, setUsername] = useState("");
  const [peers, setPeers] = useState(new Map());
  const [localStream, setLocalStream] = useState(null);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [users, setUsers] = useState([]);

  const createPeer = useCallback(async (targetPeerId, initiator = false) => {
    if (!localStream) return;
    
    const peer = new SimplePeer({
      initiator,
      stream: localStream,
      trickle: false,
      config: { 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
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
    console.log('Stato socket:', socket.connected ? 'CONNESSO ' : 'DISCONNESSO ');
    socket.on('disconnect', () => console.log('Socket disconnected!'));
    socket.on("serverList", (data) => {
      setServers(data);
    });

    socket.on("newMessage", (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on("userUpdate", ({ users }) => {
      setUsers(users);
    });

    return () => {
      socket.off("connect_error");
      socket.off("serverList");
      socket.off("newMessage");
      socket.off("userUpdate");
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  useEffect(() => {
    console.log('Stato socket:', socket.connected ? 'CONNESSO ' : 'DISCONNESSO ');
    
    socket.on('userList', (userList) => {
      console.log('Users online:', userList);
      setUsers(userList);
    });

    return () => {
      socket.off("userList");
    };
  }, [username]);

  useEffect(() => {
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

    return () => {
      socket.off('userJoinedVoice');
      socket.off('userLeftVoice');
      socket.off('voiceSignal');
      peers.forEach(peer => peer.destroy());
    };
  }, [peers, createPeer]);

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
    if (socket.connected && newUsername) {
      socket.emit('setUsername', newUsername);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <div className="w-64 bg-gray-800 p-4 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Server</h1>
        {servers.map(server => (
          <div key={server.id} className="mb-4">
            <h2 className="font-semibold text-gray-400">{server.name}</h2>
            <div className="ml-2 mt-2">
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
        <div className="p-4 bg-gray-800 flex items-center gap-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={handleUsernameChange}
            className="bg-gray-700 px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          {currentChannel && (
            <button
              onClick={startVoiceChat}
              className={`flex items-center gap-2 px-4 py-2 ${
                isVoiceConnected ? 'bg-red-600' : 'bg-green-600'
              } rounded-lg hover:opacity-90 transition-colors`}
            >
              <MicrophoneIcon className="h-5 w-5" />
              {isVoiceConnected ? 'Disconnetti' : 'Connetti'}
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 text-gray-400">
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