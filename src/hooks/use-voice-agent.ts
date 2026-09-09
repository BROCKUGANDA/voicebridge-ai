'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVoiceStore, type VoiceState } from '@/stores/voice-store'
import { VoiceAgentClient, type AgentClientState, type AgentTranscriptChunk } from '@/lib/voice-agent-client'
import { useSettingsStore } from '@/stores/settings-store'
import { soundEngine } from '@/lib/sound-engine'
import { announceToScreenReader } from '@/lib/accessibility-utils'

/**
 * Voice Agent API hook used by VoiceAgentMic.
 *
 * Owns the WebSocket client + audio playback queue. Mic capture is the
 * component's responsibility — the component feeds PCM16 Int16 chunks in via
 * `sendAudio(pcm)`. This split keeps the hook free of AudioContext lifecycle
 * (which would otherwise fight the component's own worklet wiring).
 *
 * Lifecycle hooks:
 *  - `start()`: mint token, open WS, send session.update, wait for ready.
 *  - `stop()`: send session.end, close WS.
 *  - `sendAudio(pcm)`: forward Int16 chunks to the open WS.
 *  - `isReady`: true once the server has emitted session.ready.
 *  - `interrupt()`: force any in-progress agent reply to end + flush
 *    local playback queue.
 */
export interface UseVoiceAgentReturn {
  isReady: boolean
  isConnected: boolean
  error: string | null
  /** The underlying client — exposed so the orchestrator can probe/send. */
  client: import('@/lib/voice-agent-client').VoiceAgentClient | null
  start: () => Promise<void>
  stop: () => void
  sendAudio: (pcm: Int16Array) => void
  interrupt: () => void
}

export function useVoiceAgent(): UseVoiceAgentReturn {
  const [clientState, setClientState] = useState<AgentClientState>('idle')
  const [clientError, setClientError] = useState<string | null>(null)

  // Selector subscriptions — a full-store subscription made this hook
  // re-render (and recreate the agent object) on every message/transcript.
  const setVoiceState = useVoiceStore((s) => s.setVoiceState)
  const addMessage = useVoiceStore((s) => s.addMessage)
  const setAudioLevel = useVoiceStore((s) => s.setAudioLevel)
  const setCurrentTranscript = useVoiceStore((s) => s.setCurrentTranscript)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const playbackRef = usePlaybackQueue(24_000)

  const clientRef = useMemo(() => {
    return new VoiceAgentClient({
      onState: (state) => setClientState(state),
      onError: (msg) => setClientError(msg),
      onTranscript: (chunk: AgentTranscriptChunk) => {
        if (!chunk.text) return
        // Partials update the live transcript strip only — adding them as
        // messages floods the history with every VAD delta.
        if (!chunk.final) {
          if (chunk.role === 'user') {
            setCurrentTranscript(chunk.text)
          }
          return
        }
        addMessage({
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: chunk.role === 'agent' ? 'assistant' : 'user',
          content: chunk.text,
          timestamp: Date.now(),
          confidence: 1.0,
        })
        if (chunk.role === 'user') {
          setCurrentTranscript('')
        }
        if (chunk.role === 'agent') {
          ;(window as Window & { __vbLastReply?: string }).__vbLastReply =
            chunk.text
        }
      },
      onAudio: (pcm) => playbackRef.enqueue(pcm),
      onInterrupt: () => playbackRef.flush(),
    })
    // clientRef is constructed once; setCurrentTranscript is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCurrentTranscript])

  // Map AgentClientState → store VoiceState for the existing UI.
  useEffect(() => {
    const map: Record<AgentClientState, VoiceState> = {
      idle: 'idle',
      connecting: 'processing',
      ready: 'idle',
      listening: 'listening',
      speaking: 'speaking',
      processing: 'processing',
      ended: 'idle',
      error: 'error',
    }
    setVoiceState(map[clientState])
    // Honest header/status: only claim a live socket once the agent is up.
    useVoiceStore
      .getState()
      .setWebSocketConnected(
        clientState === 'ready' ||
          clientState === 'listening' ||
          clientState === 'speaking' ||
          clientState === 'processing',
      )
  }, [clientState, setVoiceState])

  const start = useCallback(async () => {
    setClientError(null)
    try {
      await clientRef.connect()
      soundEngine.play('mic-on', soundVolume)
      announceToScreenReader('VoiceBridge AI session started.', 'polite')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start voice agent.'
      setClientError(msg)
    }
  }, [clientRef, soundVolume])

  const stop = useCallback(() => {
    clientRef.end()
    playbackRef.flush()
    setAudioLevel(0)
    soundEngine.play('mic-off', soundVolume)
    announceToScreenReader('VoiceBridge AI session ended.', 'polite')
  }, [clientRef, playbackRef, setAudioLevel, soundVolume])

  const sendAudio = useCallback(
    (pcm: Int16Array) => clientRef.sendAudio(pcm),
    [clientRef],
  )

  const interrupt = useCallback(() => {
    clientRef.forceEndpoint()
    playbackRef.flush()
  }, [clientRef, playbackRef])

  // session.end on tab close — avoid the 3-hour cap if user backgrounds.
  useEffect(() => {
    const onPageHide = () => clientRef.end()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      clientRef.end()
    }
  }, [clientRef])

  return {
    isReady: clientState === 'ready',
    isConnected:
      clientState !== 'idle' &&
      clientState !== 'ended' &&
      clientState !== 'error',
    error: clientError,
    client: clientRef,
    start,
    stop,
    sendAudio,
    interrupt,
  }
}

// -----------------------------------------------------------------------
// Web Audio playback queue — keeps agent reply audio flowing at exactly the
// target sample rate without sleep-based scheduling (the gotcha explicitly
// called out in the Voice Agent API docs).
// -----------------------------------------------------------------------
interface PlaybackQueue {
  enqueue: (pcm: Int16Array) => void
  flush: () => void
}

function usePlaybackQueue(sampleRate: number): PlaybackQueue {
  const refsRef = useRef({
    ctx: null as AudioContext | null,
    nextStart: 0,
  });

  const ensureCtx = (): AudioContext => {
    if (!refsRef.current.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) throw new Error('Web Audio API not supported.')
      refsRef.current.ctx = new Ctor({ sampleRate })
    }
    return refsRef.current.ctx
  }

  const enqueue = (pcm: Int16Array) => {
    if (pcm.length === 0) return
    try {
      const ctx = ensureCtx()
      if (ctx.state === 'suspended') void ctx.resume()
      const buffer = ctx.createBuffer(1, pcm.length, sampleRate)
      const channel = buffer.getChannelData(0)
      for (let i = 0; i < pcm.length; i++) {
        channel[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff)
      }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(ctx.destination)
      const now = ctx.currentTime
      refsRef.current.nextStart =
        refsRef.current.nextStart < now ? now : refsRef.current.nextStart
      src.start(refsRef.current.nextStart)
      refsRef.current.nextStart += buffer.duration
    } catch (err) {
      console.warn('Playback queue error', err)
    }
  }

  const flush = () => {
    if (!refsRef.current.ctx) return
    refsRef.current.nextStart = refsRef.current.ctx.currentTime
    try {
      void refsRef.current.ctx.close()
    } catch {
      /* noop */
    }
    refsRef.current.ctx = null
  }

  return { enqueue, flush }
}