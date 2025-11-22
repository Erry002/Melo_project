import { useState, useRef, useEffect, useCallback } from 'react';

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

const isSecureForMedia = () => {
  if (window.isSecureContext) {
    return true;
  }

  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
};

export const useSimpleAudio = (socket) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectedUsers, setConnectedUsers] = useState(new Set());
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioElementsRef = useRef(new Map()); // Traccia audio degli altri utenti
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  // Inizializza audio recording
  const startAudio = useCallback(async () => {
    try {
      console.log('🎤 Starting audio capture...');
      
      // Richiedi permesso microfono con configurazione ottimizzata
      if (!isSecureForMedia()) {
        throw new Error('Per usare il microfono da mobile è necessario accedere via HTTPS (es. dominio Ngrok) oppure tramite localhost.');
      }

      const stream = await requestUserMedia({
        audio: {
          sampleRate: 16000,     // Bassa qualità per iniziare - ottima per Raspberry Pi
          channelCount: 1,       // Mono - dimezza il traffico
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Ottimizzazioni per mobile
          latency: 0.01,  // 10ms di latenza
          volume: 1.0
        }
      });

      streamRef.current = stream;

      // Controlla supporto formato - fallback per compatibilità
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      console.log(`📝 Using audio format: ${mimeType}`);

      // Crea MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 32000  // 32kbps - buon compromise qualità/banda
      });

      // Quando abbiamo dati audio, inviali al server
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && socket && isConnected) {
          console.log('📡 Sending audio chunk:', event.data.size, 'bytes');
          socket.emit('audio-chunk', event.data);
        }
      };

      mediaRecorderRef.current.onstart = () => {
        console.log('✅ MediaRecorder started');
        setIsRecording(true);
      };

      mediaRecorderRef.current.onstop = () => {
        console.log('⏹️ MediaRecorder stopped');
        setIsRecording(false);
      };

      mediaRecorderRef.current.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
        setIsRecording(false);
      };

      // Inizia recording con chunks ogni 100ms (bassa latenza)
      mediaRecorderRef.current.start(100);

      // Bonus: Audio level monitoring per UI feedback
      startAudioLevelMonitoring(stream);

      return stream;

    } catch (error) {
      console.error('❌ Error starting audio:', error);
      
      // Feedback user-friendly basato sul tipo di errore
      if (error.name === 'NotAllowedError') {
        throw new Error('Permesso microfono negato. Abilita il microfono nelle impostazioni del browser.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('Nessun microfono trovato. Verifica che sia collegato correttamente.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Il tuo browser non supporta la registrazione audio.');
      } else {
        throw new Error(`Errore audio: ${error.message}`);
      }
    }
  }, [socket, isConnected, startAudioLevelMonitoring]);

  // Stop audio recording con cleanup completo
  const stopAudio = useCallback(() => {
    console.log('🛑 Stopping audio...');
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('🔇 Audio track stopped');
      });
      streamRef.current = null;
    }
    
    // Cleanup audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsRecording(false);
    setAudioLevel(0);
  }, [isRecording]);

  // Monitora livello audio per visualizzazione in tempo reale
  const startAudioLevelMonitoring = useCallback((stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateLevel = () => {
        if (!isRecording || !analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.round(average));
        
        requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } catch (error) {
      console.error('Audio level monitoring failed:', error);
      // Non è critico, continua senza monitoring
    }
  }, [isRecording]);

  // Gestione audio ricevuto dagli altri utenti
  const playReceivedAudio = useCallback((audioData, userId, username) => {
    try {
      // Crea blob dall'audio ricevuto
      const audioBlob = new Blob([audioData], { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Riusa audio element esistente o creane uno nuovo
      let audioElement = audioElementsRef.current.get(userId);
      
      if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.volume = 1.0;
        audioElement.preload = 'none';
        audioElementsRef.current.set(userId, audioElement);
        
        console.log(`🔊 Created audio element for user: ${username || userId}`);
      }
      
      // Cleanup URL precedente per evitare memory leaks
      if (audioElement.src) {
        URL.revokeObjectURL(audioElement.src);
      }
      
      audioElement.src = audioUrl;
      
      // Play con error handling robusto
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error(`Failed to play audio from ${username || userId}:`, error);
          // Riprova una volta dopo un breve delay
          setTimeout(() => {
            audioElement.play().catch(e => {
              console.error(`Second attempt failed for ${username || userId}:`, e);
            });
          }, 100);
        });
      }
      
      // Cleanup automatico quando finisce
      audioElement.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
      // Cleanup anche in caso di errore
      audioElement.onerror = (error) => {
        console.error(`Audio element error for ${username || userId}:`, error);
        URL.revokeObjectURL(audioUrl);
      };
      
    } catch (error) {
      console.error('Error playing received audio:', error);
    }
  }, []);

  // Cleanup audio element per un utente specifico
  const cleanupUserAudio = useCallback((userId) => {
    const audioElement = audioElementsRef.current.get(userId);
    if (audioElement) {
      audioElement.pause();
      if (audioElement.src) {
        URL.revokeObjectURL(audioElement.src);
      }
      audioElement.src = '';
      audioElement.srcObject = null;
      audioElementsRef.current.delete(userId);
      console.log(`🧹 Cleaned up audio for user: ${userId}`);
    }
  }, []);

  // Setup socket listeners
  useEffect(() => {
    if (!socket) return;

    // Conferma connessione
    socket.on('connect', () => {
      console.log('🔌 Socket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      setIsConnected(false);
      setConnectedUsers(new Set());
    });

    // Ricevi audio dagli altri utenti
    socket.on('audio-broadcast', ({ audioData, from, username }) => {
      console.log(`📥 Received audio from ${username || from}:`, audioData.byteLength, 'bytes');
      playReceivedAudio(audioData, from, username);
      
      // Aggiungi utente alla lista se non c'è già
      setConnectedUsers(prev => new Set([...prev, from]));
    });

    // Utente si è unito alla chat audio
    socket.on('user-joined-audio', ({ userId, username }) => {
      console.log(`👋 User joined audio: ${username || userId}`);
      setConnectedUsers(prev => new Set([...prev, userId]));
    });

    // Utente ha lasciato la chat audio
    socket.on('user-left-audio', ({ userId, username }) => {
      console.log(`👋 User left audio: ${username || userId}`);
      cleanupUserAudio(userId);
      setConnectedUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    });

    // Error handling
    socket.on('audio-error', ({ message, code }) => {
      console.error(`🚨 Server audio error: ${message} (${code})`);
    });

    // Cleanup listeners
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('audio-broadcast');
      socket.off('user-joined-audio');
      socket.off('user-left-audio');
      socket.off('audio-error');
    };
  }, [socket, playReceivedAudio, cleanupUserAudio]);

  // Cleanup completo al dismount
  useEffect(() => {
    // Salva riferimento locale per cleanup sicuro
    const audioElementsMap = audioElementsRef.current;
    
    return () => {
      console.log('🧹 useSimpleAudio cleanup on unmount');
      stopAudio();
      
      // Cleanup tutti gli audio elements
      audioElementsMap.forEach((audioElement, userId) => {
        if (audioElement.src) {
          URL.revokeObjectURL(audioElement.src);
        }
        audioElement.pause();
        audioElement.src = '';
        audioElement.srcObject = null;
        console.log(`🧹 Cleaned up audio element for user: ${userId}`);
      });
      audioElementsMap.clear();
    };
  }, [stopAudio]);

  return {
    isRecording,
    isConnected,
    audioLevel,
    connectedUsers: Array.from(connectedUsers),
    startAudio,
    stopAudio
  };
};
