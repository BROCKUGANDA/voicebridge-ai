'use client'

import { useVoiceStore } from '@/stores/voice-store'
import { useSettingsStore } from '@/stores/settings-store'
import { cn } from '@/lib/utils'
import { useConversationStore } from '@/stores/conversation-store'
import { StatusIndicator } from './StatusIndicator'
import { VoiceBridgeLogo } from './VoiceBridgeLogo'
import { Settings, HelpCircle, Wifi, WifiOff, Volume2, VolumeX, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { soundEngine } from '@/lib/sound-engine'
import { announceToScreenReader } from '@/lib/accessibility-utils'
import { useCallback } from 'react'

interface DashboardHeaderProps {
  onOpenHelp?: () => void
  onReconnect?: () => void
}

export function DashboardHeader({ onOpenHelp, onReconnect }: DashboardHeaderProps) {
  const voiceState = useVoiceStore((s) => s.voiceState)
  const isMuted = useVoiceStore((s) => s.isMuted)
  const isWebSocketConnected = useVoiceStore((s) => s.isWebSocketConnected)
  const { setSettingsOpen } = useSettingsStore()
  const metrics = useConversationStore((s) => s.metrics)
  const { sessionDuration } = metrics

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
        'VoiceBridge AI help. Press Space to toggle microphone. Say describe the page to hear what is on screen. Say help for a list of commands. Press Ctrl+slash for keyboard shortcuts.'
      )
    }
    soundEngine.play('attention-required', 0.2)
  }

  const handleReconnect = () => {
    if (onReconnect) onReconnect()
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
          <p className="text-[10px] text-[#6C757D]">Accessibility Assistant</p>
        </div>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-4">
        <StatusIndicator state={voiceState} />
        <div className="text-xs text-[#6C757D] hidden sm:block" aria-live="off">
          Session: {formatDuration(sessionDuration)}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Connection Status - click to reconnect */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#6C757D] hover:text-white"
          onClick={handleReconnect}
          aria-label={isWebSocketConnected ? 'WebSocket connected. Click to reconnect.' : 'WebSocket disconnected. Click to reconnect.'}
        >
          {isWebSocketConnected ? (
            <Wifi className="w-4 h-4 text-[#51CF66]" />
          ) : (
            <div className="relative">
              <WifiOff className="w-4 h-4 text-[#FF6B6B]" />
              <RefreshCw className="w-2.5 h-2.5 text-[#FF6B6B] absolute -top-1 -right-1 animate-spin" />
            </div>
          )}
        </Button>

        {/* Mute Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 hover:text-white',
            isMuted ? 'text-[#FF6B6B]' : 'text-[#6C757D]'
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
          className="h-8 w-8 text-[#6C757D] hover:text-white"
          onClick={openSettings}
          aria-label="Open settings"
          aria-expanded={useSettingsStore.getState().isSettingsOpen}
        >
          <Settings className="w-4 h-4" />
        </Button>

        {/* Help */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#6C757D] hover:text-white"
          onClick={handleHelp}
          aria-label="Open help and keyboard shortcuts"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
