import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [username] = useState(`User_${Math.random().toString(36).substr(2, 5)}`);
  const [servers, setServers] = useState([]);
  const [currentChannelId, setCurrentChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);

  // Stati audio semplificati
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioError, setAudioError] = useState(null);
  const streamRef = useRef(null);

  // Funzioni audio con analisi reale
  const startAudio = async () => {
    try {
      console.log('🎤 Avvio audio...');
      setAudioError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      streamRef.current = stream;
      setIsRecording(true);
      
      // Crea AudioContext per analisi livello reale
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      // Setup audio processing: NUOVO APPROCCIO - Streaming continuo
      let processor;
      let workletNode;
      
      try {
        // Torniamo a ScriptProcessor ma con approccio diverso - streaming real-time
        console.log('🎧 Setup streaming audio continuo...');
        
        // Buffer molto piccolo per latenza minima
        processor = audioContext.createScriptProcessor(512, 1, 1);
        
        // Connetti audio chain
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.connect(processor);
        processor.connect(audioContext.destination);
        
        // Invio continuo real-time (no batching) - OTTIMIZZATO
        processor.onaudioprocess = (event) => {
          if (socket && currentChannelId) {
            const inputData = event.inputBuffer.getChannelData(0);
            
            // Controllo attività audio con soglia ancora più bassa per più continuità
            const rms = Math.sqrt(inputData.reduce((sum, sample) => sum + sample * sample, 0) / inputData.length);
            
            if (rms > 0.005) { // Soglia molto bassa per catturare sussurri
              // Invia raw float32 con qualche smoothing
              const smoothedData = new Float32Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                // Leggero smoothing per ridurre rumore digitale
                if (i > 0 && i < inputData.length - 1) {
                  smoothedData[i] = (inputData[i-1] * 0.25 + inputData[i] * 0.5 + inputData[i+1] * 0.25);
                } else {
                  smoothedData[i] = inputData[i];
                }
              }
              
              socket.emit('audio-stream', {
                samples: Array.from(smoothedData),
                sampleRate: audioContext.sampleRate,
                timestamp: audioContext.currentTime * 1000,
                channelId: currentChannelId
              });
              
              // Log ultra ridotto
              if (Math.random() < 0.01) {
                console.log('🎵 Stream audio, RMS:', rms.toFixed(4));
              }
            }
          }
        };
        
        console.log('✅ Audio streaming continuo attivo');
        
      } catch (error) {
        console.error('❌ Errore setup audio streaming:', error);
        setAudioError('Errore nella configurazione audio');
      }
      
      // Sistema di monitoring livello audio (funziona con entrambi i sistemi)
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (isRecording) {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255);
          requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();
      
      // Salva riferimenti per cleanup
      streamRef.current.audioContext = audioContext;
      streamRef.current.analyser = analyser;
      streamRef.current.processor = processor;
      streamRef.current.workletNode = workletNode; // Riferimento specifico per AudioWorklet
      
      console.log('✅ Audio attivo con analisi reale');
    } catch (error) {
      console.error('❌ Errore audio:', error);
      setAudioError('Permesso microfono negato o non disponibile');
    }
  };

  const stopAudio = () => {
    console.log('🔇 Disattivo audio...');
    
    // Reset buffer audio
    if (window.resetAudioBuffer) {
      window.resetAudioBuffer();
    }
    
    if (streamRef.current) {
      // Cleanup Processor (AudioWorklet o ScriptProcessor)
      if (streamRef.current.processor) {
        streamRef.current.processor.disconnect();
      }
      
      // Cleanup specifico per AudioWorklet
      if (streamRef.current.workletNode) {
        streamRef.current.workletNode.port.close();
        streamRef.current.workletNode.disconnect();
      }
      
      // Cleanup Analyser
      if (streamRef.current.analyser) {
        streamRef.current.analyser.disconnect();
      }
      
      // Cleanup AudioContext
      if (streamRef.current.audioContext) {
        streamRef.current.audioContext.close();
      }
      
      // Cleanup MediaStream
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsRecording(false);
    setAudioLevel(0);
    setAudioError(null);
  };

  useEffect(() => {
    // Connessione Socket.IO
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('🔌 Connesso al server:', newSocket.id);
      setConnectionStatus('connected');
      newSocket.emit('setUsername', username);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnesso dal server');
      setConnectionStatus('disconnected');
    });

    newSocket.on('serverList', (serverList) => {
      console.log('📋 Lista server ricevuta:', serverList);
      setServers(serverList);
      
      // Auto-join al primo canale del primo server
      if (serverList.length > 0 && serverList[0].channels.length > 0) {
        const firstServer = serverList[0];
        const firstChannel = firstServer.channels[0];
        
        console.log('🏠 Auto-join al canale:', firstChannel.name, 'ID:', firstChannel.id);
        setCurrentServerId(firstServer.id);
        setCurrentChannelId(firstChannel.id);
        
        newSocket.emit('joinChannel', firstServer.id, firstChannel.id, username);
        
        // Unisciti anche alla room audio per quel canale
        newSocket.emit('join-audio-room', firstChannel.id);
        console.log('🎵 Joined audio room:', firstChannel.id);
      }
    });

    newSocket.on('newMessage', (messageData) => {
      console.log('💬 Nuovo messaggio ricevuto:', messageData);
      setMessages(prev => {
        console.log('📝 Messaggi precedenti:', prev.length);
        const newMessages = [...prev, messageData];
        console.log('📝 Messaggi dopo aggiunta:', newMessages.length);
        return newMessages;
      });
    });

    // Sistema di playback continuo migliorato
    let audioStreamBuffer = new Float32Array(44100 * 3); // Buffer più grande: 3 secondi
    let writePosition = 0;
    let readPosition = 0;
    let isStreamPlaying = false;
    let bufferReady = false;
    
    // Listener per audio stream continuo
    newSocket.on('audio-stream', async (audioData) => {
      try {
        // Setup AudioContext per playback se necessario
        if (!window.playbackContext) {
          window.playbackContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const audioContext = window.playbackContext;
        
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
          console.log('🔊 AudioContext riattivato');
        }
        
        // Scrivi samples nel buffer circolare
        const samples = new Float32Array(audioData.samples);
        
        for (let i = 0; i < samples.length; i++) {
          audioStreamBuffer[writePosition] = samples[i];
          writePosition = (writePosition + 1) % audioStreamBuffer.length;
          
          // Se raggiungiamo la read position, spostiamo la read position
          if (writePosition === readPosition) {
            readPosition = (readPosition + 1) % audioStreamBuffer.length;
          }
        }
        
        // Avvia playback continuo se non già attivo
        if (!isStreamPlaying) {
          startContinuousPlayback(audioContext);
        }
        
        // Log occasionale
        if (Math.random() < 0.05) {
          const bufferSize = (writePosition - readPosition + audioStreamBuffer.length) % audioStreamBuffer.length;
          console.log('🔊 Stream ricevuto, buffer size:', bufferSize, 'samples');
        }
        
      } catch (error) {
        console.error('❌ Errore audio stream:', error);
      }
    });
    
    // Avvia playback continuo con timing audio perfetto
    const startContinuousPlayback = (audioContext) => {
      if (isStreamPlaying) return;
      
      console.log('🎵 Avvio playback continuo con timing perfetto...');
      isStreamPlaying = true;
      bufferReady = false;
      
      const CHUNK_SIZE = 1024; // Chunk più piccoli per meno latenza
      const MIN_BUFFER_SIZE = 4096; // Buffer minimo ridotto
      
      let nextStartTime = audioContext.currentTime + 0.1; // Inizia tra 100ms
      
      const scheduleNextChunk = () => {
        if (!isStreamPlaying) return;
        
        const availableSamples = (writePosition - readPosition + audioStreamBuffer.length) % audioStreamBuffer.length;
        
        // Aspetta buffer minimo
        if (!bufferReady && availableSamples < MIN_BUFFER_SIZE) {
          setTimeout(scheduleNextChunk, 10);
          return;
        }
        
        bufferReady = true;
        
        // Se abbiamo dati e siamo in tempo per il prossimo chunk
        const currentTime = audioContext.currentTime;
        const timeUntilNext = nextStartTime - currentTime;
        
        if (availableSamples >= CHUNK_SIZE && timeUntilNext <= 0.05) {
          // Crea e programma il chunk
          const playbackBuffer = audioContext.createBuffer(1, CHUNK_SIZE, audioContext.sampleRate);
          const channelData = playbackBuffer.getChannelData(0);
          
          // Copia samples
          for (let i = 0; i < CHUNK_SIZE; i++) {
            channelData[i] = audioStreamBuffer[readPosition];
            readPosition = (readPosition + 1) % audioStreamBuffer.length;
          }
          
          // Setup audio chain
          const source = audioContext.createBufferSource();
          source.buffer = playbackBuffer;
          
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 0.5; // Volume più basso
          
          // Filtro anti-aliasing leggero
          const filter = audioContext.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 15000;
          filter.Q.value = 0.7;
          
          source.connect(filter);
          filter.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          // Start con timing perfetto
          const startTime = Math.max(nextStartTime, currentTime + 0.005);
          source.start(startTime);
          
          // Calcola il prossimo start time preciso
          const chunkDuration = CHUNK_SIZE / audioContext.sampleRate;
          nextStartTime = startTime + chunkDuration;
          
          // Cleanup
          source.onended = () => {
            source.disconnect();
            filter.disconnect();
            gainNode.disconnect();
          };
          
          // Log diagnostico
          if (Math.random() < 0.03) {
            console.log('🎵 Chunk @', startTime.toFixed(3), 'next @', nextStartTime.toFixed(3), 'buffer:', availableSamples);
          }
        }
        
        // Prossimo check: calcolato per essere giusto in tempo
        const nextCheckTime = Math.max(5, (nextStartTime - currentTime - 0.02) * 1000);
        setTimeout(scheduleNextChunk, nextCheckTime);
      };
      
      scheduleNextChunk();
    };
    
    // Reset quando l'utente ferma l'audio
    const resetAudioBuffer = () => {
      isStreamPlaying = false;
      bufferReady = false;
      writePosition = 0;
      readPosition = 0;
      console.log('� Buffer audio resettato');
    };
    
    // Esponi la funzione reset per cleanup
    window.resetAudioBuffer = resetAudioBuffer;

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [username]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (socket && newMessage.trim() && currentChannelId) {
      console.log('🚀 Invio messaggio:', newMessage.trim(), 'al canale:', currentChannelId);
      socket.emit('sendMessage', currentChannelId, newMessage.trim());
      setNewMessage('');
    } else {
      console.log('❌ Messaggio non inviato - socket:', !!socket, 'message:', newMessage.trim(), 'channelId:', currentChannelId);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('it-IT', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#1f2937', color: 'white', padding: '20px'}}>
      {/* Header */}
      <div style={{
        backgroundColor: '#374151', 
        padding: '16px', 
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{margin: 0, fontSize: '24px', fontWeight: 'bold'}}>
          🎵 Meluccio Chat
        </h1>
        
        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
          {/* Status connessione */}
          <div style={{
            backgroundColor: connectionStatus === 'connected' ? '#059669' : '#dc2626',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '14px'
          }}>
            {connectionStatus === 'connected' ? '🟢 Online' : '🔴 Offline'} - {username}
          </div>
          
          {/* Controlli audio */}
          <button
            onClick={isRecording ? stopAudio : startAudio}
            disabled={connectionStatus !== 'connected'}
            style={{
              backgroundColor: isRecording ? '#dc2626' : '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '14px',
              cursor: connectionStatus === 'connected' ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🎤 {isRecording ? 'MUTO' : 'PARLA'}
          </button>
          
          {/* Indicatore livello audio */}
          {isRecording && (
            <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              <span style={{fontSize: '12px', color: '#9ca3af'}}>Audio:</span>
              <div style={{
                width: '60px', 
                height: '4px', 
                backgroundColor: '#4b5563', 
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: audioLevel > 0.5 ? '#dc2626' : audioLevel > 0.2 ? '#f59e0b' : '#10b981',
                  width: `${Math.min(audioLevel * 100, 100)}%`,
                  transition: 'width 0.1s ease'
                }}></div>
              </div>
            </div>
          )}
          
          {/* Errore audio */}
          {audioError && (
            <div style={{
              backgroundColor: '#dc2626',
              color: 'white',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px'
            }}>
              ⚠️ {audioError}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        backgroundColor: '#374151',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px',
        height: '400px',
        overflowY: 'auto'
      }}>
        {messages.length === 0 ? (
          <div style={{textAlign: 'center', color: '#9ca3af', padding: '40px'}}>
            Nessun messaggio ancora. Scrivi qualcosa!
          </div>
        ) : (
          messages.map(message => (
            <div key={message.timestamp} style={{
              backgroundColor: '#4b5563',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '8px'
            }}>
              <div style={{fontSize: '14px', color: '#60a5fa', marginBottom: '4px'}}>
                <strong>{message.user || message.username}</strong>
                <span style={{color: '#9ca3af', marginLeft: '8px'}}>
                  {formatTime(message.timestamp)}
                </span>
              </div>
              <div>{message.text}</div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} style={{
        backgroundColor: '#374151',
        padding: '16px',
        borderRadius: '8px',
        display: 'flex',
        gap: '12px'
      }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Scrivi un messaggio..."
          style={{
            flex: 1,
            backgroundColor: '#4b5563',
            border: '1px solid #6b7280',
            borderRadius: '6px',
            padding: '12px',
            color: 'white',
            fontSize: '16px'
          }}
          disabled={connectionStatus !== 'connected' || !currentChannelId}
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || connectionStatus !== 'connected' || !currentChannelId}
          style={{
            backgroundColor: connectionStatus === 'connected' && currentChannelId ? '#2563eb' : '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '12px 24px',
            fontSize: '16px',
            cursor: connectionStatus === 'connected' && currentChannelId ? 'pointer' : 'not-allowed',
            fontWeight: 'bold'
          }}
        >
          Invia
        </button>
      </form>

      {/* Debug info */}
      <div style={{
        marginTop: '20px',
        fontSize: '12px',
        color: '#6b7280',
        textAlign: 'center'
      }}>
        Chat: {connectionStatus} | Socket: {socket?.id || 'N/A'} | Channel: {currentChannelId || 'NONE'}<br/>
        Audio: connected | Recording: {isRecording ? 'YES' : 'NO'} | Level: {(audioLevel * 100).toFixed(0)}%
      </div>
    </div>
  );
}

export default App;
