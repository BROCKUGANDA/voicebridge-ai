'use client'

import { cn } from '@/lib/utils'
import { useVoiceStore, type VoiceState } from '@/stores/voice-store'
import { VoiceWaveform } from './VoiceWaveform'
import { Mic, MicOff, Loader2, AlertCircle } from 'lucide-react'
import { announceToScreenReader } from '@/lib/accessibility-utils'
import { useEffect } from 'react'

interface VoiceInputProps {
  onToggle: () => void
  isListening: boolean
  isSupported: boolean
  recognitionError: string | null
}

const STATE_CONFIG: Record<VoiceState, { label: string; ariaLabel: string; color: string }> = {
  idle: {
    label: 'Tap to speak',
    ariaLabel: 'Microphone inactive. Press Space or click to start listening.',
    color: 'border-white/10 hover:border-[#00F0FF]/50',
  },
  listening: {
    label: 'Listening...',
    ariaLabel: 'Microphone active. Listening for your voice command. Press Space to stop.',
    color: 'border-[#00F0FF] animate-vb-glow-pulse',
  },
  processing: {
    label: 'Processing...',
    ariaLabel: 'Processing your voice command. Please wait.',
    color: 'border-[#FFB627]',
  },
  speaking: {
    label: 'Speaking...',
    ariaLabel: 'VoiceBridge is speaking. Press Space to interrupt.',
    color: 'border-[#5CE0D8]',
  },
  error: {
    label: 'Error - Retry',
    ariaLabel: 'An error occurred. Click or press Space to retry.',
    color: 'border-[#FF6B6B] animate-vb-shake',
  },
}

export function VoiceInput({ onToggle, isListening, isSupported, recognitionError }: VoiceInputProps) {
  const voiceState = useVoiceStore((s) => s.voiceState)
  const error = useVoiceStore((s) => s.error)
  const transcript = useVoiceStore((s) => s.currentTranscript)

  const config = STATE_CONFIG[voiceState]

  // Announce state changes
  useEffect(() => {
    announceToScreenReader(config.ariaLabel)
  }, [voiceState])

  const handleClick = () => {
    if (voiceState === 'speaking') {
      window.speechSynthesis.cancel()
      useVoiceStore.getState().setVoiceState('idle')
      return
    }
    if (voiceState === 'error') {
      useVoiceStore.getState().setError(null)
    }
    onToggle()
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Live Transcript */}
      {transcript && voiceState === 'listening' && (
        <div className="animate-vb-fade-in text-center px-4 py-2 rounded-lg bg-white/5 border border-[#00F0FF]/20">
          <p className="text-sm text-[#8B98A8] mb-1">Hearing:</p>
          <p className="text-[#00F0FF] text-lg font-medium">{transcript}</p>
        </div>
      )}

      {/* Microphone Button */}
      <button
        onClick={handleClick}
        disabled={!isSupported}
        aria-label={config.ariaLabel}
        className={cn(
          'relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300',
          'bg-[#111827] border-2 focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-4',
          config.color,
          !isSupported && 'opacity-50 cursor-not-allowed',
          voiceState !== 'idle' && 'cursor-pointer'
        )}
      >
        {/* Pulse rings when listening */}
        {voiceState === 'listening' && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-[#00F0FF]/40 animate-vb-pulse-ring" />
            <span className="absolute inset-0 rounded-full border-2 border-[#00F0FF]/20 animate-vb-pulse-ring" style={{ animationDelay: '0.5s' }} />
          </>
        )}

        {/* Icon */}
        {voiceState === 'processing' ? (
          <Loader2 className="w-10 h-10 text-[#FFB627] animate-spin" />
        ) : voiceState === 'error' ? (
          <AlertCircle className="w-10 h-10 text-[#FF6B6B]" />
        ) : voiceState === 'listening' ? (
          <Mic className="w-10 h-10 text-[#00F0FF]" />
        ) : voiceState === 'speaking' ? (
          <MicOff className="w-10 h-10 text-[#5CE0D8]" />
        ) : (
          <Mic className="w-10 h-10 text-white/70 group-hover:text-white" />
        )}
      </button>

      {/* Status Label */}
      <p className="text-sm text-[#8B98A8]" aria-live="polite">
        {config.label}
      </p>

      {/* Error display */}
      {(error || recognitionError) && (
        <p className="text-sm text-[#FF6B6B] animate-vb-fade-in" role="alert">
          {error || recognitionError}
        </p>
      )}

      {/* Waveform when listening */}
      {voiceState === 'listening' && (
        <div className="w-full max-w-sm">
          <VoiceWaveform width={320} height={48} barCount={50} />
        </div>
      )}

      {/* Keyboard hint */}
      <p className="text-xs text-[#8B98A8]/60 sr-only">
        Press Space to toggle microphone
      </p>
    </div>
  )
}
