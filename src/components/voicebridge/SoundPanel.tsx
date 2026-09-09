'use client'

import { useCallback } from 'react'
import {
  Volume2,
  VolumeX,
  Play,
  Vibrate,
  Radio,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { soundEngine } from '@/lib/sound-engine'
import { useSettingsStore, type SoundTheme } from '@/stores/settings-store'

const SOUND_THEME_OPTIONS: Array<{
  value: SoundTheme
  label: string
  description: string
  icon: React.ElementType
}> = [
  {
    value: 'off',
    label: 'Off',
    description: 'No sounds at all — silent mode',
    icon: VolumeX,
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Mic on/off and completion only',
    icon: Volume2,
  },
  {
    value: 'detailed',
    label: 'Detailed',
    description: 'All feedback sounds including navigation',
    icon: Radio,
  },
  {
    value: 'verbose',
    label: 'Verbose',
    description: 'Every state change and progress ping',
    icon: Vibrate,
  },
]

type SoundType =
  | 'action-confirmation'
  | 'error-notification'
  | 'progress-indicator'
  | 'completion'
  | 'attention-required'
  | 'navigation'
  | 'state-change'
  | 'mic-on'
  | 'mic-off'
  | 'message-received'

const PREVIEW_SOUNDS: Array<{ type: SoundType; label: string }> = [
  { type: 'action-confirmation', label: 'Action Confirm' },
  { type: 'error-notification', label: 'Error Alert' },
  { type: 'progress-indicator', label: 'Progress' },
  { type: 'completion', label: 'Completion' },
  { type: 'attention-required', label: 'Attention' },
  { type: 'navigation', label: 'Navigation' },
  { type: 'state-change', label: 'State Change' },
  { type: 'mic-on', label: 'Mic On' },
  { type: 'mic-off', label: 'Mic Off' },
  { type: 'message-received', label: 'Message' },
]

export function SoundPanel() {
  const soundTheme = useSettingsStore((s) => s.soundTheme)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const spatialAudio = useSettingsStore((s) => s.spatialAudio)
  const hapticFeedback = useSettingsStore((s) => s.hapticFeedback)
  const updatePreferences = useSettingsStore((s) => s.updatePreferences)

  const handlePlaySound = useCallback(
    (type: SoundType) => {
      soundEngine.play(type, soundVolume)
    },
    [soundVolume]
  )

  const handleThemeSelect = useCallback(
    (theme: SoundTheme) => {
      updatePreferences({ soundTheme: theme })
      soundEngine.play('state-change', soundVolume)
    },
    [updatePreferences, soundVolume]
  )

  return (
    <div className="flex flex-col h-full animate-vb-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-[#00F0FF]" aria-hidden="true" />
          <h2 className="text-sm font-medium text-white/80">Sound Design</h2>
        </div>
        <Badge
          className="text-[10px] px-1.5 py-0 bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20 hover:bg-[#00F0FF]/15"
        >
          {soundTheme}
        </Badge>
      </div>

      <ScrollArea className="flex-1 vb-scrollbar">
        <div className="p-4 space-y-5">
          {/* Sound Theme Selection */}
          <section aria-labelledby="sound-theme-heading">
            <h3
              id="sound-theme-heading"
              className="text-xs font-medium text-white/70 uppercase tracking-wider mb-3"
            >
              Sound Theme
            </h3>

            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Sound theme selection"
            >
              {SOUND_THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => {
                const isActive = soundTheme === value
                return (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => handleThemeSelect(value)}
                    className={
                      'vb-glass rounded-lg p-3 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-1 ' +
                      (isActive
                        ? 'ring-1 ring-[#00F0FF]/60 bg-[#00F0FF]/5'
                        : 'hover:bg-white/5 ring-1 ring-transparent')
                    }
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon
                        className={
                          'w-3.5 h-3.5 ' +
                          (isActive ? 'text-[#00F0FF]' : 'text-[#8B98A8]')
                        }
                        aria-hidden="true"
                      />
                      <span
                        className={
                          'text-xs font-medium ' +
                          (isActive ? 'text-[#00F0FF]' : 'text-white/70')
                        }
                      >
                        {label}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#8B98A8] leading-relaxed">
                      {description}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <Separator className="bg-white/5" />

          {/* Master Volume */}
          <section aria-labelledby="master-volume-heading">
            <div className="flex items-center justify-between mb-2">
              <h3
                id="master-volume-heading"
                className="text-xs font-medium text-white/70 uppercase tracking-wider"
              >
                Master Volume
              </h3>
              <span className="text-xs text-[#00F0FF] font-mono">
                {Math.round(soundVolume * 100)}%
              </span>
            </div>
            <Slider
              value={[soundVolume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => updatePreferences({ soundVolume: v })}
              className="[&_[role=slider]]:bg-[#00F0FF] [&_[role=slider]]:border-[#00F0FF]"
              aria-label="Master volume"
            />
          </section>

          <Separator className="bg-white/5" />

          {/* Preview All Sounds */}
          <section aria-labelledby="preview-sounds-heading">
            <h3
              id="preview-sounds-heading"
              className="text-xs font-medium text-white/70 uppercase tracking-wider mb-3"
            >
              Preview All Sounds
            </h3>

            <div
              className="grid grid-cols-2 gap-1.5"
              role="group"
              aria-label="Sound preview buttons"
            >
              {PREVIEW_SOUNDS.map(({ type, label }) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  className="
                    h-8 justify-start gap-1.5 text-xs
                    border-white/10 text-white/70
                    hover:border-[#00F0FF]/30 hover:text-[#00F0FF] hover:bg-[#00F0FF]/5
                    transition-colors
                  "
                  onClick={() => handlePlaySound(type)}
                  aria-label={`Play ${label} sound preview`}
                >
                  <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </Button>
              ))}
            </div>
          </section>

          <Separator className="bg-white/5" />

          {/* Spatial Audio Toggle */}
          <section aria-labelledby="spatial-audio-heading">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  id="spatial-audio-heading"
                  className="text-xs font-medium text-white/80"
                >
                  Spatial Audio
                </h3>
                <p className="text-[10px] text-[#8B98A8]">
                  Place sounds in 3D space around you
                </p>
              </div>
              <Switch
                checked={spatialAudio}
                onCheckedChange={(v) => {
                  updatePreferences({ spatialAudio: v })
                  soundEngine.play('state-change', soundVolume)
                }}
                aria-label="Toggle spatial audio"
              />
            </div>
          </section>

          <Separator className="bg-white/5" />

          {/* Haptic Feedback Note */}
          <section aria-labelledby="haptic-heading">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  id="haptic-heading"
                  className="text-xs font-medium text-white/80"
                >
                  Haptic Feedback
                </h3>
                <p className="text-[10px] text-[#8B98A8]">
                  {hapticFeedback
                    ? 'Vibration patterns active on supported devices'
                    : 'Haptic feedback is disabled'}
                </p>
              </div>
              <Switch
                checked={hapticFeedback}
                onCheckedChange={(v) => {
                  updatePreferences({ hapticFeedback: v })
                  soundEngine.play('action-confirmation', soundVolume)
                }}
                aria-label="Toggle haptic feedback"
              />
            </div>
          </section>

          {/* Info note */}
          <div className="vb-glass rounded-lg p-3">
            <p className="text-[10px] text-[#8B98A8] leading-relaxed">
              <span className="text-[#5CE0D8] font-medium">Note:</span> All sounds
              are generated programmatically using the Web Audio API — no external audio
              files are loaded. Haptic feedback requires a device with vibration support.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
