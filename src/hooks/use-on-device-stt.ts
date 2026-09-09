'use client'

/**
 * useOnDeviceSTT — wires the vosk-browser WASM recognizer to the existing
 * pcm-processor.js worklet. Reuses the AudioContext lifecycle owned by the
 * caller (typically VoiceAgentMic) so we don't fight it for the mic.
 *
 * PCM16 → Float32 conversion: vosk-browser accepts `acceptWaveformFloat`.
 * AudioContext default sample rate varies (44.1/48 kHz on Safari, 24 kHz
 * when we asked for it elsewhere). We pass the actual sample rate through.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createModel, type Model, type KaldiRecognizer } from 'vosk-browser'

export interface UseOnDeviceSTTOptions {
  /** Sample rate of the AudioContext that owns the worklet. */
  sampleRate: number
  /** Called on every final result (utterance boundary). */
  onResult?: (text: string, confidence: number) => void
  /** Called on every partial result while user is speaking. */
  onPartial?: (text: string) => void
  /** Called on any recognizer error. */
  onError?: (message: string) => void
}
export interface UseOnDeviceSTTReturn {
  isReady: boolean
  isLoading: boolean
  loadProgress: number // 0..1 — rough estimate
  error: string | null
  /** Feed a PCM16 Int16Array chunk from the worklet. */
  acceptPcm16: (pcm: Int16Array, sampleRate: number) => void
  /** Drop the recognizer and free its memory. */
  dispose: () => Promise<void>
}

const MODEL_URL = '/models/vosk-model-small-en-us.tar.gz'

export function useOnDeviceSTT(opts: UseOnDeviceSTTOptions): UseOnDeviceSTTReturn {
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const modelRef = useRef<Model | null>(null)
  const recognizerRef = useRef<KaldiRecognizer | null>(null)
  const progressProbedRef = useRef(false)

  // Stash the latest callbacks in a ref so the recognizer (constructed once)
  // can always call the freshest closure. Avoids having to recreate the
  // recognizer when the caller rebinds handlers on every render.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  }, [opts])

  const ensureLoaded = useCallback(async () => {
    if (modelRef.current && recognizerRef.current) return
    setIsLoading(true)
    setError(null)
    try {
      // vosk-browser's worker downloads the .tar.gz itself (via fetch) and
      // caches the EXTRACTED model in IndexedDB on first success. We used to
      // run a parallel XHR just to show progress — that downloaded the
      // 41 MB archive a second time on first use. Instead we cache-probe
      // once with the browser HTTP cache (no body) and show a staged bar.
      if (!progressProbedRef.current) {
        progressProbedRef.current = true
        setLoadProgress(0.05)
        try {
          const res = await fetch(MODEL_URL, { method: 'HEAD' })
          const total = Number(res.headers.get('content-length') ?? 0)
          // If the archive isn't in the HTTP cache the worker will stream
          // it; estimate progress from its download instead of a second GET.
          if (total > 0) {
            const cached = res.headers.get('content-length') && res.status !== 200
            setLoadProgress(cached ? 0.5 : 0.2)
          }
        } catch {
          /* progress is cosmetic — ignore probe failures */
        }
      }

      const model = await createModel(MODEL_URL, 0)
      modelRef.current = model

      const Recognizer = model.KaldiRecognizer
      const recognizer = new Recognizer(optsRef.current.sampleRate)
      recognizer.setWords(true)

      recognizer.on('result', (msg) => {
        const data = (msg as {
          result?: { text?: string; words?: Array<{ confidence?: number }> }
        }).result
        const text = (data?.text || '').trim()
        if (text) {
          // Real confidence when word confidences are present (setWords(true));
          // 0.8 as a conservative stand-in when the engine reports none.
          const words = data?.words ?? []
          const confs = words
            .map((w) => w.confidence)
            .filter((c): c is number => typeof c === 'number' && c >= 0)
          const confidence =
            confs.length > 0
              ? confs.reduce((a, b) => a + b, 0) / confs.length
              : 0.8
          optsRef.current.onResult?.(text, Math.min(1, Math.max(0, confidence)))
        }
      })
      recognizer.on('partialresult', (msg) => {
        const partial =
          (msg as { result?: { partial?: string } }).result?.partial || ''
        optsRef.current.onPartial?.(partial)
      })
      recognizer.on('error', (msg) => {
        const m =
          (msg as { error?: string }).error || 'unknown vosk error'
        setError(m)
        optsRef.current.onError?.(m)
      })

      recognizerRef.current = recognizer
      setLoadProgress(1)
      setIsReady(true)
    } catch (err) {
      const m = err instanceof Error ? err.message : 'failed to load model'
      setError(m)
      optsRef.current.onError?.(m)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const acceptPcm16 = useCallback(
    (pcm: Int16Array, sampleRate: number) => {
      const rec = recognizerRef.current
      if (!rec) {
        // First chunk arrived before ensureLoaded finished — kick it off.
        void ensureLoaded().then(() => {
          const r2 = recognizerRef.current
          if (!r2) return
          const f32 = int16ToFloat32(pcm)
          r2.acceptWaveformFloat(f32, sampleRate)
        })
        return
      }
      const f32 = int16ToFloat32(pcm)
      rec.acceptWaveformFloat(f32, sampleRate)
    },
    [ensureLoaded],
  )

  const dispose = useCallback(async () => {
    try {
      recognizerRef.current?.remove()
    } catch {
      /* ignore */
    }
    recognizerRef.current = null
    try {
      modelRef.current?.terminate()
    } catch {
      /* ignore */
    }
    modelRef.current = null
    progressProbedRef.current = false
    setIsReady(false)
  }, [])

  useEffect(() => {
    return () => {
      void dispose()
    }
  }, [dispose])

  return { isReady, isLoading, loadProgress, error, acceptPcm16, dispose }
}

/** Warm the browser HTTP cache for the model archive (no progress UI).
 *  vosk's worker still streams it into IndexedDB on first load. */
async function primeModelCache(url: string): Promise<void> {
  await fetch(url, { method: 'HEAD' }).catch(() => {})
}

function int16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i]
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff
  }
  return out
}

/**
 * Optional preload — call from a settings-page toggle to warm the browser
 * cache before the user needs the engine.
 */
export async function preloadOnDeviceModel(): Promise<void> {
  await primeModelCache(MODEL_URL)
}
