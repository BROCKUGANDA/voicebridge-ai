'use client'

/**
 * useVoiceOrchestrator — React adapter around `VoiceOrchestrator` (the pure
 * state machine in `lib/voice-orchestrator.ts`).
 *
 * Responsibilities:
 *   - Construct the orchestrator exactly once per component lifetime.
 *   - Re-read the user's `voiceEnginePref` from the settings store so manual
 *     overrides take effect immediately.
 *   - Expose `start`, `stop`, `sendAudio`, plus the current `engine` and
 *     `health` so the UI can render them.
 *   - Surface fallback events through `onTelemetry` for analytics.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  VoiceOrchestrator,
  type VoiceEngine,
  type EngineHealth,
  type FallbackEvent,
} from '@/lib/voice-orchestrator'
import type { VoiceAgentClient } from '@/lib/voice-agent-client'
import { useSettingsStore } from '@/stores/settings-store'

export interface UseVoiceOrchestratorOptions {
  primaryClient: VoiceAgentClient | null
  onEngineChange?: (engine: VoiceEngine) => void
  onHealthChange?: (health: EngineHealth, reason: string) => void
  onUserTranscript?: (text: string, engine: VoiceEngine, confidence: number) => void
  onAssistantReply?: (text: string, engine: VoiceEngine) => void
  onTelemetry?: (event: FallbackEvent) => void
}

export interface UseVoiceOrchestratorReturn {
  engine: VoiceEngine
  health: EngineHealth
  start: () => Promise<VoiceEngine>
  stop: () => Promise<void>
  sendAudio: (pcm16: Int16Array) => void
  noteTranscript: (text: string, confidence: number) => void
  noteAssistantReply: (text: string) => void
  handleMidSessionError: (reason: string) => Promise<void>
  forceEngine: (engine: VoiceEngine) => Promise<void>
}

export function useVoiceOrchestrator(
  opts: UseVoiceOrchestratorOptions,
): UseVoiceOrchestratorReturn {
  // Pull the live pref each render so the orchestrator can react to manual
  // changes from the settings panel. The store is small; cheap to read.
  const voiceEnginePref = useSettingsStore((s) => s.voiceEnginePref)

  // engine/health live in React state so every consumer re-renders when the
  // orchestrator transitions (the old version returned frozen values from
  // an under-depended useMemo — the UI showed a stale engine forever).
  const [engine, setEngine] = useState<VoiceEngine>('text-input')
  const [health, setHealth] = useState<EngineHealth>('unknown')

  // Construct exactly once via lazy state init (safe under Strict Mode and
  // the React Compiler lint rules). Only static options are passed here —
  // live React state (engine/health) is bridged through stable trampoline
  // functions registered on the instance in the wiring effect below.
  const [orchestrator] = useState(() =>
    new VoiceOrchestrator({
      primaryClient: opts.primaryClient,
      forceEngine:
        voiceEnginePref === 'auto' ? null : (voiceEnginePref as VoiceEngine),
    }),
  )

  // Wire the state bridges + caller callbacks once. The trampolines read
  // refs at CALL time (not construction time), so caller re-binds and
  // setState both stay live without rebuilding the orchestrator.
  const bridge = useRef({
    setEngine,
    setHealth,
    emitEngine: opts.onEngineChange,
    emitHealth: opts.onHealthChange,
    emitTranscript: opts.onUserTranscript,
    emitReply: opts.onAssistantReply,
    emitTelemetry: opts.onTelemetry,
  })

  useEffect(() => {
    bridge.current = {
      setEngine,
      setHealth,
      emitEngine: opts.onEngineChange,
      emitHealth: opts.onHealthChange,
      emitTranscript: opts.onUserTranscript,
      emitReply: opts.onAssistantReply,
      emitTelemetry: opts.onTelemetry,
    }
  }, [
    opts.onEngineChange,
    opts.onHealthChange,
    opts.onUserTranscript,
    opts.onAssistantReply,
    opts.onTelemetry,
    // setters are stable; listed for completeness
    setEngine,
    setHealth,
  ])

  useEffect(() => {
    const trampolines = {
      onEngineChange: (e: VoiceEngine) => {
        bridge.current.setEngine(e)
        bridge.current.emitEngine?.(e)
      },
      onHealthChange: (h: EngineHealth, r: string) => {
        bridge.current.setHealth(h)
        bridge.current.emitHealth?.(h, r)
      },
      onUserTranscript: (t: string, e: VoiceEngine, c: number) =>
        bridge.current.emitTranscript?.(t, e, c),
      onAssistantReply: (t: string, e: VoiceEngine) =>
        bridge.current.emitReply?.(t, e),
      onTelemetry: (ev: FallbackEvent) => bridge.current.emitTelemetry?.(ev),
    }
    orchestrator.setCallbacks(trampolines)
  }, [orchestrator])

  // Keep `forceEngine` in sync if the user changes the pref mid-session.
  useEffect(() => {
    if (voiceEnginePref !== 'auto') {
      void orchestrator.forceEngine(voiceEnginePref as VoiceEngine)
    }
  }, [voiceEnginePref, orchestrator])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      void orchestrator.stop()
    }
  }, [orchestrator])

  const start = useCallback(() => orchestrator.start(), [orchestrator])
  const stop = useCallback(() => orchestrator.stop(), [orchestrator])
  const sendAudio = useCallback(
    (pcm16: Int16Array) => orchestrator.sendAudio(pcm16),
    [orchestrator],
  )
  const noteTranscript = useCallback(
    (text: string, confidence: number) =>
      orchestrator.noteTranscript(text, confidence),
    [orchestrator],
  )
  const noteAssistantReply = useCallback(
    (text: string) => orchestrator.noteAssistantReply(text),
    [orchestrator],
  )
  const handleMidSessionError = useCallback(
    (reason: string) => orchestrator.handleMidSessionError(reason),
    [orchestrator],
  )
  const forceEngine = useCallback(
    (engine: VoiceEngine) => orchestrator.forceEngine(engine),
    [orchestrator],
  )

  return {
    engine,
    health,
    start,
    stop,
    sendAudio,
    noteTranscript,
    noteAssistantReply,
    handleMidSessionError,
    forceEngine,
  }
}
