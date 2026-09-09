/**
 * Voice orchestrator — owns engine selection and lifecycle for the voice input
 * subsystem. Stage 2 introduces a multi-engine ladder:
 *
 *   1. AssemblyAI Voice Agent (primary, requires ASSEMBLYAI_API_KEY + network)
 *   2. On-device Vosk STT + server-side dispatch_tool (offline-capable)
 *   3. Web Speech API + server-side dispatch_tool (browser-native, requires net)
 *   4. Manual text input (last resort; UI button)
 *
 * The orchestrator does NOT own audio capture. Components continue to feed
 * PCM16 Int16 chunks via `sendAudio()` to whatever engine is active.
 *
 * Key invariants:
 *   - Health probe runs on connect; if the primary engine doesn't reach
 *     `ready` within HEALTH_PROBE_TIMEOUT_MS, the orchestrator falls back
 *     without surfacing the failure to the user.
 *   - Mid-session errors (socket close != 1000, token mint fail, transcript
 *     channel silent for STALE_TRANSCRIPT_MS) also trigger fallback, but the
 *     user is told once via a screen-reader announcement.
 *   - Fallback events are persisted to InteractionHistory.metadata for
 *     post-hoc analysis; we never silently degrade.
 *   - Manual override (`forceEngine('on-device')`) takes precedence and is
 *     remembered in the settings store.
 */

import type { VoiceAgentClient } from './voice-agent-client'

export type VoiceEngine =
  | 'assemblyai-agent'
  | 'on-device-vosk'
  | 'web-speech'
  | 'text-input'

export type EngineHealth = 'unknown' | 'healthy' | 'degraded' | 'unavailable'

export interface VoiceOrchestratorOptions {
  /** The pre-existing AssemblyAI client wrapper. May be null when the user
   *  manually selected a non-primary engine. */
  primaryClient: VoiceAgentClient | null
  /** Force a specific engine (settings-store override). */
  forceEngine?: VoiceEngine | null
  /** Called whenever the active engine changes. */
  onEngineChange?: (engine: VoiceEngine) => void
  /** Called whenever health status changes. */
  onHealthChange?: (health: EngineHealth, reason: string) => void
  /** Called when a transcript (final) lands from any engine. */
  onUserTranscript?: (text: string, engine: VoiceEngine, confidence: number) => void
  /** Called when an assistant reply arrives. */
  onAssistantReply?: (text: string, engine: VoiceEngine) => void
  /** Optional telemetry sink — receives fallback events. */
  onTelemetry?: (event: FallbackEvent) => void
}

export interface FallbackEvent {
  ts: number
  from: VoiceEngine
  to: VoiceEngine
  reason: string
  /** How long the failing engine was in `ready` before it broke. */
  uptimeMs: number | null
}

export const HEALTH_PROBE_TIMEOUT_MS = 4_000
export const STALE_TRANSCRIPT_MS = 12_000
export const MAX_FALLBACK_DEPTH = 2 // primary → vosk → web-speech

const ENGINE_PRIORITY: VoiceEngine[] = [
  'assemblyai-agent',
  'on-device-vosk',
  'web-speech',
  'text-input',
]

export class VoiceOrchestrator {
  private opts: VoiceOrchestratorOptions
  private currentEngine: VoiceEngine = 'text-input'
  private fallbackDepth = 0
  private health: EngineHealth = 'unknown'
  private connectedAt: number | null = null
  private lastTranscriptAt: number | null = null
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null
  private lastErrorReason: string | null = null
  private lastErrorAt: number = 0

  constructor(opts: VoiceOrchestratorOptions) {
    this.opts = opts
  }

  /**
   * (Re)bind lifecycle callbacks. Used by the React adapter so it can
   * construct the orchestrator once (lazy state init) and wire trampolines
   * that stay live across re-renders — without this hook the adapter would
   * have to rebuild the whole state machine on every callback change.
   */
  setCallbacks(callbacks: Partial<Pick<VoiceOrchestratorOptions,
    'onEngineChange' | 'onHealthChange' | 'onUserTranscript' | 'onAssistantReply' | 'onTelemetry'
  >>): void {
    this.opts = { ...this.opts, ...callbacks }
  }

  // ---------- Lifecycle ----------

  /** Choose the best engine given current prefs and availability. */
  async start(): Promise<VoiceEngine> {
    this.stopStaleCheck()
    const forced = this.opts.forceEngine
    if (forced) {
      return this.activate(forced, 'manual-override')
    }

    // Try primary first.
    const primaryHealth = await this.probePrimary()
    if (primaryHealth === 'healthy') {
      return this.activate('assemblyai-agent', 'probe-ok')
    }
    return this.fallbackFrom('assemblyai-agent', primaryHealth)
  }

  /** Stop the active engine. Idempotent. */
  async stop(): Promise<void> {
    this.stopStaleCheck()
    if (this.currentEngine === 'assemblyai-agent' && this.opts.primaryClient) {
      this.opts.primaryClient.end()
    }
    // Vosk and Web Speech tear-down happens in their own hooks — we just
    // clear our internal state here.
    this.currentEngine = 'text-input'
    this.health = 'unknown'
    this.connectedAt = null
  }

  /** Permanently dispose — releases all timers. Call from test teardown. */
  dispose(): void {
    this.stopStaleCheck()
  }

  /** Forward a PCM16 chunk from the mic worklet to the active engine. */
  sendAudio(pcm16: Int16Array): void {
    if (this.currentEngine === 'assemblyai-agent' && this.opts.primaryClient) {
      this.opts.primaryClient.sendAudio(pcm16)
    }
    // Vosk path is handled by the component because it needs Float32 + sample
    // rate context. The orchestrator surfaces engine selection only.
  }

  /** Final user transcript landed. Reset stale timer. */
  noteTranscript(text: string, confidence: number): void {
    this.lastTranscriptAt = Date.now()
    this.opts.onUserTranscript?.(text, this.currentEngine, confidence)
  }

  /** Assistant reply landed from any engine. */
  noteAssistantReply(text: string): void {
    this.opts.onAssistantReply?.(text, this.currentEngine)
  }

  // ---------- Public state ----------

  get engine(): VoiceEngine {
    return this.currentEngine
  }

  get engineHealth(): EngineHealth {
    return this.health
  }

  // ---------- Internal ----------

  private async probePrimary(): Promise<EngineHealth> {
    if (!this.opts.primaryClient) return 'unavailable'

    // Race the client reaching `ready` against the timeout. The existing
    // VoiceAgentClient.connect() returns void, so we wrap it with a timer.
    return new Promise<EngineHealth>((resolve) => {
      let resolved = false
      const timer = setTimeout(() => {
        if (resolved) return
        resolved = true
        resolve('unavailable')
      }, HEALTH_PROBE_TIMEOUT_MS)

      // Listen for one-shot `ready`.
      const origOnState = (this.opts.primaryClient as unknown as {
        opts?: { onState?: (s: string) => void }
      }).opts?.onState
      const wrapper = (state: string) => {
        if (resolved) return
        if (state === 'ready') {
          resolved = true
          clearTimeout(timer)
          resolve('healthy')
        } else if (state === 'error' || state === 'ended') {
          resolved = true
          clearTimeout(timer)
          resolve('unavailable')
        }
        origOnState?.(state)
      }
      // We intentionally mutate the opts.onState reference — the client
      // captures it in the constructor; this is safe because the orchestrator
      // is constructed after the client.
      ;(this.opts.primaryClient as unknown as {
        opts: { onState: (s: string) => void }
      }).opts.onState = wrapper

      const client = this.opts.primaryClient!
      void client.connect().catch(() => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        resolve('unavailable')
      })
    })
  }

  private async activate(
    engine: VoiceEngine,
    reason: string,
  ): Promise<VoiceEngine> {
    this.currentEngine = engine
    this.health = engine === 'text-input' ? 'unknown' : 'healthy'
    this.connectedAt = Date.now()
    this.startStaleCheck()
    this.opts.onEngineChange?.(engine)
    this.opts.onHealthChange?.(this.health, reason)
    return engine
  }

  /** Trigger a fallback ladder step. */
  private async fallbackFrom(
    failed: VoiceEngine,
    reason: string,
  ): Promise<VoiceEngine> {
    const idx = ENGINE_PRIORITY.indexOf(failed)
    const nextIdx = idx + 1
    const next = ENGINE_PRIORITY[nextIdx]

    if (!next || this.fallbackDepth >= MAX_FALLBACK_DEPTH) {
      // We've bottomed out. Surface text-input so the UI can show the
      // "type your command" affordance.
      const uptime = this.connectedAt ? Date.now() - this.connectedAt : null
      this.opts.onTelemetry?.({
        ts: Date.now(),
        from: failed,
        to: 'text-input',
        reason: `${reason}; ladder exhausted`,
        uptimeMs: uptime,
      })
      return this.activate('text-input', `${reason}; ladder exhausted`)
    }

    const uptime = this.connectedAt ? Date.now() - this.connectedAt : null
    this.opts.onTelemetry?.({
      ts: Date.now(),
      from: failed,
      to: next,
      reason,
      uptimeMs: uptime,
    })
    this.fallbackDepth++
    return this.activate(next, reason)
  }

  /** Manual override — settings-store calls this when user picks an engine. */
  async forceEngine(engine: VoiceEngine): Promise<void> {
    this.fallbackDepth = engine === 'assemblyai-agent' ? 0 : this.fallbackDepth
    await this.activate(engine, 'manual-override')
  }

  /** Called by hooks when their underlying engine errors mid-session. */
  async handleMidSessionError(reason: string): Promise<void> {
    // De-dupe rapid identical errors (avoid fallback thrash on flaky WS).
    const now = Date.now()
    if (
      this.lastErrorReason === reason &&
      now - this.lastErrorAt < 1_000
    ) {
      return
    }
    if (this.currentEngine === 'text-input') return // already at the bottom
    this.lastErrorReason = reason
    this.lastErrorAt = now
    this.health = 'degraded'
    this.opts.onHealthChange?.('degraded', reason)
    await this.fallbackFrom(this.currentEngine, reason)
    this.health = 'healthy'
  }

  // ---------- Staleness watchdog ----------

  private startStaleCheck(): void {
    this.stopStaleCheck()
    this.staleCheckTimer = setInterval(() => {
      if (
        this.lastTranscriptAt &&
        Date.now() - this.lastTranscriptAt > STALE_TRANSCRIPT_MS &&
        this.currentEngine !== 'text-input'
      ) {
        // No transcript for a while while we claimed to be listening —
        // likely the WS went silent. Don't fall back on the user mid-utterance
        // though; we only act if we're not in `listening` state, which the
        // component owns. Surface a degraded hint.
        this.health = 'degraded'
        this.opts.onHealthChange?.('degraded', 'stale-transcript')
      }
    }, STALE_TRANSCRIPT_MS / 2)
  }

  private stopStaleCheck(): void {
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer)
      this.staleCheckTimer = null
    }
  }
}

/** Default fallback ladder — exposed for the SettingsPanel dropdown. */
export const ENGINE_LADDER: ReadonlyArray<{
  id: VoiceEngine
  label: string
  description: string
}> = [
  {
    id: 'assemblyai-agent',
    label: 'AssemblyAI Voice Agent',
    description:
      'Full-duplex cloud agent (best quality, requires API key + network).',
  },
  {
    id: 'on-device-vosk',
    label: 'On-device (Vosk)',
    description:
      'Offline speech recognition in the browser. ~40MB model download on first use.',
  },
  {
    id: 'web-speech',
    label: 'Browser speech recognition',
    description:
      'Uses your browser built-in speech recognition (typically Google).',
  },
  {
    id: 'text-input',
    label: 'Text only',
    description: 'No microphone — type every command.',
  },
]
