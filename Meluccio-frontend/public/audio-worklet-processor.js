// audio-worklet-processor.js - Modern audio processing
class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleCount = 0;
    this.lastSendTime = 0;
    this.sendInterval = 20; // Invia ogni 20ms per meno gap (era 50ms)
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (input.length > 0) {
      const inputChannel = input[0];
      const outputChannel = output[0];
      
      // Pass-through per monitoring
      if (outputChannel) {
        for (let i = 0; i < inputChannel.length; i++) {
          outputChannel[i] = inputChannel[i];
        }
      }
      
      // Accumula samples per invio batch
      this.sampleCount += inputChannel.length;
      const currentTime = currentFrame / sampleRate * 1000; // ms
      
      if (currentTime - this.lastSendTime >= this.sendInterval) {
        // Calcola RMS per detection attività
        let sumSquares = 0;
        for (let i = 0; i < inputChannel.length; i++) {
          sumSquares += inputChannel[i] * inputChannel[i];
        }
        const rms = Math.sqrt(sumSquares / inputChannel.length);
        
        // Invia solo se c'è attività audio significativa
        if (rms > 0.015) { // Soglia più bassa per catturare più audio
          // Converti a int16 per compressione
          const int16Data = new Int16Array(inputChannel.length);
          for (let i = 0; i < inputChannel.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputChannel[i]));
            int16Data[i] = Math.round(sample * 32767);
          }
          
          // Invia al main thread
          this.port.postMessage({
            type: 'audioData',
            data: Array.from(int16Data),
            rms: rms,
            sampleRate: sampleRate,
            timestamp: currentTime
          });
        }
        
        this.lastSendTime = currentTime;
      }
    }
    
    return true; // Continue processing
  }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor);
