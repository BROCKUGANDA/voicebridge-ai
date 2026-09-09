/**
 * PCM capture worklet. Runs on the audio rendering thread, posts
 * Int16Array buffers to the main thread at ~24 kHz mono regardless of
 * the AudioContext's hardware rate (Chrome/Edge honor sampleRate=24000,
 * Safari ignores it and uses 44.1/48 kHz — we resample inside the worklet
 * for cross-browser determinism per the AssemblyAI browser-integration
 * guide).
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const inputRate = (options && options.processorOptions && options.processorOptions.inputSampleRate) || sampleRate
    const targetRate = (options && options.processorOptions && options.processorOptions.targetSampleRate) || 24000
    this.ratio = inputRate / targetRate
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input || input.length === 0) return true

    const outLength = Math.floor(input.length / this.ratio)
    if (outLength === 0) return true

    const pcm16 = new Int16Array(outLength)
    for (let i = 0; i < outLength; i++) {
      const sample = input[Math.floor(i * this.ratio)] || 0
      const clamped = Math.max(-1, Math.min(1, sample))
      pcm16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767)
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer])
    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)