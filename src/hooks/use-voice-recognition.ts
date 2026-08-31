'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useVoiceStore } from '@/stores/voice-store'
import { useSettingsStore } from '@/stores/settings-store'
import { parseIntent, generateId } from '@/lib/voice-processor'
import { soundEngine } from '@/lib/sound-engine'
import { announceToScreenReader, hapticFeedback } from '@/lib/accessibility-utils'

interface UseVoiceRecognitionReturn {
  isListening: boolean
  transcript: string
  startListening: () => void
  stopListening: () => void
  toggleListening: () => void
  error: string | null
  isSupported: boolean
}

// Extend Window type for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

export function useVoiceRecognition(
  onResult?: (text: string, intent: ReturnType<typeof parseIntent>) => void
): UseVoiceRecognitionReturn {
  const [isSupported] = useState(() => {
    if (typeof window === 'undefined') return false
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  })
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)

  const { setVoiceState, setCurrentTranscript, addMessage, setAudioLevel, setError: setStoreError } = useVoiceStore()
  const { soundVolume, hapticFeedback: hapticOn, keyboardShortcuts } = useSettingsStore()

  const dataArrayRef = useRef<Uint8Array>(new Uint8Array(128))

  const startAudioMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount)

      const monitorLevel = () => {
        if (analyserRef.current) {
          const level = soundEngine.getAudioLevel(
            analyserRef.current,
            dataArrayRef.current
          )
          setAudioLevel(Math.min(1, level * 3))
        }
        animFrameRef.current = requestAnimationFrame(monitorLevel)
      }
      monitorLevel()
    } catch {
      // Audio monitoring not available, continue without it
    }
  }, [setAudioLevel])

  const stopAudioMonitoring = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setAudioLevel(0)
  }, [setAudioLevel])

  const processResult = useCallback(
    (text: string) => {
      if (!text.trim()) return

      const intent = parseIntent(text)

      addMessage({
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        confidence: intent.confidence,
      })

      if (onResult) {
        onResult(text, intent)
      }
    },
    [addMessage, onResult]
  )

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.')
      setStoreError('Speech recognition not supported')
      return
    }

    setError(null)
    setStoreError(null)

    const recognition = new (SpeechRecognitionAPI as new () => SpeechRecognition)()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setVoiceState('listening')
      setCurrentTranscript('')
      soundEngine.play('mic-on', soundVolume)
      announceToScreenReader('Microphone activated. Listening...', 'polite')
      if (hapticOn) hapticFeedback([30, 50, 30])
      startAudioMonitoring()
    }

    recognition.onresult = (event: Event) => {
      const speechEvent = event as unknown as SpeechRecognitionEvent
      let transcript = ''
      let isFinal = false

      for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i++) {
        const result = speechEvent.results[i]
        transcript += result[0].transcript
        if (result.isFinal) isFinal = true
      }

      setCurrentTranscript(transcript)

      if (isFinal) {
        processResult(transcript)
      }
    }

    recognition.onerror = (event) => {
      const errEvent = event as unknown as { error: string }
      if (errEvent.error !== 'aborted' && errEvent.error !== 'no-speech') {
        setError(`Speech recognition error: ${errEvent.error}`)
        setStoreError(errEvent.error)
        soundEngine.play('error-notification', soundVolume)
      }
      setVoiceState('idle')
      stopAudioMonitoring()
    }

    recognition.onend = () => {
      setVoiceState('idle')
      stopAudioMonitoring()
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [setVoiceState, setCurrentTranscript, setStoreError, soundVolume, hapticOn, startAudioMonitoring, stopAudioMonitoring, processResult])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    soundEngine.play('mic-off', soundVolume)
    announceToScreenReader('Microphone deactivated.', 'polite')
    if (hapticOn) hapticFeedback(20)
    stopAudioMonitoring()
  }, [soundVolume, hapticOn, stopAudioMonitoring])

  const toggleListening = useCallback(() => {
    const { voiceState } = useVoiceStore.getState()
    if (voiceState === 'listening') {
      stopListening()
    } else {
      startListening()
    }
  }, [startListening, stopListening])

  // Keyboard shortcut
  useEffect(() => {
    if (!keyboardShortcuts) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not in an input field
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        toggleListening()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyboardShortcuts, toggleListening])

  // Check support - handled in useState initializer above

  return {
    isListening: useVoiceStore((s) => s.voiceState === 'listening'),
    transcript: useVoiceStore((s) => s.currentTranscript),
    startListening,
    stopListening,
    toggleListening,
    error,
    isSupported,
  }
}