import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ResponseVerbosity = 'concise' | 'balanced' | 'detailed'
export type SoundTheme = 'minimal' | 'detailed' | 'verbose' | 'off'
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge'

export interface UserPreferences {
  // Voice Settings
  voiceSpeed: number
  voicePitch: number
  voiceVolume: number
  selectedVoice: string
  responseVerbosity: ResponseVerbosity

  // Sound Design
  soundTheme: SoundTheme
  soundVolume: number
  hapticFeedback: boolean

  // Accessibility
  autoDescribe: boolean
  fontSize: FontSize
  highContrast: boolean
  reducedMotion: boolean
  keyboardShortcuts: boolean
  spatialAudio: boolean

  // Advanced
  pronunciationOverrides: Record<string, string>
  customCommands: Record<string, string>
}

interface SettingsStore extends UserPreferences {
  isSettingsOpen: boolean
  activeSettingsTab: string

  setSettingsOpen: (open: boolean) => void
  setActiveSettingsTab: (tab: string) => void
  updatePreferences: (prefs: Partial<UserPreferences>) => void
  resetPreferences: () => void
  getPronunciation: (word: string) => string
  getCustomCommand: (phrase: string) => string | undefined
}

const defaultPreferences: UserPreferences = {
  voiceSpeed: 1.0,
  voicePitch: 1.0,
  voiceVolume: 0.8,
  selectedVoice: 'default',
  responseVerbosity: 'balanced',
  soundTheme: 'minimal',
  soundVolume: 0.5,
  hapticFeedback: true,
  autoDescribe: true,
  fontSize: 'medium',
  highContrast: true,
  reducedMotion: false,
  keyboardShortcuts: true,
  spatialAudio: false,
  pronunciationOverrides: {},
  customCommands: {},
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultPreferences,
      isSettingsOpen: false,
      activeSettingsTab: 'voice',

      setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      setActiveSettingsTab: (activeSettingsTab) => set({ activeSettingsTab }),

      updatePreferences: (prefs) => set((state) => ({ ...state, ...prefs })),

      resetPreferences: () => set({ ...defaultPreferences }),

      getPronunciation: (word) => {
        const overrides = get().pronunciationOverrides
        return overrides[word.toLowerCase()] || word
      },

      getCustomCommand: (phrase) => {
        const commands = get().customCommands
        return commands[phrase.toLowerCase()]
      },
    }),
    {
      name: 'voicebridge-settings',
      partialize: (state) => ({
        voiceSpeed: state.voiceSpeed,
        voicePitch: state.voicePitch,
        voiceVolume: state.voiceVolume,
        selectedVoice: state.selectedVoice,
        responseVerbosity: state.responseVerbosity,
        soundTheme: state.soundTheme,
        soundVolume: state.soundVolume,
        hapticFeedback: state.hapticFeedback,
        autoDescribe: state.autoDescribe,
        fontSize: state.fontSize,
        highContrast: state.highContrast,
        reducedMotion: state.reducedMotion,
        keyboardShortcuts: state.keyboardShortcuts,
        spatialAudio: state.spatialAudio,
        pronunciationOverrides: state.pronunciationOverrides,
        customCommands: state.customCommands,
      }),
    }
  )
)
