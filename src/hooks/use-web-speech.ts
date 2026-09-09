'use client'

/**
 * useWebSpeech — engine #3 in the orchestrator ladder. Wraps the browser's
 * built-in SpeechRecognition API (typically Chrome's Web Speech service) and
 * forwards final transcripts to the same /api/stt/fallback path that Vosk
 * uses, so the downstream intent → dispatch_tool → TTS pipeline is identical.
 *
 * Differences from `useOnDeviceSTT`:
 *   - The browser owns mic capture; we never touch getUserMedia or AudioContext.
 *   - No model to download; `isReady` is true as soon as we verify support.
 *   - No sample rate concerns (browser handles resampling internally).
 *   - The Web Speech API requires an active network connection to the
 *     browser vendor's recognizer (typically Google for Chromium-based
 *     browsers). If you need true offline, use Vosk instead.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseWebSpeechOptions {
  /** Called on every final result (utterance boundary). */
  onResult?: (text: string, confidence: number) => void
  /** Called on every partial result while user is speaking. */
  onPartial?: (text: string) => void
  /** Called on any recognizer error. */
  onError?: (message: string) => void
}

export interface UseWebSpeechReturn {
  isReady: boolean
  isSupported: boolean
  error: string | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: { error: string; message?: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined
  return Ctor ?? null
}

export function useWebSpeech(opts: UseWebSpeechOptions): UseWebSpeechReturn {
  const [error, setError] = useState<string | null>(null)

  const optsRef = useRef(opts)
  // Sync in an effect (not during render) — mutating refs during render is
  // unsafe under concurrent rendering and flagged by the React lint rules.
  useEffect(() => {
    optsRef.current = opts
  }, [opts])

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const isSupported =
    typeof window !== 'undefined' && getSpeechRecognitionCtor() !== null

  // `isReady` is DERIVED: the engine is usable as soon as the browser
  // exposes SpeechRecognition (no load step, no model). Deriving instead of
  // syncing via an effect keeps it correct on first paint.
  const isReady = isSupported

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      const m = 'SpeechRecognition not supported in this browser'
      setError(m)
      optsRef.current.onError?.(m)
      return
    }
    // Tear down any previous instance — SpeechRecognition is single-use.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        /* noop */
      }
      recognitionRef.current = null
    }

    const rec = new Ctor()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setError(null)
    }
    rec.onresult = (event) => {
      let finalText = ''
      let finalConfidence = 0
      let partialText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) {
          finalText += r[0].transcript
          // Pick the highest confidence across final alternatives.
          for (let j = 0; j < r.length; j++) {
            if (r[j].confidence > finalConfidence) finalConfidence = r[j].confidence
          }
        } else {
          partialText += r[0].transcript
        }
      }
      if (partialText) {
        optsRef.current.onPartial?.(partialText)
      }
      if (finalText.trim()) {
        optsRef.current.onResult?.(finalText.trim(), finalConfidence)
      }
    }
    rec.onerror = (ev) => {
      // 'no-speech' and 'aborted' are user-facing non-errors.
      if (ev.error === 'no-speech' || ev.error === 'aborted') return
      const m = ev.message || ev.error || 'unknown speech recognition error'
      setError(m)
      optsRef.current.onError?.(m)
    }
    rec.onend = () => {
      recognitionRef.current = null
    }

    recognitionRef.current = rec
    try {
      rec.start()
    } catch (err) {
      const m = err instanceof Error ? err.message : 'failed to start'
      setError(m)
      optsRef.current.onError?.(m)
    }
  }, [])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        /* noop */
      }
      recognitionRef.current = null
    }
  }, [])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          /* noop */
        }
        recognitionRef.current = null
      }
    }
  }, [])

  return { isReady, isSupported, error, start, stop }
}
