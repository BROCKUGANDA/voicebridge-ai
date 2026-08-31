// Web Audio API Sound Design System for VoiceBridge AI
// Generates all UI sounds programmatically (no external audio files needed)

import { useVoiceStore } from '@/stores/voice-store'

type SoundType =
  | 'action-confirmation'
  | 'error-notification'
  | 'progress-indicator'
  | 'completion'
  | 'attention-required'
  | 'navigation'
  | 'state-change'
  | 'mic-on'
  | 'mic-off'
  | 'message-received'

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

function createGain(ctx: AudioContext, volume: number): GainNode {
  const gain = ctx.createGain()
  gain.gain.value = volume
  gain.connect(ctx.destination)
  return gain
}

function playTone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine'
): void {
  const ctx = getAudioContext()
  const osc = ctx.createOscillator()
  const gain = createGain(ctx, volume)

  osc.type = type
  osc.frequency.setValueAtTime(frequency, ctx.currentTime)

  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

  osc.connect(gain)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

function playChord(
  frequencies: number[],
  duration: number,
  volume: number
): void {
  frequencies.forEach((freq, i) => {
    setTimeout(() => playTone(freq, duration, volume * 0.6, 'sine'), i * 30)
  })
}

export const soundEngine = {
  play(soundType: SoundType, volume: number = 0.3): void {
    try {
      // Mute guard
      try {
        if (useVoiceStore.getState().isMuted) return
      } catch {
        // store not initialized yet, continue
      }

      const ctx = getAudioContext()
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      switch (soundType) {
        case 'action-confirmation':
          // Short, crisp click
          playTone(1200, 0.08, volume * 0.5, 'square')
          break

        case 'error-notification':
          // Low, distinctive but not jarring
          playTone(220, 0.15, volume, 'sawtooth')
          setTimeout(() => playTone(180, 0.2, volume * 0.8, 'sawtooth'), 100)
          break

        case 'progress-indicator':
          // Gentle pulsing tone
          playTone(660, 0.15, volume * 0.4, 'sine')
          break

        case 'completion':
          // Ascending chord - positive, pleasant
          playChord([523, 659, 784], 0.4, volume * 0.7)
          break

        case 'attention-required':
          // Double beep
          playTone(880, 0.1, volume * 0.6, 'sine')
          setTimeout(() => playTone(880, 0.1, volume * 0.6, 'sine'), 150)
          break

        case 'navigation':
          // Subtle whoosh-like sound
          playTone(440, 0.08, volume * 0.3, 'sine')
          setTimeout(() => playTone(660, 0.08, volume * 0.3, 'sine'), 50)
          break

        case 'state-change':
          // Gentle transition tone
          playTone(520, 0.2, volume * 0.4, 'triangle')
          break

        case 'mic-on':
          // Rising tone to indicate mic activation
          playTone(440, 0.1, volume * 0.5, 'sine')
          setTimeout(() => playTone(660, 0.1, volume * 0.5, 'sine'), 80)
          setTimeout(() => playTone(880, 0.15, volume * 0.5, 'sine'), 160)
          break

        case 'mic-off':
          // Falling tone to indicate mic deactivation
          playTone(880, 0.1, volume * 0.5, 'sine')
          setTimeout(() => playTone(660, 0.1, volume * 0.5, 'sine'), 80)
          setTimeout(() => playTone(440, 0.15, volume * 0.5, 'sine'), 160)
          break

        case 'message-received':
          // Soft notification
          playTone(740, 0.08, volume * 0.4, 'sine')
          setTimeout(() => playTone(880, 0.12, volume * 0.4, 'sine'), 60)
          break
      }
    } catch {
      // Audio not available, fail silently
    }
  },

  resumeContext(): void {
    try {
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') {
        ctx.resume()
      }
    } catch {
      // fail silently
    }
  },

  getAudioLevel(
    analyser: AnalyserNode,
    dataArray: Uint8Array
  ): number {
    analyser.getByteTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128
      sum += v * v
    }
    return Math.sqrt(sum / dataArray.length)
  },
}
