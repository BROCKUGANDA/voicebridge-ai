'use client'

import { useVoiceStore } from '@/stores/voice-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useConversationStore } from '@/stores/conversation-store'
import { StatusIndicator } from './StatusIndicator'
import { Settings, HelpCircle, Wifi, WifiOff, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { soundEngine } from '@/lib/sound-engine'
import { announceToScreenReader } from '@/lib/accessibility-utils'

export function DashboardHeader() {
  const voiceState = useVoiceStore((s) => s.voiceState)
  const isMuted = useVoiceStore((s) => s.isMuted)
  const isWebSocketConnected = useVoiceStore((s) => s.isWebSocketConnected)
  const { isSettingsOpen, setSettingsOpen } = useSettingsStore()
  const metrics = useConversationStore((s) => s.metrics)
  const { sessionDuration } = metrics

  const toggleMute = () => {
    useVoiceStore.getState().setMuted(!isMuted)
    if (!isMuted) {
      window.speechSynthesis.cancel()
    }
    soundEngine.play(isMuted ? 'mic-on' : 'mic-off', 0.3)
    announceToScreenReader(isMuted ? 'Sound enabled' : 'Sound muted')
  }

  const openSettings = () => {
    setSettingsOpen(!isSettingsOpen)
    soundEngine.play('navigation', 0.3)
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
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F0FF] to-[#5CE0D8] flex items-center justify-center">
            <span className="text-[#0A0E17] font-bold text-sm">VB</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-none">
              VoiceBridge <span className="vb-gradient-text">AI</span>
            </h1>
            <p className="text-[10px] text-[#6C757D]">Accessibility Assistant</p>
          </div>
        </div>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-4">
        <StatusIndicator state={voiceState} />
        <div className="text-xs text-[#6C757D] hidden sm:block">
          Session: {formatDuration(sessionDuration)}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#6C757D] hover:text-white"
          aria-label={isWebSocketConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
        >
          {isWebSocketConnected ? (
            <Wifi className="w-4 h-4 text-[#51CF66]" />
          ) : (
            <WifiOff className="w-4 h-4 text-[#FF6B6B]" />
          )}
        </Button>

        {/* Mute Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#6C757D] hover:text-white"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute output' : 'Mute output'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-[#FF6B6B]" /> : <Volume2 className="w-4 h-4" />}
        </Button>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#6C757D] hover:text-white"
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
          className="h-8 w-8 text-[#6C757D] hover:text-white"
          onClick={() => {
            announceToScreenReader(
              'VoiceBridge AI help. Press Space to toggle microphone. Say describe page to hear what is on screen. Say help for a list of commands.'
            )
          }}
          aria-label="Help and keyboard shortcuts"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
