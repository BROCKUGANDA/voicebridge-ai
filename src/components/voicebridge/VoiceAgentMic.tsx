'use client'

/**
 * VoiceAgentMic — mic capture UI for the orchestrated VoiceBridge pipeline.
 *
 * Stage 2: drives `useVoiceOrchestrator`, which selects between:
 *   - AssemblyAI Voice Agent (cloud, primary) — `useVoiceAgent`
 *   - Vosk WASM recognizer (on-device, fallback) — `useOnDeviceSTT`
 *   - Browser Web Speech API (fallback #2) — `useWebSpeech`
 *
 * Engines 2 and 3 share the same downstream path: their final transcripts
 * are POSTed to /api/stt/fallback, which performs intent parsing +
 * dispatch_tool server-side. TTS for both fallback paths uses
 * useSpeechSynthesis.
 *
 * Engine 1 (AssemblyAI) is full-duplex: PCM16 Int16 chunks are streamed
 * to a single WebSocket and the agent returns both transcripts and
 * audio replies in the same channel.
 *
 * AudioContext at 24 kHz — Chrome/Edge honor it, Safari ignores (the
 * pcm-processor.js worklet resamples to 24 kHz regardless).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useVoiceStore } from '@/stores/voice-store'
import { useVoiceAgent } from '@/hooks/use-voice-agent'
import { useOnDeviceSTT } from '@/hooks/use-on-device-stt'
import { useWebSpeech } from '@/hooks/use-web-speech'
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis'
import { useVoiceOrchestrator } from '@/hooks/use-voice-orchestrator'
import { apiFetch } from '@/lib/api-client'
import { executeClientAction } from '@/lib/client-actions'
import { TextInputFallback } from './TextInputFallback'
import { Mic, MicOff, Loader2, AlertCircle, Power, PowerOff } from 'lucide-react'

const STATE_CONFIG = {
  idle: {
    label: 'Tap to start the voice agent',
    ariaLabel: 'Voice agent idle. Press the button to begin a conversation.',
    color: 'border-white/10 hover:border-[#00F0FF]/50',
  },
  listening: {
    label: 'Listening to you...',
    ariaLabel: 'Voice agent is listening. Speak naturally.',
    color: 'border-[#00F0FF] animate-vb-glow-pulse',
  },
  processing: {
    label: 'Processing...',
    ariaLabel: 'Voice agent is processing your request.',
    color: 'border-[#FFB627]',
  },
  speaking: {
    label: 'VoiceBridge is speaking...',
    ariaLabel: 'Voice agent is speaking. Speak to interrupt.',
    color: 'border-[#5CE0D8]',
  },
  error: {
    label: 'Error - tap to retry',
    ariaLabel: 'Voice agent error. Tap to retry.',
    color: 'border-[#FF6B6B] animate-vb-shake',
  },
} as const

export function VoiceAgentMic() {
  const voiceState = useVoiceStore((s) => s.voiceState)
  const error = useVoiceStore((s) => s.error)
  const transcript = useVoiceStore((s) => s.currentTranscript)
  const setAudioLevel = useVoiceStore((s) => s.setAudioLevel)
  const addMessage = useVoiceStore((s) => s.addMessage)
  const setError = useVoiceStore((s) => s.setError)
  const setVoiceState = useVoiceStore((s) => s.setVoiceState)
  const setCurrentTranscript = useVoiceStore((s) => s.setCurrentTranscript)
  const config = STATE_CONFIG[voiceState]

  // Cloud agent (primary engine).
  const agent = useVoiceAgent()
  const { speak } = useSpeechSynthesis()

  // Refs to bridge handler changes to the fallback STT hooks without
  // rebuilding their recognizers.
  const fallbackHandlersRef = useRef<{
    onResult: ((text: string, confidence: number) => void) | null
    onPartial: ((text: string) => void) | null
  }>({ onResult: null, onPartial: null })

  // On-device STT (fallback engine).
  const onDevice = useOnDeviceSTT({
    sampleRate: 16000,
    onResult: (text, confidence) =>
      fallbackHandlersRef.current.onResult?.(text, confidence),
    onPartial: (text) => fallbackHandlersRef.current.onPartial?.(text),
    onError: (m) => {
      setError(`On-device STT: ${m}`)
      setVoiceState('error')
    },
  })

  // Web Speech API (fallback engine #2). Owns its own mic capture, so we
  // DON'T run startMicCapture() while this engine is active — the
  // engine-routing effect calls webSpeech.start() directly.
  const webSpeech = useWebSpeech({
    onResult: (text, confidence) =>
      fallbackHandlersRef.current.onResult?.(text, confidence),
    onPartial: (text) => fallbackHandlersRef.current.onPartial?.(text),
    onError: (m) => {
      setError(`Browser speech: ${m}`)
      setVoiceState('error')
    },
  })

  // Orchestrator — single source of truth for which engine is active.
  const orchestrator = useVoiceOrchestrator({
    primaryClient: agent.client,
    onTelemetry: (ev) => {
      // Telemetry is best-effort; the session cookie carries our identity.
      void apiFetch('/api/voice', {
        method: 'POST',
        body: {
          command: `[engine-fallback] ${ev.from} → ${ev.to}`,
          response: ev.reason,
          success: true,
          metadata: {
            kind: 'engine-fallback',
            from: ev.from,
            to: ev.to,
            reason: ev.reason,
            uptimeMs: ev.uptimeMs,
            ts: ev.ts,
          },
        },
      }).catch(() => {})
    },
  })

  // Local UI state.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(new ArrayBuffer(128)))
  const currentSampleRateRef = useRef<number>(24000)
  // "Mic capture running" is control flow for the routing effect, not
  // render state — a ref avoids setState-in-effect cascades and can't lie
  // about hardware state between renders.
  const micActiveRef = useRef(false)
  const [agentActive, setAgentActive] = useState(false)

  // Stable handler that both fallback engines route through. Local client
  // actions run first (panel nav, describe, read) so the product stays
  // useful offline; unhandled intents go to /api/stt/fallback.
  const handleFallbackResult = useCallback(
    async (
      text: string,
      confidence: number,
      engine: 'on-device-vosk' | 'web-speech' | 'text-input',
    ) => {
      orchestrator.noteTranscript(text, confidence)
      setCurrentTranscript(text)
      setVoiceState('processing')
      addMessage({
        id: `usr-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        confidence,
        metadata: { engine },
      })

      // 1. Local dashboard actions — no network, instant feedback.
      const local = executeClientAction(text, {
        setActivePanel: (panel) => {
          window.dispatchEvent(new CustomEvent('vb:navigate', { detail: panel }))
        },
        openSettings: () => {
          window.dispatchEvent(new CustomEvent('vb:navigate', { detail: 'settings' }))
        },
        speak,
        stopSpeaking: () => {
          window.speechSynthesis?.cancel()
        },
      })
      if (local.handled) {
        addMessage({
          id: `loc-${Date.now()}`,
          role: 'assistant',
          content: local.reply,
          timestamp: Date.now(),
          metadata: { engine: 'client-action', intent: local.intent },
        })
        orchestrator.noteAssistantReply(local.reply)
        setVoiceState('idle')
        return
      }

      // 2. Server-side intent parse + dispatcher (preferences, history).
      try {
        const res = await apiFetch('/api/stt/fallback', {
          method: 'POST',
          body: { transcript: text, engine, confidence },
        })
        const payload = (await res.json()) as { response?: string; error?: string }
        const reply = payload.response ?? "I couldn't process that."
        // speak() already appends the assistant message — don't double-log.
        orchestrator.noteAssistantReply(reply)
        speak(reply)
        setVoiceState('idle')
      } catch (err) {
        const m = err instanceof Error ? err.message : 'fallback failed'
        setError(`Fallback: ${m}`)
        setVoiceState('error')
      }
    },
    [orchestrator, speak, addMessage, setCurrentTranscript, setVoiceState, setError],
  )

  const handleFallbackPartial = useCallback(
    (text: string) => {
      setCurrentTranscript(text)
    },
    [setCurrentTranscript],
  )

  // Wire the latest handlers into the ref so the hooks can call them.
  // Runs in an effect (NOT during render) — mutating refs during render is
  // unsafe under concurrent rendering.
  useEffect(() => {
    fallbackHandlersRef.current.onResult = (text, confidence) => {
      void handleFallbackResult(
        text,
        confidence,
        orchestrator.engine === 'web-speech' ? 'web-speech' : 'on-device-vosk',
      )
    }
    fallbackHandlersRef.current.onPartial = handleFallbackPartial
  }, [handleFallbackResult, handleFallbackPartial, orchestrator.engine])

  // Stable engine mirror: the worklet onmessage closure must read the
  // CURRENT engine, but it's created once inside startMicCapture. A ref
  // (updated in an effect, never during render) bridges the two.
  const engineRef = useRef(orchestrator.engine)
  useEffect(() => {
    engineRef.current = orchestrator.engine
  }, [orchestrator.engine])
  // Whether the web-speech recognizer is currently running — guards the
  // routing effect against restart loops (start() aborts + recreates the
  // recognizer, so calling it per-render would never finish a utterance).
  const wsActiveRef = useRef(false)

  const stopMicCapture = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (workletRef.current) workletRef.current.disconnect()
    if (sourceRef.current) sourceRef.current.disconnect()
    if (analyserRef.current) analyserRef.current.disconnect()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    micActiveRef.current = false
    setAudioLevel(0)
  }, [setAudioLevel])

  // Stable engine mirror + capture deps: startMicCapture closed over the
  // whole agent/onDevice objects (new identity every render), which re-ran
  // the routing effect on every store tick. Read only the stable methods.
  const agentSendAudio = agent.sendAudio
  const agentIsReady = agent.isReady
  const onDeviceAccept = onDevice.acceptPcm16
  const onDeviceIsReady = onDevice.isReady
  const setAudioLevelStable = setAudioLevel
  const startMicCapture = useCallback(async () => {
    const audioCtx = new AudioContext({ sampleRate: 24000 })
    audioCtxRef.current = audioCtx
    currentSampleRateRef.current = audioCtx.sampleRate

    await audioCtx.audioWorklet.addModule('/pcm-processor.js')

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
      },
    })
    streamRef.current = stream

    const source = audioCtx.createMediaStreamSource(stream)
    sourceRef.current = source

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    dataArrayRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    analyserRef.current = analyser

    const worklet = new AudioWorkletNode(audioCtx, 'pcm-processor', {
      processorOptions: {
        inputSampleRate: audioCtx.sampleRate,
        targetSampleRate: 24000,
      },
    })
    workletRef.current = worklet

    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const pcm16 = new Int16Array(e.data)
      if (pcm16.length === 0) return

      const engine = engineRef.current
      if (engine === 'assemblyai-agent') {
        agentSendAudio(pcm16)
      } else if (engine === 'on-device-vosk') {
        onDeviceAccept(pcm16, currentSampleRateRef.current)
      }
      // web-speech manages its own mic — never reach here.
    }

    source.connect(analyser)
    source.connect(worklet)
    micActiveRef.current = true

    const tick = () => {
      if (!analyserRef.current) return
      analyserRef.current.getByteFrequencyData(dataArrayRef.current)
      let sum = 0
      for (let i = 0; i < dataArrayRef.current.length; i++) sum += dataArrayRef.current[i]
      const avg = sum / dataArrayRef.current.length / 255
      setAudioLevelStable(Math.min(1, avg * 3))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [agentSendAudio, onDeviceAccept, setAudioLevelStable])

  // Wire mic / web-speech start based on active engine.
  useEffect(() => {
    let cancelled = false

    if (!agentActive) {
      stopMicCapture()
      if (wsActiveRef.current) {
        wsActiveRef.current = false
        webSpeech.stop()
      }
      return
    }

    // Engine #1 (AssemblyAI) and #2 (Vosk): use our manual mic + worklet.
    if (
      orchestrator.engine === 'assemblyai-agent' ||
      orchestrator.engine === 'on-device-vosk'
    ) {
      const ready =
        (orchestrator.engine === 'assemblyai-agent' && agentIsReady) ||
        (orchestrator.engine === 'on-device-vosk' && onDeviceIsReady)
      if (ready && !micActiveRef.current) {
        startMicCapture().catch((err) => {
          if (!cancelled) {
            setError(`Mic failed: ${String(err)}`)
            setVoiceState('error')
          }
        })
      }
      if (micActiveRef.current && !ready) {
        stopMicCapture()
      }
      return () => {
        cancelled = true
      }
    }

    // Engine #3 (web-speech): browser owns mic, just call start() — once.
    if (orchestrator.engine === 'web-speech') {
      if (webSpeech.isSupported) {
        if (!wsActiveRef.current) {
          wsActiveRef.current = true
          webSpeech.start()
        }
      } else {
        // No web-speech support — orchestrator should fall through to
        // text-input via the health probe, but if user forced it, surface.
        setError('Browser speech recognition is not supported here.')
        setVoiceState('error')
      }
      return () => {
        cancelled = true
      }
    }

    // Engine #4 (text-input) needs no audio plumbing. Stop any running
    // web-speech recognizer when we fall through to it.
    if (wsActiveRef.current) {
      wsActiveRef.current = false
      webSpeech.stop()
    }
    return () => {
      cancelled = true
    }
  }, [
    agentActive,
    agentIsReady,
    onDeviceIsReady,
    webSpeech.isSupported,
    orchestrator.engine,
    startMicCapture,
    stopMicCapture,
    webSpeech.stop,
    setError,
    setVoiceState,
  ])

  // Cleanup on unmount ONLY. The hook objects (agent/onDevice/webSpeech/
  // orchestrator) are re-created per render; depending on them re-ran this
  // effect every render and tore down a live mic session mid-utterance.
  // Refs are synced in an effect below (never during render) so the
  // unmount cleanup and handlePower always act on the latest instances.
  const agentRef = useRef(agent)
  const onDeviceRef = useRef(onDevice)
  const webSpeechRef = useRef(webSpeech)
  const orchestratorRef = useRef(orchestrator)

  useEffect(() => {
    agentRef.current = agent
    onDeviceRef.current = onDevice
    webSpeechRef.current = webSpeech
    orchestratorRef.current = orchestrator
  }, [agent, onDevice, webSpeech, orchestrator])

  useEffect(() => {
    return () => {
      stopMicCapture()
      void agentRef.current.stop()
      void onDeviceRef.current.dispose()
      webSpeechRef.current.stop()
      void orchestratorRef.current.stop()
    }
  }, [stopMicCapture])

  const handlePower = useCallback(async () => {
    const ws = webSpeechRef.current
    const orch = orchestratorRef.current
    if (agentActive) {
      setAgentActive(false)
      stopMicCapture()
      if (wsActiveRef.current) {
        wsActiveRef.current = false
        ws.stop()
      }
      await orch.stop()
    } else {
      setAgentActive(true)
      const engine = await orch.start()
      if (engine === 'assemblyai-agent') {
        await agentRef.current.start()
      }
      // Vosk + web-speech are lazily started in the engine-routing effect.
    }
  }, [agentActive, stopMicCapture])

  // Space / keyboard shortcut — page dispatches vb:toggle-power.
  useEffect(() => {
    const onToggle = () => { void handlePower() }
    window.addEventListener('vb:toggle-power', onToggle)
    return () => window.removeEventListener('vb:toggle-power', onToggle)
  }, [handlePower])

  /** Middle mic button: interrupt while speaking, otherwise no-op (power owns start/stop). */
  const handleMicClick = useCallback(() => {
    if (!agentActive) return
    if (voiceState === 'speaking') {
      window.speechSynthesis?.cancel()
      agentRef.current.interrupt()
      setVoiceState('listening')
    }
  }, [agentActive, voiceState, setVoiceState])

  /** Text-input / manual typed command — always available under the mic. */
  const handleTypedCommand = useCallback(
    async (text: string) => {
      await handleFallbackResult(text, 1.0, 'text-input')
    },
    [handleFallbackResult],
  )

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {agentActive && (
        <div
          className={cn(
            'flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border',
            orchestrator.health === 'healthy'
              ? 'bg-[#51CF66]/10 border-[#51CF66]/30 text-[#51CF66]'
              : orchestrator.health === 'degraded'
                ? 'bg-[#FFB627]/10 border-[#FFB627]/30 text-[#FFB627]'
                : orchestrator.health === 'unavailable'
                  ? 'bg-[#FF6B6B]/10 border-[#FF6B6B]/30 text-[#FF6B6B]'
                  : 'bg-white/5 border-white/10 text-[#8B98A8]',
          )}
          aria-live="polite"
          data-testid="engine-status"
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              orchestrator.health === 'healthy'
                ? 'bg-[#51CF66]'
                : orchestrator.health === 'degraded'
                  ? 'bg-[#FFB627] animate-pulse'
                  : orchestrator.health === 'unavailable'
                    ? 'bg-[#FF6B6B]'
                    : 'bg-[#8B98A8]',
            )}
            aria-hidden="true"
          />
          {orchestrator.engine === 'on-device-vosk' && onDevice.isLoading
            ? `Loading on-device model… ${Math.round(onDevice.loadProgress * 100)}%`
            : `${engineLabel(orchestrator.engine)} · ${orchestrator.health}`}
          {agent.isReady && (
            <span className="text-[#8B98A8]/70 hidden sm:inline">
              session live
            </span>
          )}
        </div>
      )}

      {transcript && voiceState === 'listening' && (
        <div className="animate-vb-fade-in text-center px-4 py-2 rounded-full bg-white/5 border border-[#00F0FF]/20">
          <p className="text-sm text-[#00F0FF]">{transcript}</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handlePower}
          aria-label={agentActive ? 'Stop voice agent' : 'Start voice agent'}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-all border',
            'bg-[#111827] focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-4',
            agentActive
              ? 'border-[#00F0FF]/60 text-[#00F0FF]'
              : 'border-white/10 text-white/70 hover:border-white/30',
          )}
          title={agentActive ? 'Stop' : 'Start'}
        >
          {agentActive ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
        </button>

        <button
          aria-label={
            agentActive && voiceState === 'speaking'
              ? 'Interrupt the assistant'
              : config.ariaLabel
          }
          onClick={handleMicClick}
          disabled={!agentActive}
          className={cn(
            'relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300',
            'bg-[#111827] border-2 focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-4',
            config.color,
            !agentActive && 'opacity-40 cursor-not-allowed',
            agentActive && voiceState === 'speaking' && 'cursor-pointer hover:border-[#FF8A80]/60',
          )}
          title={
            agentActive && voiceState === 'speaking'
              ? 'Interrupt'
              : config.label
          }
        >
          {voiceState === 'processing' ? (
            <Loader2 className="w-10 h-10 text-[#FFB627] animate-spin" />
          ) : voiceState === 'error' ? (
            <AlertCircle className="w-10 h-10 text-[#FF6B6B]" />
          ) : voiceState === 'speaking' ? (
            <MicOff className="w-10 h-10 text-[#5CE0D8]" />
          ) : (
            <Mic
              className={cn(
                'w-10 h-10',
                voiceState === 'listening' ? 'text-[#00F0FF]' : 'text-white/70',
              )}
            />
          )}
        </button>
      </div>

      <p className="text-sm text-[#8B98A8]" aria-live="polite">
        {agentActive ? config.label : 'Tap power to start'}
      </p>

      {/* Always-on typed command path — works even when every STT engine fails.
          Never disable the field itself: accessibility users must be able to
          type while the cloud agent is still connecting or speaking. */}
      <div className="w-full flex justify-center">
        <TextInputFallback
          onSubmit={handleTypedCommand}
          primary={orchestrator.engine === 'text-input' && agentActive}
          disabled={false}
        />
      </div>

      {error && (
        <p className="text-sm text-[#FF6B6B] animate-vb-fade-in" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function engineLabel(engine: string): string {
  switch (engine) {
    case 'assemblyai-agent':
      return 'AssemblyAI'
    case 'on-device-vosk':
      return 'on-device speech'
    case 'web-speech':
      return 'browser speech'
    case 'text-input':
      return 'text input'
    default:
      return engine
  }
}
