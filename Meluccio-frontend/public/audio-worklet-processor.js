// AudioStreamProcessor: riduce latenza con chunk costanti e downsampling lato worklet
class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const config = (options && options.processorOptions) || {};

    this.targetSampleRate = config.targetSampleRate || 16000;
    this.chunkMilliseconds = config.chunkMilliseconds || 60;
    this.energyThreshold = config.energyThreshold || 0.0015;
    this.sendSilence = config.sendSilence ?? false;

    this.inputSampleRate = sampleRate;
    this.inputSamplesPerChunk = Math.max(1, Math.round(this.inputSampleRate * (this.chunkMilliseconds / 1000)));
    this.pendingSamples = [];
  }

  downsample(input) {
    if (!input.length) {
      return [];
    }

    if (this.inputSampleRate === this.targetSampleRate) {
      return input.slice();
    }

    const sampleRateRatio = this.inputSampleRate / this.targetSampleRate;
    const outputLength = Math.max(1, Math.round(input.length / sampleRateRatio));
    const output = new Array(outputLength);

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < outputLength) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accumulator = 0;
      let count = 0;

      for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
        accumulator += input[i];
        count += 1;
      }

      const average = count > 0 ? accumulator / count : input[offsetBuffer] || 0;
      const clamped = Math.max(-1, Math.min(1, average));
      output[offsetResult] = clamped;

      offsetResult += 1;
      offsetBuffer = nextOffsetBuffer;
    }

    return output;
  }

  flushChunk(chunk) {
    if (!chunk.length) {
      return;
    }

    let sumSquares = 0;
    for (let i = 0; i < chunk.length; i++) {
      sumSquares += chunk[i] * chunk[i];
    }
    const rms = Math.sqrt(sumSquares / chunk.length);

    if (rms < this.energyThreshold && !this.sendSilence) {
      this.port.postMessage({ type: 'level', rms });
      return;
    }

    const downsampled = this.downsample(chunk);
    const int16Data = new Int16Array(downsampled.length);

    for (let i = 0; i < downsampled.length; i++) {
      const sample = downsampled[i];
      int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    this.port.postMessage({
      type: 'audioData',
      samples: Array.from(int16Data),
      sampleRate: this.targetSampleRate,
      rms,
      timestamp: currentTime
    });
  }

  process(inputs) {
    const input = inputs[0];
    const inputChannel = input && input[0];

    if (!inputChannel || !inputChannel.length) {
      return true;
    }

    for (let i = 0; i < inputChannel.length; i++) {
      this.pendingSamples.push(inputChannel[i]);
    }

    while (this.pendingSamples.length >= this.inputSamplesPerChunk) {
      const chunk = this.pendingSamples.splice(0, this.inputSamplesPerChunk);
      this.flushChunk(chunk);
    }

    return true;
  }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor);
