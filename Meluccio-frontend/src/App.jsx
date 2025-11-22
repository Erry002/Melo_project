import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import io from 'socket.io-client';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import LoginForm from './components/LoginForm.jsx';
import RegisterForm from './components/RegisterForm.jsx';
import UserProfile from './components/UserProfile.jsx';
import { findBestUrl } from './utils/connection.js';
import './App.css';
import './Global.css';

const SOCKET_TRANSPORTS = ['websocket', 'polling'];
const TARGET_SAMPLE_RATE = 16000;
const MIN_BUFFER_LEAD = 0.12; // 120ms di margine per assorbire jitter
const CAPTURE_CHUNK_MS = 60;
const WORKLET_RMS_THRESHOLD = 0.0015;

const isSecureForMedia = () => {
  if (window.isSecureContext) {
    return true;
  }

  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
};

const requestUserMedia = (constraints) => {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  const legacyGetUserMedia = navigator.getUserMedia
    || navigator.webkitGetUserMedia
    || navigator.mozGetUserMedia
    || navigator.msGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    });
  }

  return Promise.reject(new Error('Il dispositivo non supporta la cattura audio.'));
};

const convertFloatToPCM16 = (input, sourceSampleRate, targetSampleRate = TARGET_SAMPLE_RATE) => {
  if (!input?.length) {
    return new Int16Array(0);
  }

  const sampleRateRatio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / sampleRateRatio));
  const result = new Int16Array(outputLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < outputLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accumulator = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i += 1) {
      accumulator += input[i];
      count += 1;
    }

    const sample = count > 0 ? accumulator / count : input[offsetBuffer];
    const clamped = Math.max(-1, Math.min(1, sample || 0));
    result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;

    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
};

const convertPCM16ToFloat = (samples) => {
  if (!samples?.length) {
    return new Float32Array(0);
  }

  if (samples instanceof Float32Array) {
    return samples;
  }

  const array = Array.isArray(samples) ? samples : Array.from(samples);
  const float32 = new Float32Array(array.length);

  for (let i = 0; i < array.length; i += 1) {
    const value = array[i] ?? 0;
    float32[i] = value < 0 ? value / 0x8000 : value / 0x7FFF;
  }

  return float32;
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const AuthenticatedApp = () => {
  const { user, token, logout } = useAuth();

  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [servers, setServers] = useState([]);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [currentChannelId, setCurrentChannelId] = useState(null);
  const [channelUsers, setChannelUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [socketId, setSocketId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioError, setAudioError] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const playbackRef = useRef({ context: null, nextStartTime: 0 });
  const isRecordingRef = useRef(false);
  const currentChannelIdRef = useRef(null);
  const currentServerIdRef = useRef(null);
  const displayNameRef = useRef('');

  const displayName = useMemo(() => (
    user?.display_name?.trim() || user?.username || 'Ospite'
  ), [user]);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    currentChannelIdRef.current = currentChannelId;
  }, [currentChannelId]);

  useEffect(() => {
    currentServerIdRef.current = currentServerId;
  }, [currentServerId]);

  const stopAudio = useCallback(() => {
    const state = streamRef.current;

    if (state?.processor) {
      state.processor.onaudioprocess = null;
      state.processor.disconnect();
    }

    if (state?.workletNode) {
      state.workletNode.port.onmessage = null;
      state.workletNode.disconnect();
    }

    if (state?.silentGain) {
      state.silentGain.disconnect();
    }

    if (state?.source) {
      try {
        state.source.disconnect();
      } catch (error) {
        console.warn('⚠️ Errore durante il disconnect della sorgente audio:', error);
      }
    }

    if (state?.analyser) {
      state.analyser.disconnect();
    }

    if (state?.audioContext) {
      state.audioContext.close().catch(() => {});
    }

    if (state?.rawStream) {
      state.rawStream.getTracks().forEach((track) => track.stop());
    }

    if (state?.levelAnimation) {
      cancelAnimationFrame(state.levelAnimation);
    }

    streamRef.current = null;

    if (socketRef.current && currentChannelIdRef.current) {
      socketRef.current.emit('leave-audio-room', currentChannelIdRef.current);
    }

    setIsRecording(false);
    setAudioLevel(0);
    setAudioError(null);
  }, []);

  const startAudio = useCallback(async () => {
    if (isRecordingRef.current) {
      return;
    }

    try {
      setAudioError(null);

      if (!isSecureForMedia()) {
        throw new Error('Per usare il microfono da mobile è necessario accedere via HTTPS (es. dominio Ngrok) oppure tramite localhost.');
      }

      const rawStream = await requestUserMedia({
        audio: {
          sampleRate: TARGET_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const source = audioContext.createMediaStreamSource(rawStream);
      source.connect(analyser);

      const captureState = {
        pending: []
      };

      const emitChunk = (floatSamples, inputSampleRate, rmsHint = null) => {
        if (!socketRef.current || !currentChannelIdRef.current || !floatSamples?.length) {
          return;
        }

        const pcm16 = convertFloatToPCM16(floatSamples, inputSampleRate, TARGET_SAMPLE_RATE);
        if (!pcm16.length) {
          return;
        }

        if (typeof rmsHint === 'number') {
          setAudioLevel(Math.min(1, rmsHint * 6));
        }

        socketRef.current.emit('audio-stream', {
          samples: Array.from(pcm16),
          sampleRate: TARGET_SAMPLE_RATE,
          bitDepth: 16,
          timestamp: Date.now(),
          channelId: currentChannelIdRef.current,
          username: displayNameRef.current
        });
      };

      const supportsWorklet = Boolean(audioContext.audioWorklet?.addModule);

      let processor = null;
      let workletNode = null;
      let silentGain = null;

      if (supportsWorklet) {
        await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');

        workletNode = new AudioWorkletNode(audioContext, 'audio-stream-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          processorOptions: {
            targetSampleRate: TARGET_SAMPLE_RATE,
            chunkMilliseconds: CAPTURE_CHUNK_MS,
            energyThreshold: WORKLET_RMS_THRESHOLD,
            sendSilence: false
          }
        });

        silentGain = audioContext.createGain();
        silentGain.gain.value = 0;

        workletNode.port.onmessage = (event) => {
          const { type, samples, sampleRate, rms } = event.data || {};

          if (type === 'audioData' && Array.isArray(samples) && samples.length) {
            if (!socketRef.current || !currentChannelIdRef.current) {
              return;
            }

            setAudioLevel(Math.min(1, (rms ?? 0) * 6));

            socketRef.current.emit('audio-stream', {
              samples,
              sampleRate: sampleRate || TARGET_SAMPLE_RATE,
              bitDepth: 16,
              timestamp: Date.now(),
              channelId: currentChannelIdRef.current,
              username: displayNameRef.current
            });
          } else if (type === 'level') {
            setAudioLevel(Math.min(1, (rms ?? 0) * 6));
          }
        };

        source.connect(workletNode);
        workletNode.connect(silentGain);
        silentGain.connect(audioContext.destination);
      } else {
        processor = audioContext.createScriptProcessor(2048, 1, 1);
        silentGain = audioContext.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = (event) => {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          captureState.pending.push(...inputBuffer);

          const targetSamples = Math.max(1, Math.round(audioContext.sampleRate * (CAPTURE_CHUNK_MS / 1000)));
          while (captureState.pending.length >= targetSamples) {
            const chunk = captureState.pending.splice(0, targetSamples);
            let sum = 0;
            for (let i = 0; i < chunk.length; i += 1) {
              sum += chunk[i] * chunk[i];
            }
            const rms = Math.sqrt(sum / chunk.length);
            emitChunk(Float32Array.from(chunk), audioContext.sampleRate, rms);
          }
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioContext.destination);
      }

      const updateLevel = () => {
        if (!isRecordingRef.current || !streamRef.current) {
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((total, value) => total + value, 0) / dataArray.length;
        setAudioLevel((prev) => Math.max(prev * 0.7, average / 255));
        streamRef.current.levelAnimation = requestAnimationFrame(updateLevel);
      };

      const levelAnimation = requestAnimationFrame(updateLevel);

      streamRef.current = {
        rawStream,
        audioContext,
        analyser,
        processor,
        workletNode,
        silentGain,
        source,
        levelAnimation
      };

      setIsRecording(true);

      if (socketRef.current && currentChannelIdRef.current) {
        socketRef.current.emit('join-audio-room', currentChannelIdRef.current);
      }
    } catch (error) {
      console.error('❌ Errore avvio audio:', error);
      if (error.message?.includes('HTTPS')) {
        setAudioError(error.message);
      } else if (error.name === 'NotAllowedError') {
        setAudioError('Permesso microfono negato. Autorizza il microfono nelle impostazioni del browser.');
      } else if (error.name === 'NotFoundError') {
        setAudioError('Microfono non trovato. Verifica il dispositivo.');
      } else {
        setAudioError(error.message || 'Errore audio sconosciuto');
      }
    }
  }, []);

  const handleIncomingAudio = useCallback(async (payload) => {
    try {
      if (!payload?.samples?.length) {
        return;
      }

      if (!playbackRef.current.context) {
        playbackRef.current.context = new (window.AudioContext || window.webkitAudioContext)();
        playbackRef.current.nextStartTime = 0;
      }

      const audioContext = playbackRef.current.context;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const floatSamples = convertPCM16ToFloat(payload.samples);
      const sampleRate = payload.sampleRate || audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, floatSamples.length, sampleRate);
      buffer.copyToChannel(floatSamples, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.8;

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      const plannedAhead = playbackRef.current.nextStartTime || 0;
      const drift = plannedAhead - audioContext.currentTime;
      if (drift > 0.6) {
        playbackRef.current.nextStartTime = audioContext.currentTime + MIN_BUFFER_LEAD;
      }

      const now = audioContext.currentTime + MIN_BUFFER_LEAD;
      const startTime = Math.max(now, playbackRef.current.nextStartTime || now);
      source.start(startTime);
      playbackRef.current.nextStartTime = startTime + buffer.duration;

      source.onended = () => {
        source.disconnect();
        gainNode.disconnect();
      };
    } catch (error) {
      console.error('❌ Errore riproduzione audio:', error);
    }
  }, []);

  const joinChannel = useCallback((serverId, channelId) => {
    if (!socketRef.current) {
      return;
    }

    const previousChannel = currentChannelIdRef.current;
    if (previousChannel && previousChannel !== channelId) {
      socketRef.current.emit('leave-audio-room', previousChannel);
    }

    currentChannelIdRef.current = channelId;
    setCurrentServerId(serverId);
    setCurrentChannelId(channelId);
    setChannelUsers([]);
    setMessages([]);

    socketRef.current.emit('joinChannel', serverId, channelId, displayNameRef.current);

    if (isRecordingRef.current) {
      socketRef.current.emit('join-audio-room', channelId);
    }
  }, []);

  const sendMessage = useCallback((event) => {
    event?.preventDefault?.();
    if (!newMessage.trim() || !socketRef.current || !currentChannelIdRef.current) {
      return;
    }

    socketRef.current.emit('sendMessage', currentChannelIdRef.current, newMessage.trim());
    setNewMessage('');
  }, [newMessage]);

  const handleToggleConnection = useCallback(() => {
    if (!socketRef.current) {
      return;
    }

    if (connectionStatus === 'connected') {
      socketRef.current.disconnect();
    } else if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      setConnectionStatus('connecting');
      socketRef.current.connect();
    }
  }, [connectionStatus]);

  useEffect(() => {
    let isMounted = true;

    if (!token) {
      return undefined;
    }

    const setupSocket = async () => {
      try {
        const baseUrl = await findBestUrl();
        if (!isMounted) {
          return;
        }

        const socket = io(baseUrl, {
          transports: SOCKET_TRANSPORTS,
          auth: { token },
          withCredentials: true
        });

        socketRef.current = socket;

        const handleConnect = () => {
          setConnectionStatus('connected');
          setSocketId(socket.id);
          socket.emit('setUsername', displayNameRef.current);
        };

        const handleDisconnect = (reason) => {
          console.warn('Socket disconnesso:', reason);
          setSocketId(null);
          setConnectionStatus('disconnected');
          setServers([]);
          setChannelUsers([]);
          stopAudio();
        };

        const handleServerList = (serverList) => {
          setServers(serverList);
          if (!serverList?.length) {
            return;
          }

          const preferredServer = serverList.find((srv) => srv.id === currentServerIdRef.current) || serverList[0];
          const preferredChannel = preferredServer.channels?.find((ch) => ch.id === currentChannelIdRef.current) || preferredServer.channels?.[0];

          if (preferredServer && preferredChannel) {
            joinChannel(preferredServer.id, preferredChannel.id);
          }
        };

        const handleNewMessage = (message) => {
          setMessages((prev) => [...prev.slice(-99), message]);
        };

        const handleUserUpdate = ({ users }) => {
          setChannelUsers(users);
        };

        const handleUserList = (users) => {
          setChannelUsers(users);
        };

        const handleAudioError = (payload) => {
          if (payload?.message) {
            setAudioError(payload.message);
          }
        };

        const handleConnectError = (error) => {
          console.error('❌ Errore connessione socket:', error);
          setConnectionStatus('error');
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('serverList', handleServerList);
        socket.on('newMessage', handleNewMessage);
        socket.on('userUpdate', handleUserUpdate);
        socket.on('userList', handleUserList);
        socket.on('audio-stream', handleIncomingAudio);
        socket.on('audio-error', handleAudioError);
        socket.io.on('error', handleConnectError);
        socket.io.on('reconnect', handleConnect);
        socket.io.on('reconnect_attempt', () => setConnectionStatus('connecting'));
      } catch (error) {
        console.error('❌ Errore inizializzazione socket:', error);
        setConnectionStatus('error');
      }
    };

    setupSocket();

    const playbackStateRef = playbackRef.current;

    return () => {
      isMounted = false;
      const socket = socketRef.current;
      if (socket) {
        socket.off('audio-stream', handleIncomingAudio);
        socket.disconnect();
        socketRef.current = null;
      }
      setSocketId(null);
      setServers([]);
      setChannelUsers([]);
      stopAudio();
      if (playbackStateRef?.context) {
        playbackStateRef.context.close().catch(() => {});
        playbackStateRef.context = null;
      }
    };
  }, [token, joinChannel, handleIncomingAudio, stopAudio]);

  const handleLogout = async () => {
    stopAudio();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    await logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-700 to-indigo-900 p-6 md:p-10 lg:p-14">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/30 overflow-hidden">
          <div className="px-6 py-6 sm:px-8 sm:py-8 border-b border-white/20 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-indigo-400 font-semibold mb-1">Benvenuto</p>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">🎵 Melo Chat</h1>
              <p className="text-slate-500 mt-2">
                Ciao {displayName}! {connectionStatus === 'connected' ? 'Sei online e pronto a chattare.' : 'Stiamo preparando la connessione...'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowProfile(true)}
                className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100 transition-colors"
              >
                👤 Profilo
              </button>
              <button
                type="button"
                onClick={handleToggleConnection}
                className={`px-4 py-2 rounded-xl font-semibold text-white transition-colors ${
                  connectionStatus === 'connected'
                    ? 'bg-red-500 hover:bg-red-600'
                    : connectionStatus === 'connecting'
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {connectionStatus === 'connected' ? 'Disconnetti' : connectionStatus === 'connecting' ? 'Connessione…' : 'Connetti'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
              >
                🚪 Logout
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[320px_1fr] p-6 sm:p-8">
            <aside className="space-y-6">
              <section className="bg-slate-900 text-white rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-sm uppercase tracking-wide text-slate-400">Connessione</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : connectionStatus === 'connecting'
                        ? 'bg-amber-500/20 text-amber-200'
                        : 'bg-rose-500/20 text-rose-200'
                  }`}>
                    {connectionStatus.toUpperCase()}
                  </span>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Socket ID</p>
                    <p className="text-sm font-mono bg-slate-800/60 px-3 py-2 rounded-lg break-all">
                      {socketId || 'Non connesso'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Microfono</span>
                      <span className={`font-semibold ${isRecording ? 'text-emerald-300' : 'text-amber-200'}`}>
                        {isRecording ? 'ATTIVO' : 'MUTO'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={isRecording ? stopAudio : startAudio}
                      disabled={connectionStatus !== 'connected'}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                        connectionStatus !== 'connected'
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          : isRecording
                            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30'
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                      }`}
                    >
                      {isRecording ? '🔇 Disattiva' : '🎤 Attiva'}
                    </button>
                    <div className="mt-3 h-12 bg-slate-800/70 rounded-lg flex items-center justify-center">
                      {isRecording ? (
                        <div className="flex items-end gap-[3px] h-8">
                          {Array.from({ length: 10 }).map((_, index) => (
                            <div
                              key={`bar-${index}`}
                              className="w-2 rounded-sm bg-gradient-to-t from-indigo-500 to-purple-400"
                              style={{
                                height: `${Math.max(8, audioLevel * 100)}%`,
                                animationDelay: `${index * 0.1}s`
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {connectionStatus === 'connected' ? 'Attiva il microfono per trasmettere' : 'In attesa di connessione'}
                        </span>
                      )}
                    </div>
                    {audioError && (
                      <div className="mt-3 text-xs text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                        ⚠️ {audioError}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl shadow-inner border border-slate-100 p-5">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Stanze &amp; Canali
                </h2>
                <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
                  {servers.length === 0 && (
                    <p className="text-sm text-slate-400">Nessun server disponibile al momento.</p>
                  )}
                  {servers.map((server) => (
                    <div key={server.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                        <span className="text-indigo-500">#</span>
                        {server.name}
                      </h3>
                      <div className="space-y-2">
                        {server.channels?.map((channel) => {
                          const isActive = channel.id === currentChannelId;
                          return (
                            <button
                              key={channel.id}
                              type="button"
                              onClick={() => joinChannel(server.id, channel.id)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                isActive
                                  ? 'bg-indigo-500 text-white shadow shadow-indigo-500/30'
                                  : 'bg-white text-slate-600 hover:bg-indigo-50'
                              }`}
                            >
                              {channel.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl shadow-inner border border-slate-100 p-5">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Utenti nel canale
                </h2>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {channelUsers.length === 0 ? (
                    <p className="text-sm text-slate-400">Nessuno è attualmente connesso.</p>
                  ) : (
                    channelUsers.map((usernameValue) => (
                      <div
                        key={usernameValue}
                        className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-slate-600">{usernameValue}</span>
                        <span className="text-xs text-slate-400">{usernameValue === displayName ? 'Tu' : 'Online'}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </aside>

            <main className="bg-white rounded-2xl shadow-inner border border-slate-100 flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                  💬 Conversazione
                  {currentChannelId && (
                    <span className="text-xs font-medium px-2 py-1 bg-indigo-100 text-indigo-600 rounded-full">
                      {currentChannelId}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Chat vocale e testuale in tempo reale con audio streaming.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-gradient-to-b from-white to-slate-50">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    Nessun messaggio. Inizia la conversazione!
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={`${message.timestamp}-${message.user || message.username}`}
                      className="bg-white shadow-sm border border-slate-100 rounded-2xl px-5 py-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-indigo-500">
                          {message.user || message.username}
                        </span>
                        <span className="text-xs text-slate-400">{formatTime(message.timestamp)}</span>
                      </div>
                      <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                        {message.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendMessage} className="border-t border-slate-100 bg-white p-6 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(event) => setNewMessage(event.target.value)}
                    placeholder={connectionStatus === 'connected' ? 'Scrivi un messaggio per il canale…' : 'In attesa di connessione…'}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition"
                    disabled={connectionStatus !== 'connected' || !currentChannelId}
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || connectionStatus !== 'connected' || !currentChannelId}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      !newMessage.trim() || connectionStatus !== 'connected' || !currentChannelId
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                    }`}
                  >
                    Invia
                  </button>
                </div>
                <div className="text-xs text-slate-400">
                  Stato: {connectionStatus} · Canale: {currentChannelId || 'Nessuno'} · Socket: {socketId || '—'}
                </div>
              </form>
            </main>
          </div>
        </div>
      </div>
      {showProfile && <UserProfile onClose={() => setShowProfile(false)} />}
    </div>
  );
};

const UnauthenticatedApp = ({ mode, setMode, registerSuccess, onRegistered }) => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-16">
    <div className="max-w-5xl w-full grid lg:grid-cols-2 gap-12 items-center">
      <div className="text-white space-y-6">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-1 rounded-full text-sm text-indigo-200">
          <span>🛡️</span> Sicurezza enterprise-ready
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
          Audio chat realtime con autenticazione moderna
        </h1>
        <p className="text-slate-300 text-lg">
          Streaming audio a bassa latenza, UI ottimizzata per mobile e gestione utenti avanzata.
          Accedi al tuo account Melo Chat oppure crea un nuovo profilo in pochi secondi.
        </p>
        <ul className="space-y-3 text-slate-200">
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 mt-0.5">✔</span>
            <span>Registrazione con validazione avanzata lato client e server.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 mt-0.5">✔</span>
            <span>Persistenza delle sessioni sicura con token crittografati.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 mt-0.5">✔</span>
            <span>UI/UX curata nei minimi dettagli con Tailwind CSS.</span>
          </li>
        </ul>
      </div>

      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-slate-800">
            {mode === 'login' ? 'Accedi a Melo Chat' : 'Crea un nuovo account'}
          </h2>
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-semibold"
          >
            {mode === 'login' ? 'Registrati' : 'Hai già un account?'}
          </button>
        </div>

        {mode === 'login' && registerSuccess && (
          <div className="mb-4 bg-emerald-100 border border-emerald-300 text-emerald-700 px-4 py-3 rounded-lg text-sm">
            ✅ {registerSuccess}
          </div>
        )}

        {mode === 'login' ? (
          <LoginForm
            onSuccess={() => {}}
            onSwitchToRegister={() => setMode('register')}
          />
        ) : (
          <RegisterForm
            onSuccess={(message) => onRegistered(message || 'Registrazione completata con successo!')}
            onSwitchToLogin={() => setMode('login')}
          />
        )}
      </div>
    </div>
  </div>
);

UnauthenticatedApp.propTypes = {
  mode: PropTypes.oneOf(['login', 'register']).isRequired,
  setMode: PropTypes.func.isRequired,
  registerSuccess: PropTypes.string,
  onRegistered: PropTypes.func.isRequired
};

UnauthenticatedApp.defaultProps = {
  registerSuccess: ''
};

const AppContent = () => {
  const { isAuthenticated } = useAuth();
  const [authMode, setAuthMode] = useState('login');
  const [registerSuccess, setRegisterSuccess] = useState('');

  if (isAuthenticated) {
    return <AuthenticatedApp />;
  }

  return (
    <UnauthenticatedApp
      mode={authMode}
      setMode={(mode) => {
        setRegisterSuccess('');
        setAuthMode(mode);
      }}
      registerSuccess={registerSuccess}
      onRegistered={(message) => {
        setRegisterSuccess(message);
        setAuthMode('login');
      }}
    />
  );
};

const App = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
