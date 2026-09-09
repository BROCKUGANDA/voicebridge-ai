'use client'

import { useCallback, useRef, useEffect } from 'react'
import { useVoiceStore } from '@/stores/voice-store'
import { useSettingsStore } from '@/stores/settings-store'
import { soundEngine } from '@/lib/sound-engine'
import { generateId } from '@/lib/voice-processor'
import { announceToScreenReader, hapticFeedback } from '@/lib/accessibility-utils'

interface UseSpeechSynthesisReturn {
  speak: (text: string) => void
  stop: () => void
  pause: () => void
  resume: () => void
  isSpeaking: boolean
  isPaused: boolean
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Selector subscriptions — full-store pulls re-render every consumer on
  // each message and feed the update-depth loop.
  const addMessage = useVoiceStore((s) => s.addMessage)
  const setVoiceState = useVoiceStore((s) => s.setVoiceState)
  const updateLastAssistantMessage = useVoiceStore((s) => s.updateLastAssistantMessage)
  const voiceSpeed = useSettingsStore((s) => s.voiceSpeed)
  const voicePitch = useSettingsStore((s) => s.voicePitch)
  const voiceVolume = useSettingsStore((s) => s.voiceVolume)
  const selectedVoice = useSettingsStore((s) => s.selectedVoice)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const hapticOn = useSettingsStore((s) => s.hapticFeedback)

  const applyPronunciationOverrides = useCallback(
    (text: string): string => {
      const { getPronunciation } = useSettingsStore.getState()
      return text
        .split(/\s+/)
        .map((word) => getPronunciation(word))
        .join(' ')
    },
    []
  )

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return

      // Mute guard
      if (useVoiceStore.getState().isMuted) return

      // Cancel any current speech
      window.speechSynthesis.cancel()

      const processedText = applyPronunciationOverrides(text)
      const utterance = new SpeechSynthesisUtterance(processedText)

      // Apply settings
      utterance.rate = voiceSpeed
      utterance.pitch = voicePitch
      utterance.volume = voiceVolume

      // Voice selection
      const voices = window.speechSynthesis.getVoices()
      if (selectedVoice !== 'default') {
        const match = voices.find((v) => v.name === selectedVoice)
        if (match) utterance.voice = match
      } else {
        // Prefer a clear English voice
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha'))
        )
        if (preferred) utterance.voice = preferred
      }

      // Add message to transcript
      const msgId = generateId()
      addMessage({
        id: msgId,
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
      })

      utterance.onstart = () => {
        setVoiceState('speaking')
        soundEngine.play('message-received', soundVolume)
        if (hapticOn) hapticFeedback(30)
      }

      utterance.onend = () => {
        setVoiceState('idle')
      }

      utterance.onerror = () => {
        setVoiceState('idle')
      }

      // Word boundary for real-time transcription display
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const spokenSoFar = processedText.substring(0, event.charIndex + event.charLength)
          updateLastAssistantMessage(spokenSoFar + '...')
        }
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)

      // Also announce to screen readers
      announceToScreenReader(text)
    },
    [voiceSpeed, voicePitch, voiceVolume, selectedVoice, soundVolume, hapticOn, addMessage, setVoiceState, updateLastAssistantMessage, applyPronunciationOverrides]
  )

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    setVoiceState('idle')
    soundEngine.play('mic-off', soundVolume)
  }, [setVoiceState, soundVolume])

  const pause = useCallback(() => {
    window.speechSynthesis.pause()
    setVoiceState('idle')
  }, [setVoiceState])

  const resume = useCallback(() => {
    window.speechSynthesis.resume()
    setVoiceState('speaking')
  }, [setVoiceState])

  // Ensure voices are loaded
  useEffect(() => {
    window.speechSynthesis.getVoices()
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices()
    }
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
    }
  }, [])

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking: useVoiceStore((s) => s.voiceState === 'speaking'),
    isPaused: false,
  }
}