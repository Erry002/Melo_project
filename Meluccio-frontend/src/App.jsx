
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import io from 'socket.io-client';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import LoginForm from './components/LoginForm.jsx';
import RegisterForm from './components/RegisterForm.jsx';
import UserProfile from './components/UserProfile.jsx';
import UserContextMenu from './components/UserContextMenu.jsx';
import Snowfall from 'react-snowfall';
import { findBestUrl } from './utils/connection.js';
import './App.css';
import './Global.css';

const SOCKET_TRANSPORTS = ['websocket', 'polling'];
const TARGET_SAMPLE_RATE = 16000;
const MIN_BUFFER_LEAD = 0.12; // 120ms di margine per assorbire jitter
const CAPTURE_CHUNK_MS = 60;
const WORKLET_RMS_THRESHOLD = 0.0015;
const MESSAGE_HISTORY_LIMIT = 200;
const DEFAULT_ROLE_PRIORITY = 80;

const ROLE_PERMISSION_GROUPS = [
  {
    id: 'server',
    label: 'Server',
    permissions: [
      { id: 'server.manage', label: 'Gestione server' },
      { id: 'roles.manage', label: 'Gestione ruoli' }
    ]
  },
  {
    id: 'members',
    label: 'Membri',
    permissions: [
      { id: 'member.invite', label: 'Invitare membri' },
      { id: 'member.remove', label: 'Rimuovere membri' },
      { id: 'member.assignRole', label: 'Assegnare ruoli' }
    ]
  },
  {
    id: 'channels',
    label: 'Canali',
    permissions: [
      { id: 'channel.create', label: 'Creare canali' },
      { id: 'channel.edit', label: 'Modificare canali' },
      { id: 'channel.delete', label: 'Eliminare canali' }
    ]
  },
  {
    id: 'chat',
    label: 'Chat',
    permissions: [
      { id: 'chat.send', label: 'Inviare messaggi' },
      { id: 'chat.read', label: 'Leggere chat' },
      { id: 'chat.clear', label: 'Svuotare chat' }
    ]
  },
  {
    id: 'voice',
    label: 'Voce',
    permissions: [
      { id: 'voice.connect', label: 'Connettersi ai canali vocali' }
    ]
  }
];

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
  const [chatError, setChatError] = useState('');
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioError, setAudioError] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [serverPermissions, setServerPermissions] = useState(() => new Set());
  const [currentServerRole, setCurrentServerRole] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [isRolePanelOpen, setIsRolePanelOpen] = useState(false);
  const [isRolesSectionOpen, setIsRolesSectionOpen] = useState(false);
  const [roleInfoOpenId, setRoleInfoOpenId] = useState(null);
  const [roleFormName, setRoleFormName] = useState('');
  const [roleFormDescription, setRoleFormDescription] = useState('');
  const [roleFormPriority, setRoleFormPriority] = useState(DEFAULT_ROLE_PRIORITY);
  const [rolePermissionsSelected, setRolePermissionsSelected] = useState(() => new Set());
  const [roleError, setRoleError] = useState('');
  const [roleSuccess, setRoleSuccess] = useState('');
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const playbackRef = useRef({ context: null, nextStartTime: 0 });
  const chatScrollRef = useRef(null);
  const pendingScrollToBottomRef = useRef(false);
  const isRecordingRef = useRef(false);
  const currentChannelIdRef = useRef(null);
  const currentServerIdRef = useRef(null);
  const displayNameRef = useRef('');
  const currentServerRoleRef = useRef(null);

  const scrollChatToBottom = useCallback(() => {
    const container = chatScrollRef.current;
    if (!container) {
      return;
    }

    // Double-rAF: assicura che il DOM dei messaggi sia già aggiornato.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    });
  }, []);

  const displayName = useMemo(() => (
    user?.display_name?.trim() || user?.username || 'Ospite'
  ), [user]);

  const isGlobalAdmin = useMemo(
    () => user?.global_role === 'AmministraMelucci' || Boolean(user?.is_admin),
    [user]
  );

  const hasServerPermission = useCallback((permission) => (
    isGlobalAdmin || serverPermissions.has(permission)
  ), [isGlobalAdmin, serverPermissions]);

  const currentServerRoles = useMemo(() => {
    if (!currentServerId) {
      return [];
    }
    const activeServer = servers.find((server) => server.id === currentServerId);
    return activeServer?.roles || [];
  }, [servers, currentServerId]);

  const activeServerName = useMemo(() => (
    servers.find((server) => server.id === currentServerId)?.name || 'Nessuna stanza'
  ), [servers, currentServerId]);

  const activeChannelName = useMemo(() => {
    const activeServer = servers.find((server) => server.id === currentServerId);
    if (!activeServer) {
      return 'Nessun canale';
    }
    const channel = activeServer.channels?.find((entry) => entry.id === currentChannelId);
    return channel?.name || 'Nessun canale';
  }, [servers, currentServerId, currentChannelId]);

  const selectedContextUser = contextMenu?.user || null;
  const isSelectedUserSelf = selectedContextUser
    ? ((selectedContextUser.userId && selectedContextUser.userId === user?.id)
      || selectedContextUser.socketId === socketId)
    : false;
  const canInviteMembers = hasServerPermission('member.invite');
  const canRemoveMembers = hasServerPermission('member.remove');
  const canCreateSubchannel = hasServerPermission('channel.create');
  const canAssignRoles = hasServerPermission('member.assignRole') || hasServerPermission('roles.manage');

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

  useEffect(() => {
    currentServerRoleRef.current = currentServerRole;
  }, [currentServerRole]);

  useEffect(() => {
    setIsRolePanelOpen(false);
    setRoleInfoOpenId(null);
    setRoleFormName('');
    setRoleFormDescription('');
    setRoleFormPriority(DEFAULT_ROLE_PRIORITY);
    setRolePermissionsSelected(() => new Set());
    setRoleError('');
    setRoleSuccess('');
    setIsCreatingRole(false);
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
    setChatError('');
    setServerPermissions(new Set());
    setCurrentServerRole(null);
    setContextMenu(null);

    socketRef.current.emit('joinChannel', serverId, channelId, displayNameRef.current);

    if (isRecordingRef.current) {
      socketRef.current.emit('join-audio-room', channelId);
    }
    setIsSidebarOpen(false);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleUserContextMenu = useCallback((event, targetUser) => {
    event.preventDefault();
    event.stopPropagation();
    if (!targetUser) {
      return;
    }

    let { clientX, clientY } = event;
    if ((!clientX && !clientY) && event.currentTarget?.getBoundingClientRect) {
      const rect = event.currentTarget.getBoundingClientRect();
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    }

    setContextMenu({
      position: {
        x: clientX,
        y: clientY
      },
      user: targetUser
    });
  }, []);

  const handleInviteUser = useCallback(() => {
    setChatError('Funzione amicizia disponibile a breve.');
  }, []);

  const handleRemoveMember = useCallback((targetUser) => {
    if (!socketRef.current || !targetUser?.userId || !currentServerIdRef.current) {
      return;
    }

    socketRef.current.emit(
      'removeMember',
      {
        serverId: currentServerIdRef.current,
        targetUserId: targetUser.userId,
        reason: `Rimosso da ${displayNameRef.current}`
      },
      (response) => {
        if (!response?.ok) {
          setChatError(response?.error || 'Impossibile rimuovere il membro.');
        }
      }
    );
  }, []);

  const handleCreateSubchannel = useCallback((targetUser) => {
    if (!socketRef.current || !currentServerIdRef.current || !currentChannelIdRef.current) {
      setChatError('Seleziona un canale prima di creare un sottocanale.');
      return;
    }

    const suggestedName = `${targetUser?.displayName || targetUser?.username || 'nuovo'}-sub`;
    const name = window.prompt('Nome del nuovo sottocanale', suggestedName);
    if (!name || !name.trim()) {
      return;
    }

    socketRef.current.emit(
      'createChannel',
      {
        serverId: currentServerIdRef.current,
        parentId: currentChannelIdRef.current,
        name: name.trim(),
        type: 'text'
      },
      (response) => {
        if (!response?.ok) {
          setChatError(response?.error || 'Impossibile creare il sottocanale.');
        }
      }
    );
  }, []);

  const handleAssignRole = useCallback((targetUser, roleId) => {
    if (!socketRef.current || !currentServerIdRef.current || !targetUser?.userId || !roleId) {
      return;
    }

    socketRef.current.emit(
      'assignMemberRole',
      {
        serverId: currentServerIdRef.current,
        targetUserId: targetUser.userId,
        roleId
      },
      (response) => {
        if (!response?.ok) {
          setChatError(response?.error || 'Impossibile aggiornare il ruolo.');
        }
      }
    );
  }, []);

  useEffect(() => {
    if (!contextMenu?.user) {
      return;
    }

    const latest = channelUsers.find((entry) => (
      (entry.socketId && entry.socketId === contextMenu.user.socketId)
      || (entry.userId && entry.userId === contextMenu.user.userId)
    ));

    if (!latest) {
      setContextMenu(null);
    } else if (latest !== contextMenu.user) {
      setContextMenu((prev) => (
        prev
          ? {
            ...prev,
            user: latest
          }
          : prev
      ));
    }
  }, [channelUsers, contextMenu]);

  const sendMessage = useCallback((event) => {
    event?.preventDefault?.();
    const trimmed = newMessage.trim();
    if (!trimmed || !socketRef.current || !currentChannelIdRef.current) {
      return;
    }

    pendingScrollToBottomRef.current = true;

    setChatError('');
    socketRef.current.emit(
      'sendMessage',
      {
        serverId: currentServerIdRef.current,
        channelId: currentChannelIdRef.current,
        text: trimmed
      }
    );
    setNewMessage('');
  }, [newMessage]);

  useEffect(() => {
    if (!pendingScrollToBottomRef.current) {
      return;
    }

    pendingScrollToBottomRef.current = false;
    scrollChatToBottom();
  }, [messages.length, scrollChatToBottom]);

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

  const handleClearChat = useCallback(() => {
    if (!socketRef.current || !currentChannelIdRef.current) {
      return;
    }

    setIsClearingChat(true);
    setChatError('');

    socketRef.current.emit(
      'clearChannelMessages',
      {
        serverId: currentServerIdRef.current,
        channelId: currentChannelIdRef.current
      },
      (response) => {
        if (!response?.ok) {
          setChatError(response?.error || 'Impossibile svuotare la chat.');
        }
        setIsClearingChat(false);
      }
    );
  }, []);

  const runSidebarAction = useCallback(async (action) => {
    if (typeof action === 'function') {
      await action();
    }
    setIsSidebarOpen(false);
  }, [setIsSidebarOpen]);

  const handleServerRolesUpdated = useCallback(({ serverId, roles: updatedRoles }) => {
    if (!serverId || !Array.isArray(updatedRoles)) {
      return;
    }

    setServers((prev) => prev.map((server) => (
      server.id === serverId
        ? { ...server, roles: updatedRoles }
        : server
    )));

    if (serverId === currentServerIdRef.current) {
      const activeRole = currentServerRoleRef.current;
      if (activeRole?.roleId) {
        const matched = updatedRoles.find((role) => role.id === activeRole.roleId);
        if (matched) {
          setCurrentServerRole((prev) => (
            prev
              ? {
                ...prev,
                roleName: matched.name,
                roleKey: matched.key || null
              }
              : prev
          ));
        } else {
          setCurrentServerRole(null);
        }
      }
    }
  }, [setServers, setCurrentServerRole]);

  const toggleRolesSection = useCallback(() => {
    setRoleError('');
    setRoleSuccess('');
    setIsRolesSectionOpen((prev) => {
      const next = !prev;
      if (!next) {
        setIsRolePanelOpen(false);
        setRoleInfoOpenId(null);
      }
      return next;
    });
  }, [setIsRolesSectionOpen, setIsRolePanelOpen, setRoleInfoOpenId, setRoleError, setRoleSuccess]);

  const toggleRolePanel = useCallback(() => {
    setRoleError('');
    setRoleSuccess('');
    setIsRolesSectionOpen(true);
    setIsRolePanelOpen((prev) => !prev);
    setRoleInfoOpenId(null);
  }, [setIsRolesSectionOpen, setRoleInfoOpenId, setRoleError, setRoleSuccess]);

  const toggleRoleDetails = useCallback((roleId) => {
    if (!roleId) {
      setRoleInfoOpenId(null);
      return;
    }
    setRoleInfoOpenId((prev) => (prev === roleId ? null : roleId));
  }, [setRoleInfoOpenId]);

  const toggleRolePermission = useCallback((permission) => {
    if (!permission) {
      return;
    }
    setRolePermissionsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) {
        next.delete(permission);
      } else {
        next.add(permission);
      }
      return next;
    });
    setRoleError('');
    setRoleSuccess('');
  }, [setRoleError, setRoleSuccess]);

  const handleCreateRole = useCallback((event) => {
    event.preventDefault();

    if (!socketRef.current) {
      setRoleError('Connessione al server non disponibile.');
      return;
    }

    const serverId = currentServerIdRef.current;
    if (!serverId) {
      setRoleError('Seleziona prima una stanza.');
      return;
    }

    const trimmedName = roleFormName.trim();
    if (!trimmedName) {
      setRoleError('Inserisci un nome per il ruolo.');
      return;
    }

    setIsCreatingRole(true);
    setRoleError('');
    setRoleSuccess('');

    const parsedPriority = Number.parseInt(roleFormPriority, 10);
    const normalizedPriority = Number.isFinite(parsedPriority)
      ? Math.min(Math.max(parsedPriority, 1), 999)
      : DEFAULT_ROLE_PRIORITY;

    const payload = {
      serverId,
      name: trimmedName,
      description: roleFormDescription.trim(),
      priority: normalizedPriority,
      permissions: Array.from(rolePermissionsSelected)
    };

    socketRef.current.emit('createServerRole', payload, (response) => {
      if (!response?.ok) {
        setRoleError(response?.error || 'Impossibile creare il ruolo.');
        setRoleSuccess('');
        setIsCreatingRole(false);
        return;
      }

      setRoleFormName('');
      setRoleFormDescription('');
      setRoleFormPriority(DEFAULT_ROLE_PRIORITY);
      setRolePermissionsSelected(() => new Set());
      setRoleSuccess('Ruolo creato con successo.');
      setRoleError('');
      setIsCreatingRole(false);
    });
  }, [roleFormName, roleFormDescription, roleFormPriority, rolePermissionsSelected]);

  useEffect(() => {
    let isMounted = true;
    let socket;

    if (!token) {
      return undefined;
    }

    setConnectionStatus('connecting');

    const normalizeMessage = (message) => ({
      ...message,
      timestamp: typeof message?.timestamp === 'string'
        ? new Date(message.timestamp).getTime()
        : message?.timestamp ?? Date.now()
    });

    const handleConnect = () => {
      if (!socket) {
        return;
      }
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
      setMessages([]);
      setChatError('');
      setIsClearingChat(false);
      setServerPermissions(new Set());
      setCurrentServerRole(null);
      setContextMenu(null);
      stopAudio();
    };

    const handleServerList = (payload) => {
      const list = Array.isArray(payload) ? payload : [];
      setServers(list);

      if (!list.length) {
        return;
      }

      const currentServerExists = currentServerIdRef.current
        ? list.some((srv) => srv.id === currentServerIdRef.current)
        : false;

      const activeServer = currentServerExists
        ? list.find((srv) => srv.id === currentServerIdRef.current)
        : list[0];

      const currentChannelExists = currentServerExists
        ? activeServer?.channels?.some((ch) => ch.id === currentChannelIdRef.current)
        : false;

      const activeRole = currentServerRoleRef.current;
      if (activeRole?.roleId && activeServer?.roles) {
        const matchedRole = activeServer.roles.find((role) => role.id === activeRole.roleId);
        if (matchedRole && (matchedRole.name !== activeRole.roleName || matchedRole.key !== activeRole.roleKey)) {
          setCurrentServerRole((prev) => (
            prev
              ? {
                ...prev,
                roleName: matchedRole.name,
                roleKey: matchedRole.key
              }
              : {
                roleId: matchedRole.id,
                roleKey: matchedRole.key,
                roleName: matchedRole.name
              }
          ));
        }
      }

      if (!currentServerExists || !currentChannelExists) {
        const fallbackServer = activeServer || list[0];
        const fallbackChannel = fallbackServer?.channels?.[0];
        if (fallbackServer && fallbackChannel) {
          joinChannel(fallbackServer.id, fallbackChannel.id);
        }
      }
    };

    const handleChannelHistory = ({ channelId, serverId, messages: history }) => {
      if (channelId !== currentChannelIdRef.current || serverId !== currentServerIdRef.current) {
        return;
      }
      setMessages((history || []).map((item) => normalizeMessage(item)).slice(-MESSAGE_HISTORY_LIMIT));
      setChatError('');
      setIsClearingChat(false);
    };

    const handleChatCleared = ({ channelId, serverId }) => {
      if (channelId !== currentChannelIdRef.current || serverId !== currentServerIdRef.current) {
        return;
      }
      setMessages([]);
      setChatError('');
      setIsClearingChat(false);
    };

    const handleChatError = (payload) => {
      if (payload?.message) {
        setChatError(payload.message);
      }
      setIsClearingChat(false);
    };

    const handleNewMessage = (message) => {
      setMessages((prev) => {
        const next = [...prev, normalizeMessage(message)];
        return next.slice(-MESSAGE_HISTORY_LIMIT);
      });
    };

    const handleServerPermissions = ({ serverId, roleId, roleKey, roleName, permissions }) => {
      if (serverId !== currentServerIdRef.current) {
        return;
      }

      setServerPermissions(new Set(Array.isArray(permissions) ? permissions : []));
      setCurrentServerRole({
        roleId: roleId || null,
        roleKey: roleKey || null,
        roleName: roleName || null
      });
    };

    const handleMemberRemoved = ({ serverId, reason }) => {
      if (serverId !== currentServerIdRef.current) {
        return;
      }

      setChatError(reason || 'Sei stato rimosso dalla stanza.');
      setMessages([]);
      setChannelUsers([]);
      setCurrentChannelId(null);
      currentChannelIdRef.current = null;
      setServerPermissions(new Set());
      setCurrentServerRole(null);
      setContextMenu(null);
    };

    const handleUserUpdate = ({ serverId, channelId, users }) => {
      if (serverId !== currentServerIdRef.current || channelId !== currentChannelIdRef.current) {
        return;
      }
      setChannelUsers(Array.isArray(users) ? users : []);
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

    const handleReconnectAttempt = () => setConnectionStatus('connecting');

    const registerSocketHandlers = () => {
      if (!socket) {
        return;
      }
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('serverList', handleServerList);
      socket.on('channelHistory', handleChannelHistory);
      socket.on('chatCleared', handleChatCleared);
      socket.on('chat-error', handleChatError);
      socket.on('newMessage', handleNewMessage);
      socket.on('userUpdate', handleUserUpdate);
      socket.on('serverPermissions', handleServerPermissions);
      socket.on('serverRolesUpdated', handleServerRolesUpdated);
      socket.on('memberRemoved', handleMemberRemoved);
      socket.on('audio-stream', handleIncomingAudio);
      socket.on('audio-error', handleAudioError);
      socket.io?.on('error', handleConnectError);
      socket.io?.on('reconnect', handleConnect);
      socket.io?.on('reconnect_attempt', handleReconnectAttempt);
    };

    const unregisterSocketHandlers = () => {
      if (!socket) {
        return;
      }
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('serverList', handleServerList);
      socket.off('channelHistory', handleChannelHistory);
      socket.off('chatCleared', handleChatCleared);
      socket.off('chat-error', handleChatError);
      socket.off('newMessage', handleNewMessage);
      socket.off('userUpdate', handleUserUpdate);
      socket.off('serverPermissions', handleServerPermissions);
      socket.off('serverRolesUpdated', handleServerRolesUpdated);
      socket.off('memberRemoved', handleMemberRemoved);
      socket.off('audio-stream', handleIncomingAudio);
      socket.off('audio-error', handleAudioError);
      socket.io?.off('error', handleConnectError);
      socket.io?.off('reconnect', handleConnect);
      socket.io?.off('reconnect_attempt', handleReconnectAttempt);
    };

    const setupSocket = async () => {
      try {
        const baseUrl = await findBestUrl();
        if (!isMounted) {
          return;
        }

        socket = io(baseUrl, {
          transports: SOCKET_TRANSPORTS,
          auth: { token },
          withCredentials: true
        });

        socketRef.current = socket;
        registerSocketHandlers();
      } catch (error) {
        console.error('❌ Errore inizializzazione socket:', error);
        setConnectionStatus('error');
      }
    };

    setupSocket();

    const playbackStateRef = playbackRef.current;

    return () => {
      isMounted = false;
      unregisterSocketHandlers();
      if (socket) {
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
  }, [token, joinChannel, handleIncomingAudio, stopAudio, handleServerRolesUpdated]);

  const handleLogout = async () => {
    stopAudio();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    await logout();
  };

  const handleToggleMic = async () => {
    if (isRecording) {
      stopAudio();
      return;
    }
    if (connectionStatus !== 'connected') {
      return;
    }
    await startAudio();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-700 to-indigo-900 px-4 pt-5 pb-24 sm:px-6 sm:pt-8 sm:pb-28 lg:px-14 lg:py-16">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/30 overflow-hidden">
          <div className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-5 border-b border-white/20 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1.5">
              <p className="text-sm uppercase tracking-[0.3em] text-indigo-400 font-semibold">Benvenuto</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">🎵 Melo Chat</h1>
              <p className="text-slate-500">
                Ciao {displayName}! {connectionStatus === 'connected' ? 'Sei online e pronto a chattare.' : 'Stiamo preparando la connessione...'}
              </p>
            </div>
            <div className="flex flex-col sm:items-end w-full md:w-auto gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-[13px] text-slate-50">
                <div className="rounded-2xl px-4 py-3 flex flex-col gap-1 min-w-[160px] bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-lg shadow-indigo-500/30">
                  <span className="font-semibold uppercase tracking-wide text-indigo-100/90 text-[11px]">Stanza attuale</span>
                  <span className="text-sm font-semibold truncate text-white/95">{activeServerName}</span>
                </div>
                <div className="rounded-2xl px-4 py-3 flex flex-col gap-1 min-w-[160px] bg-gradient-to-r from-purple-600 to-violet-500 shadow-lg shadow-violet-500/30">
                  <span className="font-semibold uppercase tracking-wide text-purple-100/90 text-[11px]">Canale attivo</span>
                  <span className="text-sm font-semibold truncate text-white/95">{activeChannelName}</span>
                </div>
                <div className="rounded-2xl px-4 py-3 flex items-center justify-between min-w-[160px] bg-gradient-to-r from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/25">
                  <span className="font-semibold uppercase tracking-wide text-emerald-100/90 text-[11px]">Utenti online</span>
                  <span className="text-base font-bold text-white/95">{channelUsers.length}</span>
                </div>
                <div className="rounded-2xl px-4 py-3 flex items-center justify-between min-w-[160px] bg-gradient-to-r from-slate-600 to-slate-500 shadow-lg shadow-slate-500/25">
                  <span className="font-semibold uppercase tracking-wide text-slate-100/90 text-[11px]">Stanze totali</span>
                  <span className="text-base font-bold text-white/95">{servers.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-8 sm:py-6 flex flex-col gap-4 lg:grid lg:grid-cols-[320px_1fr]">
            {isSidebarOpen && (
              <button
                type="button"
                className="lg:hidden fixed inset-0 bg-slate-900/40 z-40"
                aria-label="Chiudi menu"
                onClick={() => setIsSidebarOpen(false)}
              />
            )}
            <aside
              className={`mobile-panel overflow-hidden min-h-0 sidebar-panel fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[360px] transform transition-transform duration-200 ease-out ${
                isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              } lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0`}
              id="sidebar-panel"
            >
              <div className="h-full overflow-y-auto touch-scroll px-4 py-4 sm:px-5 sm:py-5 pb-24 lg:pb-5 space-y-6">
              <section className="bg-white rounded-2xl shadow-inner border border-slate-100 p-5">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Menu
                </h2>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => runSidebarAction(handleToggleConnection)}
                    aria-label={connectionStatus === 'connected' ? 'Disconnetti' : 'Connetti'}
                    title={connectionStatus === 'connected' ? 'Disconnetti' : 'Connetti'}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/80 transition-colors min-w-0"
                    disabled={!socketRef.current}
                  >
                    <span className="text-lg shrink-0">{connectionStatus === 'connected' ? '🔌' : '⚡️'}</span>
                    <span className="text-sm font-semibold flex-1 min-w-0 whitespace-normal leading-tight">
                      {connectionStatus === 'connected' ? 'Disconnetti' : 'Connetti'}
                    </span>
                  </button>
                </div>
              </section>

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
                    <p className="text-xs text-slate-400">
                      Controlla il microfono dalla bottom bar.
                    </p>
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
                  Utenti nel canale
                </h2>
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 touch-scroll">
                  {channelUsers.length === 0 ? (
                    <p className="text-sm text-slate-400">Nessuno è attualmente connesso.</p>
                  ) : (
                    channelUsers.map((channelUser, index) => {
                      const keyValue = channelUser.socketId
                        || channelUser.userId
                        || (channelUser.username ? `${channelUser.username}-${index}` : `user-${index}`);
                      const displayLabel = channelUser.displayName || channelUser.username || keyValue;
                      const isSelfEntry = (channelUser.userId && channelUser.userId === user?.id)
                        || channelUser.socketId === socketId
                        || displayLabel === displayName;
                      const roleLabel = channelUser.roleName || 'Online';

                      return (
                        <div
                          key={keyValue}
                          role="button"
                          tabIndex={0}
                          onContextMenu={(event) => handleUserContextMenu(event, channelUser)}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && (canAssignRoles || canRemoveMembers || canCreateSubchannel)) {
                              event.preventDefault();
                              handleUserContextMenu(event, channelUser);
                            }
                          }}
                          className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/70 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                        >
                          <span className="font-medium truncate" title={displayLabel}>{displayLabel}</span>
                          <span className="text-xs text-slate-400 ml-3 whitespace-nowrap">
                            {isSelfEntry ? 'Tu' : roleLabel}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="bg-white rounded-2xl shadow-inner border border-slate-100 p-5">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Stanze &amp; Canali
                </h2>
                <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1 touch-scroll">
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                      Ruoli &amp; permessi
                    </h2>
                    {isRolesSectionOpen && (
                      <p className="text-xs text-slate-400">
                        Gestisci i ruoli disponibili nella stanza corrente.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={toggleRolesSection}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        isRolesSectionOpen
                          ? 'bg-slate-200 border-slate-300 text-slate-600'
                          : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {isRolesSectionOpen ? 'Nascondi' : 'Mostra'}
                    </button>
                    {canAssignRoles && (
                      <button
                        type="button"
                        onClick={toggleRolePanel}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                          isRolePanelOpen
                            ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500'
                            : 'bg-indigo-100 border-indigo-200 text-indigo-700 hover:bg-indigo-200 hover:border-indigo-300'
                        }`}
                      >
                        {isRolePanelOpen ? 'Annulla' : 'Nuovo ruolo'}
                      </button>
                    )}
                  </div>
                </div>

                {isRolesSectionOpen && (
                  <>
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 touch-scroll">
                      {currentServerRoles.length === 0 ? (
                        <p className="text-sm text-slate-400">Nessun ruolo configurato.</p>
                      ) : (
                        currentServerRoles
                          .slice()
                          .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
                          .map((role) => {
                            const permissionsSet = role.permissions instanceof Set
                              ? role.permissions
                              : new Set(Array.isArray(role.permissions) ? role.permissions : []);
                            const isInfoOpen = roleInfoOpenId === role.id;

                            return (
                              <div
                                key={role.id}
                                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-semibold text-slate-600">
                                      {role.name}
                                    </p>
                                    {role.description && (
                                      <p className="text-xs text-slate-400 leading-snug">
                                        {role.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-2 text-[10px] uppercase tracking-wide">
                                    <div className="flex flex-wrap justify-end gap-1">
                                      {role.isOwner && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-600 font-semibold">
                                          Owner
                                        </span>
                                      )}
                                      {role.isDefault && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 font-semibold">
                                          Default
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleRoleDetails(role.id)}
                                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
                                        isInfoOpen
                                          ? 'border-indigo-400 bg-indigo-100 text-indigo-700'
                                          : 'border-indigo-200 bg-white text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50'
                                      }`}
                                      aria-expanded={isInfoOpen}
                                    >
                                      <span>Info</span>
                                      <span className="text-[10px] font-normal uppercase tracking-wider">
                                        {isInfoOpen ? '▲' : '▼'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {isInfoOpen && (
                                  <div className="mt-3 space-y-3 rounded-lg border border-indigo-100 bg-white/90 px-3 py-3">
                                    {ROLE_PERMISSION_GROUPS.map((group) => (
                                      <div key={group.id} className="space-y-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                          {group.label}
                                        </p>
                                        <div className="space-y-1">
                                          {group.permissions.map((permission) => {
                                            const isActive = permissionsSet.has(permission.id);
                                            return (
                                              <div
                                                key={permission.id}
                                                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
                                              >
                                                <span className="font-medium">{permission.label}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                                  isActive
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-200 text-slate-600'
                                                }`}
                                                >
                                                  {isActive ? 'Attivo' : 'Off'}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                      )}
                    </div>

                    {canAssignRoles && isRolePanelOpen && (
                      <form onSubmit={handleCreateRole} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="grid grid-cols-1 gap-3">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Nome ruolo
                            <input
                              type="text"
                              value={roleFormName}
                              onChange={(event) => {
                                setRoleFormName(event.target.value);
                                setRoleSuccess('');
                                setRoleError('');
                              }}
                              placeholder="Ad esempio, Moderatore"
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                              required
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Descrizione (facoltativa)
                            <textarea
                              value={roleFormDescription}
                              onChange={(event) => {
                                setRoleFormDescription(event.target.value);
                                setRoleSuccess('');
                              }}
                              rows={2}
                              placeholder="Descrivi il ruolo per il tuo team"
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Priorità (1-999)
                            <input
                              type="number"
                              min={1}
                              max={999}
                              value={roleFormPriority}
                              onChange={(event) => {
                                setRoleFormPriority(event.target.value);
                                setRoleSuccess('');
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                          </label>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Permessi
                          </p>
                          <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                            {ROLE_PERMISSION_GROUPS.map((group) => (
                              <fieldset key={group.id} className="rounded-lg border border-slate-200 bg-white/80 p-2">
                                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  {group.label}
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                  {group.permissions.map((permission) => (
                                    <label key={permission.id} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                                      <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                                        checked={rolePermissionsSelected.has(permission.id)}
                                        onChange={() => toggleRolePermission(permission.id)}
                                      />
                                      {permission.label}
                                    </label>
                                  ))}
                                </div>
                              </fieldset>
                            ))}
                          </div>
                        </div>

                        {roleError && (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                            {roleError}
                          </div>
                        )}
                        {roleSuccess && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-600">
                            {roleSuccess}
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={isCreatingRole}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                              isCreatingRole
                                ? 'bg-indigo-300 cursor-wait'
                                : 'bg-indigo-500 hover:bg-indigo-600'
                            }`}
                          >
                            {isCreatingRole ? 'Creazione…' : 'Crea ruolo'}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </section>
              </div>
            </aside>

            <main className="order-1 lg:order-2 relative flex flex-col min-h-0 mobile-panel overflow-hidden chat-panel">
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 sticky-mobile-header bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 rounded-t-2xl">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-700 flex items-center gap-2">
                    💬 Conversazione
                    {currentChannelId && (
                      <span className="text-xs font-medium px-2 py-1 bg-indigo-100 text-indigo-600 rounded-full">
                        {currentChannelId}
                      </span>
                    )}
                  </h2>
                  <button
                    type="button"
                    onClick={handleClearChat}
                    disabled={
                      isClearingChat
                      || connectionStatus !== 'connected'
                      || !currentChannelId
                      || messages.length === 0
                    }
                    aria-busy={isClearingChat}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isClearingChat
                        ? 'bg-slate-200 text-slate-400 cursor-wait'
                        : connectionStatus !== 'connected' || !currentChannelId || messages.length === 0
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                    }`}
                  >
                    {isClearingChat ? 'Svuotando…' : '🗑️ Svuota chat'}
                  </button>
                </div>
                {chatError && (
                  <p className="mt-2 text-xs text-rose-500">
                    {chatError}
                  </p>
                )}
              </div>

              <div ref={chatScrollRef} className="flex-1 min-h-[42vh] lg:min-h-0 overflow-y-auto touch-scroll px-4 sm:px-6 pt-4 pb-10 sm:py-6 space-y-4 chat-surface">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    Nessun messaggio. Inizia la conversazione!
                  </div>
                ) : (
                  messages.map((message) => (
                    (() => {
                      const isOwnMessage = (message.userId && message.userId === user?.id)
                        || (message.username && message.username === user?.username)
                        || (message.user && message.user === user?.username)
                        || (message.displayName && message.displayName === displayName);
                      const initials = (message.displayName || message.user || message.username || '?').slice(0, 2).toUpperCase();
                      return (
                    <div
                      key={message.id || `${message.timestamp}-${message.user || message.username}`}
                      className={`message-row ${isOwnMessage ? 'message-row--own' : ''}`}
                    >
                      <div className={`message-bubble ${isOwnMessage ? 'message-bubble--own' : 'message-bubble--other'}`}>
                        <div className="message-meta">
                          <div className="message-avatar" aria-hidden>
                            <span>{initials}</span>
                          </div>
                          <div className="message-header">
                            <span className="message-author">{message.displayName || message.user || message.username}</span>
                            <span className="message-time">{formatTime(message.timestamp)}</span>
                          </div>
                        </div>
                        <p className="message-text">
                          {message.text}
                        </p>
                      </div>
                    </div>
                      );
                    })()
                  ))
                )}
              </div>

              <form
                onSubmit={sendMessage}
                className="border-t border-slate-100 bg-white/95 sticky-mobile-footer safe-bottom px-4 py-4 sm:px-6 sm:py-6 flex flex-col gap-3 rounded-b-2xl"
              >
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
              </form>
            </main>
          </div>
        </div>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[60] border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 safe-bottom-sm">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-3 gap-2 py-1.5">
            <button
              type="button"
              onClick={() => {
                setIsSidebarOpen(false);
                setShowProfile((prev) => !prev);
              }}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition-colors"
              aria-label="Profilo"
            >
              <span className="text-base leading-none">👤</span>
              <span className="text-[10px] font-semibold leading-none">Profilo</span>
            </button>

            <button
              type="button"
              onClick={handleToggleMic}
              disabled={connectionStatus !== 'connected' && !isRecording}
              aria-pressed={isRecording}
              className={`mic-button flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1.5 transition-colors ${
                isRecording
                  ? 'mic-button--recording bg-emerald-50 text-emerald-700'
                  : connectionStatus !== 'connected'
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
              aria-label={isRecording ? 'Disattiva microfono' : 'Attiva microfono'}
            >
              <span className="text-base leading-none">{isRecording ? '🔇' : '🎙️'}</span>
              <span className="text-[10px] font-semibold leading-none">Microfono</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowProfile(false);
                setIsSidebarOpen((prev) => !prev);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1.5 transition-colors ${
                isSidebarOpen ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
              aria-expanded={isSidebarOpen}
              aria-controls="sidebar-panel"
              aria-label={isSidebarOpen ? 'Chiudi menu' : 'Apri menu'}
            >
              <span className="text-base leading-none">☰</span>
              <span className="text-[10px] font-semibold leading-none">Menu</span>
            </button>
          </div>
        </div>
      </nav>

      {showProfile && <UserProfile onClose={() => setShowProfile(false)} onLogout={handleLogout} />}
      <UserContextMenu
        visible={Boolean(contextMenu?.user)}
        position={contextMenu?.position || { x: 0, y: 0 }}
        targetUser={selectedContextUser}
        onClose={closeContextMenu}
        onInvite={handleInviteUser}
        onRemove={handleRemoveMember}
        onCreateSubchannel={handleCreateSubchannel}
        onAssignRole={handleAssignRole}
        roles={currentServerRoles}
        canInvite={canInviteMembers}
        canRemove={canRemoveMembers}
        canCreateSubchannel={canCreateSubchannel}
        canAssignRole={canAssignRoles}
        currentRoleId={selectedContextUser?.roleId || null}
        isSelf={isSelectedUserSelf}
      />
    </div>
  );
};

const UnauthenticatedApp = ({ mode, setMode, registerSuccess, onRegistered }) => (
  <div className="auth-hero">
    <div className="auth-hero__waves" aria-hidden>
      <span className="auth-wave auth-wave--1" />
      <span className="auth-wave auth-wave--2" />
      <span className="auth-wave auth-wave--3" />
    </div>

    <div className="auth-hero__content px-4 py-10 sm:px-6 sm:py-16">
      <div className="max-w-5xl w-full mx-auto grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] items-center">
        <div className="order-1 lg:order-1 text-center lg:text-left text-white space-y-4 sm:space-y-5">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Melo Chat</h1>
          <p className="text-base sm:text-xl text-indigo-50/95 font-medium max-w-2xl mx-auto lg:mx-0">
            Audio chat in tempo reale con stanze vocali pronte, ovunque tu sia. Open source, accesso rapido e ruoli gestiti: crea la tua sala audio in pochi secondi.
          </p>
          <div className="flex justify-center lg:justify-start">
            <a
              href="https://github.com/erry002/Melo_project"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-indigo-100/60 bg-white px-6 py-3 text-sm font-semibold text-indigo-700 shadow-lg shadow-indigo-900/25 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" className="h-4 w-4">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.42 7.86 10.95.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.53-1.35-1.29-1.71-1.29-1.71-1.06-.73.08-.72.08-.72 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.74 1.26 3.4.96.1-.75.41-1.26.74-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.6.23 2.78.11 3.07.74.8 1.18 1.83 1.18 3.09 0 4.41-2.68 5.39-5.24 5.67.42.36.8 1.07.8 2.16 0 1.56-.02 2.82-.02 3.2 0 .31.21.68.8.56A10.51 10.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                </svg>
              </span>
              Scarica da GitHub
            </a>
          </div>
          <div className="flex flex-wrap justify-center lg:justify-start gap-2 text-xs sm:text-sm text-indigo-50/85">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/5 px-3 py-1 backdrop-blur">
              🚀 Open source
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/5 px-3 py-1 backdrop-blur">
              🛠️ Self-hosted
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/5 px-3 py-1 backdrop-blur">
              🔒 Token sicuro
            </span>
          </div>
        </div>

        <div className="order-2 lg:order-2 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/40 p-6 sm:p-8">
          <div className="mb-6 space-y-4">
            <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`w-full rounded-xl py-2 text-sm font-semibold transition-all ${
                  mode === 'login'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-indigo-500'
                }`}
                aria-pressed={mode === 'login'}
              >
                Accedi
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`w-full rounded-xl py-2 text-sm font-semibold transition-all ${
                  mode === 'register'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-indigo-500'
                }`}
                aria-pressed={mode === 'register'}
              >
                Registrati
              </button>
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-slate-900">
                {mode === 'login' ? 'Bentornato nel tuo studio audio' : 'Crea il tuo profilo Melo Chat'}
              </h2>
              {mode !== 'login' && (
                <p className="text-sm text-slate-500">
                  Bastano pochi dettagli per iniziare a trasmettere la tua voce.
                </p>
              )}
            </div>

            {mode === 'login' && registerSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
                ✅
                {' '}
                {registerSuccess}
              </div>
            )}
          </div>

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
    <div className="fixed inset-0 pointer-events-none z-[80]">
      <Snowfall color="#82C3D9" style={{ width: '100%', height: '100%' }} />
    </div>
    <AppContent />
  </AuthProvider>
);

export default App;
