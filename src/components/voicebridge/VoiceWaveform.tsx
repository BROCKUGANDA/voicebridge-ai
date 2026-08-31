'use client'

import { useEffect, useRef } from 'react'
import { useVoiceStore } from '@/stores/voice-store'

interface VoiceWaveformProps {
  width?: number
  height?: number
  barCount?: number
}

export function VoiceWaveform({ width = 300, height = 60, barCount = 40 }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const audioLevel = useVoiceStore((s) => s.audioLevel)
  const voiceState = useVoiceStore((s) => s.voiceState)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const barWidth = width / barCount
    const gap = 2
    const bars: number[] = new Array(barCount).fill(0)

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      const isActive = voiceState === 'listening'
      const targetLevel = isActive ? audioLevel : 0

      bars.forEach((_, i) => {
        // Create wave pattern
        const phase = (Date.now() / 200 + i * 0.3) % (Math.PI * 2)
        const wave = isActive ? Math.sin(phase) * 0.5 + 0.5 : 0
        const noise = Math.random() * 0.15
        const target = isActive ? Math.max(wave * targetLevel * 3 + noise, 0.05) : 0.05
        bars[i] += (target - bars[i]) * 0.3

        const barHeight = Math.max(2, bars[i] * height * 0.9)
        const x = i * barWidth + gap / 2
        const y = (height - barHeight) / 2

        // Gradient color based on amplitude
        const intensity = bars[i]
        const r = Math.round(0 + intensity * 0)
        const g = Math.round(200 + intensity * 55)
        const b = Math.round(220 + intensity * 35)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + intensity * 0.6})`

        // Rounded bars
        const bw = barWidth - gap
        const radius = Math.min(bw / 2, barHeight / 2)
        ctx.beginPath()
        ctx.moveTo(x + radius, y)
        ctx.lineTo(x + bw - radius, y)
        ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius)
        ctx.lineTo(x + bw, y + barHeight - radius)
        ctx.quadraticCurveTo(x + bw, y + barHeight, x + bw - radius, y + barHeight)
        ctx.lineTo(x + radius, y + barHeight)
        ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - radius)
        ctx.lineTo(x, y + radius)
        ctx.quadraticCurveTo(x, y, x + radius, y)
        ctx.fill()
      })

      animRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [width, height, barCount, audioLevel, voiceState])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      role="img"
      aria-label={`Voice waveform visualization, ${voiceState === 'listening' ? 'active' : 'inactive'}`}
    />
  )
}