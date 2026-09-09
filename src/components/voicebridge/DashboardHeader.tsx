'use client'

import { useVoiceStore } from '@/stores/voice-store'
import { useSettingsStore } from '@/stores/settings-store'
import { cn } from '@/lib/utils'
import { useConversationStore } from '@/stores/conversation-store'
import { StatusIndicator } from './StatusIndicator'
import { VoiceBridgeLogo } from './VoiceBridgeLogo'
import { Settings, HelpCircle, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { soundEngine } from '@/lib/sound-engine'
import { announceToScreenReader } from '@/lib/accessibility-utils'
import { useCallback } from 'react'

interface DashboardHeaderProps {
  onOpenHelp?: () => void
}

export function DashboardHeader({ onOpenHelp }: DashboardHeaderProps) {
  const voiceState = useVoiceStore((s) => s.voiceState)
  const isMuted = useVoiceStore((s) => s.isMuted)
  const metrics = useConversationStore((s) => s.metrics)
  const { sessionDuration } = metrics
  const { setSettingsOpen, isSettingsOpen } = useSettingsStore()

  const toggleMute = useCallback(() => {
    const next = !isMuted
    useVoiceStore.getState().setMuted(next)
    if (next) {
      window.speechSynthesis.cancel()
    }
    if (!next) {
      soundEngine.play('mic-on', 0.3)
    }
    announceToScreenReader(next ? 'Sound muted' : 'Sound enabled')
  }, [isMuted])

  const openSettings = () => {
    setSettingsOpen(true)
  }

  const handleHelp = () => {
    if (onOpenHelp) {
      onOpenHelp()
    } else {
      announceToScreenReader(
        'VoiceBridge AI help. Tap the power button to start the voice agent. Say describe the page to hear what is on screen. Say help for a list of commands. Press Ctrl+slash for keyboard shortcuts.'
      )
    }
    soundEngine.play('attention-required', 0.2)
  }

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <header
      className="h-14 flex items-center justify-between px-4 border-b border-white/5 bg-[#0D1117]/80 backdrop-blur-md"
      role="banner"
    >
      {/* Left: Branding */}
      <div className="flex items-center gap-3">
        <VoiceBridgeLogo size={36} />
        <div>
          <h1 className="text-sm font-semibold text-white leading-none">
            VoiceBridge <span className="vb-gradient-text">AI</span>
          </h1>
          <p className="text-[10px] text-[#8B98A8]">Accessibility Assistant</p>
        </div>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-4">
        <StatusIndicator state={voiceState} />
        <div className="text-xs text-[#8B98A8] hidden sm:block" aria-live="off">
          Session: {formatDuration(sessionDuration)}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Mute Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 hover:text-white',
            isMuted ? 'text-[#FF6B6B]' : 'text-[#9AA4B2]'
          )}
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute all output' : 'Mute all output'}
          aria-pressed={isMuted}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Button>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#9AA4B2] hover:text-white"
          onClick={openSettings}
          aria-label="Open settings"
          aria-expanded={isSettingsOpen}
        >
          <Settings className="w-4 h-4" />
        </Button>

        {/* Help */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#9AA4B2] hover:text-white"
          onClick={handleHelp}
          aria-label="Open help and keyboard shortcuts"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
