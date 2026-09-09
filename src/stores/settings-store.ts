import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ResponseVerbosity = 'concise' | 'balanced' | 'detailed'
export type SoundTheme = 'minimal' | 'detailed' | 'verbose' | 'off'
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge'
export type VoiceEnginePref = 'auto' | 'assemblyai-agent' | 'on-device-vosk' | 'web-speech' | 'text-input'

/** Debounced server push — keeps agent-driven prefs and UI prefs in sync. */
let prefsPushTimer: ReturnType<typeof setTimeout> | null = null
function schedulePrefsPush(prefs: Partial<UserPreferences>): void {
  if (prefsPushTimer) clearTimeout(prefsPushTimer)
  prefsPushTimer = setTimeout(() => {
    prefsPushTimer = null
    // Lazy import avoids a client/server cycle at module load.
    void import('@/lib/api-client')
      .then(({ apiFetch }) =>
        apiFetch('/api/preferences', { method: 'PUT', body: prefs }).catch(() => {}),
      )
      .catch(() => {})
  }, 800)
}

export interface UserPreferences {
  // Voice Settings
  voiceSpeed: number
  voicePitch: number
  voiceVolume: number
  selectedVoice: string
  responseVerbosity: ResponseVerbosity

  // Engine Selection (Stage 2)
  voiceEnginePref: VoiceEnginePref
  /** When true, automatically retry primary after a successful fallback. */
  autoRecoverPrimary: boolean

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
  voiceEnginePref: 'auto',
  autoRecoverPrimary: true,
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

      updatePreferences: (prefs) => {
        set((state) => ({ ...state, ...prefs }))
        // Fire-and-forget server sync so the agent sees UI changes and
        // multi-device sessions stay consistent. Skipped on the server.
        if (typeof window !== 'undefined') {
          schedulePrefsPush(prefs)
        }
      },

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
        voiceEnginePref: state.voiceEnginePref,
        autoRecoverPrimary: state.autoRecoverPrimary,
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
