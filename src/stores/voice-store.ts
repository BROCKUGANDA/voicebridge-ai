import { create } from 'zustand'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export interface VoiceMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  confidence?: number
  audioUrl?: string
  metadata?: Record<string, unknown>
}

export interface VoiceVisualData {
  description: string
  elements: Array<{
    type: string
    label: string
    description: string
    bounds: { x: number; y: number; width: number; height: number }
  }>
  screenshot?: string
  confidence: number
}

interface VoiceStore {
  // State
  voiceState: VoiceState
  isMuted: boolean
  currentTranscript: string
  messages: VoiceMessage[]
 visualData: VoiceVisualData | null
  isWebSocketConnected: boolean
  audioLevel: number
  currentResponse: string
  processingStartTime: number | null
  error: string | null
  isScreenSharing: boolean

  // Actions
  setVoiceState: (state: VoiceState) => void
  setMuted: (muted: boolean) => void
  setCurrentTranscript: (text: string) => void
  addMessage: (message: VoiceMessage) => void
  updateLastAssistantMessage: (content: string) => void
  setVisualData: (data: VoiceVisualData | null) => void
  setWebSocketConnected: (connected: boolean) => void
  setAudioLevel: (level: number) => void
  setCurrentResponse: (response: string) => void
  setProcessingStartTime: (time: number | null) => void
  setError: (error: string | null) => void
  setScreenSharing: (sharing: boolean) => void
  clearConversation: () => void
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  voiceState: 'idle',
  isMuted: false,
  currentTranscript: '',
  messages: [],
  visualData: null,
  // The old socket.io backend is gone; the AssemblyAI WS drives voice
  // state directly. Start honest (disconnected) — nothing flips this true
  // today, so the header icon shouldn't claim a live socket we don't have.
  isWebSocketConnected: false,
  audioLevel: 0,
  currentResponse: '',
  processingStartTime: null,
  error: null,
  isScreenSharing: false,

  setVoiceState: (voiceState) => set({ voiceState }),
  setMuted: (isMuted) => set({ isMuted }),
  setCurrentTranscript: (currentTranscript) => set({ currentTranscript }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  updateLastAssistantMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages]
      const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant')
      if (lastIdx >= 0) {
        msgs[lastIdx] = { ...msgs[lastIdx], content }
      }
      return { messages: msgs }
    }),
  setVisualData: (visualData) => set({ visualData }),
  setWebSocketConnected: (isWebSocketConnected) => set({ isWebSocketConnected }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setCurrentResponse: (currentResponse) => set({ currentResponse }),
  setProcessingStartTime: (processingStartTime) => set({ processingStartTime }),
  setError: (error) => set({ error }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  clearConversation: () =>
    set({
      messages: [],
      currentTranscript: '',
      currentResponse: '',
      visualData: null,
      error: null,
    }),
}))
