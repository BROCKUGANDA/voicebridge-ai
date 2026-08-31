'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore, type ResponseVerbosity, type SoundTheme, type FontSize } from '@/stores/settings-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useSoundFeedback } from '@/hooks/use-sound-feedback'
import { soundEngine } from '@/lib/sound-engine'
import { X, RotateCcw, Volume2, Eye, Keyboard, Sliders } from 'lucide-react'

type SoundType = 'action-confirmation' | 'error-notification' | 'progress-indicator' | 'completion' | 'attention-required' | 'navigation' | 'state-change' | 'mic-on' | 'mic-off' | 'message-received'

export function SettingsPanel({ onClose, initialTab }: { onClose: () => void; initialTab?: string }) {
  const store = useSettingsStore()
  const { playActionConfirmation, playCompletion, playAttention } = useSoundFeedback()
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [tab, setTab] = useState(initialTab || store.activeSettingsTab)

  // Sync voices from the speech synthesis API on change events
  useEffect(() => {
    const handleVoicesChanged = () => {
      setAvailableVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en')))
    }
    handleVoicesChanged()
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
  }, [])

  const update = useCallback(
    (prefs: Partial<typeof store>) => {
      store.updatePreferences(prefs)
      playActionConfirmation()
    },
    [store, playActionConfirmation]
  )

  const handleReset = () => {
    store.resetPreferences()
    playAttention()
  }

  return (
    <div className="flex flex-col h-full animate-vb-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-medium text-white/80">Settings</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[#6C757D] hover:text-white"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 vb-scrollbar">
        <div className="p-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-white/5 border border-white/5 w-full">
              <TabsTrigger value="voice" className="text-xs gap-1.5 data-[state=active]:bg-[#00F0FF]/20 data-[state=active]:text-[#00F0FF]">
                <Volume2 className="w-3 h-3" /> Voice
              </TabsTrigger>
              <TabsTrigger value="accessibility" className="text-xs gap-1.5 data-[state=active]:bg-[#00F0FF]/20 data-[state=active]:text-[#00F0FF]">
                <Eye className="w-3 h-3" /> A11y
              </TabsTrigger>
              <TabsTrigger value="sound" className="text-xs gap-1.5 data-[state=active]:bg-[#00F0FF]/20 data-[state=active]:text-[#00F0FF]">
                <Sliders className="w-3 h-3" /> Sound
              </TabsTrigger>
              <TabsTrigger value="keyboard" className="text-xs gap-1.5 data-[state=active]:bg-[#00F0FF]/20 data-[state=active]:text-[#00F0FF]">
                <Keyboard className="w-3 h-3" /> Keys
              </TabsTrigger>
            </TabsList>

            {/* Voice Tab */}
            <TabsContent value="voice" className="mt-4 space-y-5">
              <SettingsRow label="Voice">
                <Select
                  value={store.selectedVoice}
                  onValueChange={(v) => update({ selectedVoice: v })}
                >
                  <SelectTrigger className="w-full bg-white/5 border-white/10 text-xs">
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">System Default</SelectItem>
                    {availableVoices.map((v) => (
                      <SelectItem key={v.name} value={v.name}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>

              <SettingsSliderRow
                label="Speech Rate"
                value={store.voiceSpeed}
                min={0.5}
                max={2}
                step={0.1}
                format={(v) => `${v.toFixed(1)}x`}
                onChange={(v) => update({ voiceSpeed: v })}
              />

              <SettingsSliderRow
                label="Pitch"
                value={store.voicePitch}
                min={0.5}
                max={2}
                step={0.1}
                format={(v) => `${v.toFixed(1)}`}
                onChange={(v) => update({ voicePitch: v })}
              />

              <SettingsSliderRow
                label="Volume"
                value={store.voiceVolume}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => update({ voiceVolume: v })}
              />

              <SettingsRow label="Response Verbosity">
                <Select
                  value={store.responseVerbosity}
                  onValueChange={(v) => update({ responseVerbosity: v as ResponseVerbosity })}
                >
                  <SelectTrigger className="w-full bg-white/5 border-white/10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">Concise - Short answers</SelectItem>
                    <SelectItem value="balanced">Balanced - Default</SelectItem>
                    <SelectItem value="detailed">Detailed - Full explanations</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-white/10 text-white/70"
                  onClick={() => {
                    const u = new SpeechSynthesisUtterance('This is a sample of the current voice settings.')
                    u.rate = store.voiceSpeed
                    u.pitch = store.voicePitch
                    u.volume = store.voiceVolume
                    if (store.selectedVoice !== 'default') {
                      const match = availableVoices.find((v) => v.name === store.selectedVoice)
                      if (match) u.voice = match
                    }
                    window.speechSynthesis.speak(u)
                    playCompletion()
                  }}
                >
                  Test Voice
                </Button>
              </div>
            </TabsContent>

            {/* Accessibility Tab */}
            <TabsContent value="accessibility" className="mt-4 space-y-4">
              <SettingsRow label="Font Size">
                <Select
                  value={store.fontSize}
                  onValueChange={(v) => update({ fontSize: v as FontSize })}
                >
                  <SelectTrigger className="w-full bg-white/5 border-white/10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (14px)</SelectItem>
                    <SelectItem value="medium">Medium (16px)</SelectItem>
                    <SelectItem value="large">Large (18px)</SelectItem>
                    <SelectItem value="xlarge">Extra Large (20px)</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>

              <SettingsSwitchRow
                label="High Contrast Mode"
                description="Increases contrast for better visibility"
                checked={store.highContrast}
                onCheckedChange={(v) => update({ highContrast: v })}
              />

              <SettingsSwitchRow
                label="Reduced Motion"
                description="Minimizes animations and transitions"
                checked={store.reducedMotion}
                onCheckedChange={(v) => update({ reducedMotion: v })}
              />

              <SettingsSwitchRow
                label="Auto-Describe Images"
                description="Automatically describe images on page load"
                checked={store.autoDescribe}
                onCheckedChange={(v) => update({ autoDescribe: v })}
              />

              <SettingsSwitchRow
                label="Haptic Feedback"
                description="Vibrate on actions (mobile devices)"
                checked={store.hapticFeedback}
                onCheckedChange={(v) => update({ hapticFeedback: v })}
              />

              <SettingsSwitchRow
                label="Spatial Audio"
                description="Place sounds in 3D space around you"
                checked={store.spatialAudio}
                onCheckedChange={(v) => update({ spatialAudio: v })}
              />
            </TabsContent>

            {/* Sound Design Tab */}
            <TabsContent value="sound" className="mt-4 space-y-4">
              <SettingsRow label="Sound Theme">
                <Select
                  value={store.soundTheme}
                  onValueChange={(v) => update({ soundTheme: v as SoundTheme })}
                >
                  <SelectTrigger className="w-full bg-white/5 border-white/10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">No Sound</SelectItem>
                    <SelectItem value="minimal">Minimal - Essential only</SelectItem>
                    <SelectItem value="detailed">Detailed - All feedback</SelectItem>
                    <SelectItem value="verbose">Verbose - Everything</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>

              <SettingsSliderRow
                label="Sound Volume"
                value={store.soundVolume}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => update({ soundVolume: v })}
              />

              <div className="space-y-2">
                <Label className="text-xs text-[#6C757D]">Preview Sounds</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Action', type: 'action-confirmation' as SoundType },
                    { label: 'Error', type: 'error-notification' as SoundType },
                    { label: 'Complete', type: 'completion' as SoundType },
                    { label: 'Attention', type: 'attention-required' as SoundType },
                    { label: 'Navigate', type: 'navigation' as SoundType },
                    { label: 'Mic On', type: 'mic-on' as SoundType },
                    { label: 'Mic Off', type: 'mic-off' as SoundType },
                    { label: 'Message', type: 'message-received' as SoundType },
                  ].map(({ label, type }) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      className="text-xs border-white/10 text-white/70"
                      onClick={() => soundEngine.play(type, store.soundVolume)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Keyboard Shortcuts Tab */}
            <TabsContent value="keyboard" className="mt-4 space-y-3">
              <SettingsSwitchRow
                label="Enable Keyboard Shortcuts"
                description="Use keyboard to control VoiceBridge"
                checked={store.keyboardShortcuts}
                onCheckedChange={(v) => update({ keyboardShortcuts: v })}
              />

              <Separator className="bg-white/5" />

              <div className="space-y-2">
                {[
                  { keys: 'Space', desc: 'Toggle microphone' },
                  { keys: 'Escape', desc: 'Stop current action / Close' },
                  { keys: 'Ctrl + /', desc: 'Open help' },
                  { keys: 'Ctrl + ,', desc: 'Open settings' },
                  { keys: 'Ctrl + D', desc: 'Describe current page' },
                  { keys: 'Ctrl + R', desc: 'Read page content' },
                  { keys: 'H / Shift+H', desc: 'Next / Previous heading' },
                  { keys: 'L / Shift+L', desc: 'Next / Previous link' },
                  { keys: 'F / Shift+F', desc: 'Next / Previous form field' },
                  { keys: 'Enter', desc: 'Activate current element' },
                ].map(({ keys, desc }) => (
                  <div key={keys} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-white/70">{desc}</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-[#6C757D] font-mono">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="bg-white/5 my-4" />

          {/* Reset */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-[#FF6B6B] hover:text-[#FF6B6B] hover:bg-[#FF6B6B]/10"
            onClick={handleReset}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset All Settings
          </Button>
        </div>
      </ScrollArea>
    </div>
  )
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-[#6C757D]">{label}</Label>
      {children}
    </div>
  )
}

function SettingsSliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-[#6C757D]">{label}</Label>
        <span className="text-xs text-[#00F0FF] font-mono">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="[&_[role=slider]]:bg-[#00F0FF] [&_[role=slider]]:border-[#00F0FF]"
        aria-label={label}
      />
    </div>
  )
}

function SettingsSwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <Label className="text-xs text-white/80">{label}</Label>
        <p className="text-[10px] text-[#6C757D]">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  )
}