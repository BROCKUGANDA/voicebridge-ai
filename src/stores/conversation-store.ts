import { create } from 'zustand'

export interface SessionMetrics {
  taskCompletionRate: number
  avgCommandsPerTask: number
  errorRate: number
  userSatisfaction: number
  independenceScore: number
  cognitiveLoadScore: number
  totalCommands: number
  totalErrors: number
  totalSuccesses: number
  sessionDuration: number
}

interface ConversationStore {
  // Current session
  sessionId: string | null
  sessionStartTime: number | null
  metrics: SessionMetrics

  // History
  recentCommands: string[]
  contextMemory: string[]

  // Actions
  startSession: (id: string) => void
  endSession: () => void
  recordCommand: (command: string, success: boolean) => void
  updateMetrics: (metrics: Partial<SessionMetrics>) => void
  addToContext: (context: string) => void
  clearContext: () => void
  resetMetrics: () => void
}

const defaultMetrics: SessionMetrics = {
  taskCompletionRate: 0,
  avgCommandsPerTask: 0,
  errorRate: 0,
  userSatisfaction: 0,
  independenceScore: 0,
  cognitiveLoadScore: 0,
  totalCommands: 0,
  totalErrors: 0,
  totalSuccesses: 0,
  sessionDuration: 0,
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  sessionId: null,
  sessionStartTime: null,
  metrics: { ...defaultMetrics },
  recentCommands: [],
  contextMemory: [],

  startSession: (id) =>
    set({
      sessionId: id,
      sessionStartTime: Date.now(),
      metrics: { ...defaultMetrics },
      recentCommands: [],
      contextMemory: [],
    }),

  endSession: () =>
    set({
      sessionId: null,
      sessionStartTime: null,
    }),

  recordCommand: (command, success) =>
    set((state) => {
      const totalCommands = state.metrics.totalCommands + 1
      const totalSuccesses = success ? state.metrics.totalSuccesses + 1 : state.metrics.totalSuccesses
      const totalErrors = success ? state.metrics.totalErrors : state.metrics.totalErrors + 1
      const errorRate = totalCommands > 0 ? (totalErrors / totalCommands) * 100 : 0
      const taskCompletionRate = totalCommands > 0 ? (totalSuccesses / totalCommands) * 100 : 0

      return {
        metrics: {
          ...state.metrics,
          totalCommands,
          totalSuccesses,
          totalErrors,
          errorRate: Math.round(errorRate * 10) / 10,
          taskCompletionRate: Math.round(taskCompletionRate * 10) / 10,
          avgCommandsPerTask:
            totalSuccesses > 0
              ? Math.round((totalCommands / totalSuccesses) * 10) / 10
              : 0,
          sessionDuration: state.sessionStartTime
            ? Math.round((Date.now() - state.sessionStartTime) / 1000)
            : 0,
        },
        recentCommands: [command, ...state.recentCommands].slice(0, 50),
      }
    }),

  updateMetrics: (metrics) =>
    set((state) => ({
      metrics: { ...state.metrics, ...metrics },
    })),

  addToContext: (context) =>
    set((state) => ({
      contextMemory: [...state.contextMemory, context].slice(-20),
    })),

  clearContext: () => set({ contextMemory: [] }),

  resetMetrics: () => set({ metrics: { ...defaultMetrics } }),
}))
