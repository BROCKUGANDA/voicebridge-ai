'use client'

import { useCallback } from 'react'
import { soundEngine } from '@/lib/sound-engine'
import { useSettingsStore, type SoundTheme } from '@/stores/settings-store'
import { hapticFeedback } from '@/lib/accessibility-utils'

interface UseSoundFeedbackReturn {
  playSound: (type: string) => void
  playActionConfirmation: () => void
  playError: () => void
  playCompletion: () => void
  playAttention: () => void
  playNavigation: () => void
}

const THEME_SOUND_MAP: Record<SoundTheme, string[]> = {
  minimal: ['action-confirmation', 'error-notification', 'completion'],
  detailed: [
    'action-confirmation', 'error-notification', 'progress-indicator',
    'completion', 'attention-required', 'navigation', 'state-change',
  ],
  verbose: [
    'action-confirmation', 'error-notification', 'progress-indicator',
    'completion', 'attention-required', 'navigation', 'state-change',
    'mic-on', 'mic-off', 'message-received',
  ],
  off: [],
}

const VALID_SOUNDS = new Set([
  'action-confirmation', 'error-notification', 'progress-indicator',
  'completion', 'attention-required', 'navigation', 'state-change',
  'mic-on', 'mic-off', 'message-received',
])

export function useSoundFeedback(): UseSoundFeedbackReturn {
  const { soundTheme, soundVolume, hapticFeedback: hapticOn } = useSettingsStore()

  const playSound = useCallback(
    (type: string) => {
      if (soundTheme === 'off') return
      if (!VALID_SOUNDS.has(type)) return

      const allowedSounds = THEME_SOUND_MAP[soundTheme]
      if (!allowedSounds.includes(type)) return

      soundEngine.play(type as Parameters<typeof soundEngine.play>[0], soundVolume)

      // Haptic for certain sounds
      if (hapticOn) {
        switch (type) {
          case 'action-confirmation':
            hapticFeedback(30)
            break
          case 'error-notification':
            hapticFeedback([50, 30, 50, 30, 50])
            break
          case 'completion':
            hapticFeedback([30, 50, 30])
            break
          case 'attention-required':
            hapticFeedback([50, 100, 50])
            break
        }
      }
    },
    [soundTheme, soundVolume, hapticOn]
  )

  const playActionConfirmation = useCallback(() => playSound('action-confirmation'), [playSound])
  const playError = useCallback(() => playSound('error-notification'), [playSound])
  const playCompletion = useCallback(() => playSound('completion'), [playSound])
  const playAttention = useCallback(() => playSound('attention-required'), [playSound])
  const playNavigation = useCallback(() => playSound('navigation'), [playSound])

  return {
    playSound,
    playActionConfirmation,
    playError,
    playCompletion,
    playAttention,
    playNavigation,
  }
}
