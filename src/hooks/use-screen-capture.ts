'use client'

import { useState, useCallback } from 'react'
import { useVoiceStore } from '@/stores/voice-store'
import { analyzePage, describeElement, type PageAnalysis } from '@/lib/vision-analyzer'

type CaptureState = 'idle' | 'capturing' | 'analyzing' | 'done' | 'error'

interface UseScreenCaptureReturn {
  captureState: CaptureState
  pageAnalysis: PageAnalysis | null
  captureAndAnalyze: () => PageAnalysis
  describeElementByQuery: (query: string) => string
  error: string | null
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [captureState, setCaptureState] = useState<CaptureState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pageAnalysis, setPageAnalysis] = useState<PageAnalysis | null>(null)
  const { setVisualData } = useVoiceStore()

  const captureAndAnalyze = useCallback(() => {
    try {
      setCaptureState('capturing')
      setError(null)

      // Attempt to capture screenshot using html2canvas-like approach
      // Since we can't easily screenshot, we analyze the DOM directly
      setCaptureState('analyzing')

      const analysis = analyzePage()
      setPageAnalysis(analysis)

      // Update voice store with visual data
      setVisualData({
        description: analysis.description,
        elements: analysis.elements.map((el) => ({
          type: el.type,
          label: el.label,
          description: el.description,
          bounds: el.bounds,
        })),
        confidence: analysis.overallConfidence,
      })

      setCaptureState('done')
      return analysis
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Capture failed'
      setError(msg)
      setCaptureState('error')
      throw err
    }
  }, [setVisualData])

  const describeElementByQuery = useCallback((query: string): string => {
    try {
      return describeElement(query)
    } catch {
      return `Could not analyze element: ${query}`
    }
  }, [])

  return {
    captureState,
    pageAnalysis,
    captureAndAnalyze,
    describeElementByQuery,
    error,
  }
}
