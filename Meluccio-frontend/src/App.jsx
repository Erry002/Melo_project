import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";
import { MicrophoneIcon, SpeakerWaveIcon } from "@heroicons/react/24/solid";

window.global = window;

const socket = io("https://3c25-95-247-188-40.ngrok-free.app", {
  transports: ["websocket"],
  withCredentials: true,
  extraHeaders: {
    "ngrok-skip-browser-warning": "true"
  }
});

export default function App() {
  const [servers, setServers] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [username, setUsername] = useState("");
  const [peer, setPeer] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    socket.on("connect_error", (err) => {
      console.error("Connection error:", err.message);
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

    return () => {
      socket.off("connect_error");
      socket.off("serverList");
      socket.off("newMessage");
      socket.off("userUpdate");
    };
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

  const startVoiceChat = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          noiseSuppression: true,
          echoCancellation: true 
        }
      });

      const newPeer = new SimplePeer({
        initiator: true,
        stream: stream,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
      });

      newPeer.on("signal", data => {
        socket.emit("voiceSignal", { channelId: currentChannel, signal: data });
      });

      socket.on("voiceSignal", signal => {
        newPeer.signal(signal);
      });

      setPeer(newPeer);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Microphone access required!");
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
            onChange={(e) => setUsername(e.target.value)}
            className="bg-gray-700 px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          {currentChannel && (
            <button
              onClick={startVoiceChat}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              <MicrophoneIcon className="h-5 w-5" />
              Avvia chat vocale
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