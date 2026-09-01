'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles,
  Mic,
  Eye,
  MessageSquare,
  Settings,
  CheckCircle2,
  XCircle,
  Lightbulb,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { VoiceBridgeLogo } from './VoiceBridgeLogo'

export function HomePanel() {
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  })
  const [voiceCount, setVoiceCount] = useState(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return 0
    return window.speechSynthesis.getVoices().length
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const handleVoicesChanged = () => {
      setVoiceCount(window.speechSynthesis.getVoices().length)
    }
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
    return () =>
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
  }, [])

  const quickStartSteps = [
    {
      num: 1,
      icon: Mic,
      text: 'Tap the microphone or press Space to speak',
    },
    {
      num: 2,
      icon: Eye,
      text: "Say 'describe the page' for visual analysis",
    },
    {
      num: 3,
      icon: MessageSquare,
      text: 'All conversations are saved automatically',
    },
    {
      num: 4,
      icon: Settings,
      text: 'Customize voice, sound, and accessibility in Settings',
    },
  ]

  const tips = [
    'Use keyboard shortcuts for faster navigation — press Ctrl+/ for help.',
    'Enable Auto-Describe in Settings to hear page descriptions automatically.',
    'Reduce motion animations in Accessibility settings if they cause discomfort.',
  ]

  return (
    <div className="flex flex-col h-full animate-vb-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <VoiceBridgeLogo size={24} />
          <h2 className="text-sm font-medium text-white/80">Welcome to VoiceBridge AI</h2>
        </div>
      </div>

      <ScrollArea className="flex-1 vb-scrollbar">
        <div className="p-4 space-y-5">
          {/* Description */}
          <p className="text-xs text-[#6C757D] leading-relaxed">
            VoiceBridge AI is your accessible voice-powered assistant. Interact with any
            web page using natural speech, get real-time visual descriptions, and navigate
            with full keyboard and screen-reader support.
          </p>

          {/* Quick Start Guide */}
          <section aria-labelledby="quick-start-heading">
            <div className="flex items-center gap-1.5 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#FFB627]" />
              <h3
                id="quick-start-heading"
                className="text-xs font-medium text-white/70 uppercase tracking-wider"
              >
                Quick Start Guide
              </h3>
            </div>

            <ol
              className="space-y-2.5"
              role="list"
              aria-label="Quick start steps"
            >
              {quickStartSteps.map(({ num, icon: Icon, text }) => (
                <li key={num} className="flex items-start gap-3">
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-full bg-[#00F0FF]/10 text-[#00F0FF] text-[10px] font-bold shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    {num}
                  </span>
                  <div className="flex items-start gap-2">
                    <Icon
                      className="w-3.5 h-3.5 text-[#5CE0D8] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span className="text-xs text-white/70 leading-relaxed">
                      {text}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* System Status */}
          <section aria-labelledby="system-status-heading">
            <h3
              id="system-status-heading"
              className="text-xs font-medium text-white/70 uppercase tracking-wider mb-3"
            >
              System Status
            </h3>

            <div className="vb-glass rounded-lg p-3 space-y-2.5">
              {/* Speech API support */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6C757D]">Speech API</span>
                <div className="flex items-center gap-1.5">
                  {speechSupported === null ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-white/10 text-[#6C757D]"
                    >
                      Checking…
                    </Badge>
                  ) : speechSupported ? (
                    <Badge className="text-[10px] px-1.5 py-0 bg-[#51CF66]/15 text-[#51CF66] border-[#51CF66]/20 hover:bg-[#51CF66]/20">
                      <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" />
                      Supported
                    </Badge>
                  ) : (
                    <Badge className="text-[10px] px-1.5 py-0 bg-[#FF6B6B]/15 text-[#FF6B6B] border-[#FF6B6B]/20 hover:bg-[#FF6B6B]/20">
                      <XCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                      Not Available
                    </Badge>
                  )}
                </div>
              </div>

              {/* Voice Service — always online via browser APIs */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6C757D]">Voice Service</span>
                <div className="flex items-center gap-1.5">
                  <Badge className="text-[10px] px-1.5 py-0 bg-[#51CF66]/15 text-[#51CF66] border-[#51CF66]/20 hover:bg-[#51CF66]/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" />
                    Online
                  </Badge>
                </div>
              </div>

              {/* Voice count */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6C757D]">Available Voices</span>
                <span className="text-xs text-[#00F0FF] font-mono">
                  {voiceCount} {voiceCount === 1 ? 'voice' : 'voices'}
                </span>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section aria-labelledby="tips-heading">
            <div className="flex items-center gap-1.5 mb-3">
              <Lightbulb className="w-3.5 h-3.5 text-[#FFB627]" />
              <h3
                id="tips-heading"
                className="text-xs font-medium text-white/70 uppercase tracking-wider"
              >
                Accessibility Tips
              </h3>
            </div>

            <div className="vb-glass rounded-lg p-3 space-y-2">
              {tips.map((tip, i) => (
                <p
                  key={i}
                  className="text-xs text-[#6C757D] leading-relaxed flex items-start gap-2"
                >
                  <span className="text-[#FFB627] mt-px shrink-0" aria-hidden="true">•</span>
                  {tip}
                </p>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
