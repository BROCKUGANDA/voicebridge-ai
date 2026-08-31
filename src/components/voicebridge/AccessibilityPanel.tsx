'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Accessibility,
  Eye,
  MousePointerClick,
  Volume2,
  Monitor,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useSettingsStore, type FontSize, type ResponseVerbosity, type SoundTheme } from '@/stores/settings-store'
import { contrastRatio, wcagLevel, announceToScreenReader } from '@/lib/accessibility-utils'
import { useVoiceStore } from '@/stores/voice-store'

export function AccessibilityPanel() {
  const store = useSettingsStore()
  useVoiceStore()

  // Contrast checker state
  const [fgColor, setFgColor] = useState('#FFFFFF')
  const [bgColor, setBgColor] = useState('#0A0E17')

  // Computed contrast ratio
  const ratio = useMemo(() => {
    try {
      return contrastRatio(fgColor, bgColor)
    } catch {
      return 0
    }
  }, [fgColor, bgColor])

  const level = useMemo(() => wcagLevel(ratio), [ratio])

  // Update helper
  const update = useCallback(
    (prefs: Partial<typeof store>) => {
      store.updatePreferences(prefs)
    },
    [store]
  )

  // Font size handler
  const handleFontSizeChange = useCallback(
    (value: string) => {
      update({ fontSize: value as FontSize })
    },
    [update]
  )

  // Switch handlers
  const handleHighContrastChange = useCallback(
    (checked: boolean) => {
      update({ highContrast: checked })
    },
    [update]
  )

  const handleReducedMotionChange = useCallback(
    (checked: boolean) => {
      update({ reducedMotion: checked })
    },
    [update]
  )

  const handleAutoDescribeChange = useCallback(
    (checked: boolean) => {
      update({ autoDescribe: checked })
    },
    [update]
  )

  const handleHapticFeedbackChange = useCallback(
    (checked: boolean) => {
      update({ hapticFeedback: checked })
    },
    [update]
  )

  const handleSpatialAudioChange = useCallback(
    (checked: boolean) => {
      update({ spatialAudio: checked })
    },
    [update]
  )

  const handleKeyboardShortcutsChange = useCallback(
    (checked: boolean) => {
      update({ keyboardShortcuts: checked })
    },
    [update]
  )

  // Contrast checker handlers
  const handleFgColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFgColor(e.target.value)
  }, [])

  const handleBgColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBgColor(e.target.value)
  }, [])

  // Test announcement handler
  const handleTestAnnouncement = useCallback(() => {
    announceToScreenReader(
      'This is a test announcement from VoiceBridge AI. Screen reader support is working correctly.',
      'assertive'
    )
  }, [])

  // WCAG level badge styling
  const levelBadgeVariant = useMemo(() => {
    switch (level) {
      case 'AAA':
        return 'bg-[#51CF66]/20 text-[#51CF66] border-[#51CF66]/30'
      case 'AA':
        return 'bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30'
      case 'A':
        return 'bg-[#FFB627]/20 text-[#FFB627] border-[#FFB627]/30'
      default:
        return 'bg-[#FF6B6B]/20 text-[#FF6B6B] border-[#FF6B6B]/30'
    }
  }, [level])

  // Verbosity badge styling
  const verbosityBadgeVariant = useMemo(() => {
    switch (store.responseVerbosity) {
      case 'detailed':
        return 'bg-[#5CE0D8]/20 text-[#5CE0D8] border-[#5CE0D8]/30'
      case 'balanced':
        return 'bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30'
      case 'concise':
        return 'bg-[#FFB627]/20 text-[#FFB627] border-[#FFB627]/30'
      default:
        return 'bg-white/5 text-[#6C757D] border-white/10'
    }
  }, [store.responseVerbosity])

  return (
    <section
      className="flex flex-col h-full animate-vb-fade-in"
      role="region"
      aria-label="Accessibility settings"
    >
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#00F0FF]/10"
          aria-hidden="true"
        >
          <Accessibility className="w-4 h-4 text-[#00F0FF]" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-white/90">Accessibility</h2>
          <p className="text-[10px] text-[#6C757D]">Customize your experience</p>
        </div>
      </header>

      <ScrollArea className="flex-1 vb-scrollbar">
        <div className="p-4 space-y-6">
          {/* ── Visual Section ── */}
          <section aria-labelledby="visual-heading">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-3.5 h-3.5 text-[#5CE0D8]" aria-hidden="true" />
              <h3 id="visual-heading" className="text-xs font-semibold uppercase tracking-wider text-[#5CE0D8]">
                Visual
              </h3>
            </div>

            <div className="vb-glass rounded-lg p-3 space-y-4">
              {/* Font Size */}
              <div className="space-y-2">
                <Label className="text-xs text-[#6C757D]" htmlFor="font-size-select">
                  Font Size
                </Label>
                <Select
                  value={store.fontSize}
                  onValueChange={handleFontSizeChange}
                >
                  <SelectTrigger
                    id="font-size-select"
                    className="w-full bg-white/5 border-white/10 text-xs"
                    aria-label="Select font size"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (14px)</SelectItem>
                    <SelectItem value="medium">Medium (16px)</SelectItem>
                    <SelectItem value="large">Large (18px)</SelectItem>
                    <SelectItem value="xlarge">Extra Large (20px)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator className="bg-white/5" />

              {/* High Contrast Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-white/80">High Contrast Mode</Label>
                  <p className="text-[10px] text-[#6C757D]">Increases contrast for better visibility</p>
                </div>
                <Switch
                  checked={store.highContrast}
                  onCheckedChange={handleHighContrastChange}
                  aria-label="Toggle high contrast mode"
                />
              </div>

              <Separator className="bg-white/5" />

              {/* Reduced Motion */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-white/80">Reduced Motion</Label>
                  <p className="text-[10px] text-[#6C757D]">Minimizes animations and transitions</p>
                </div>
                <Switch
                  checked={store.reducedMotion}
                  onCheckedChange={handleReducedMotionChange}
                  aria-label="Toggle reduced motion"
                />
              </div>

              <Separator className="bg-white/5" />

              {/* Auto-Describe Images */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-white/80">Auto-Describe Images</Label>
                  <p className="text-[10px] text-[#6C757D]">Automatically describe images on page load</p>
                </div>
                <Switch
                  checked={store.autoDescribe}
                  onCheckedChange={handleAutoDescribeChange}
                  aria-label="Toggle auto-describe images"
                />
              </div>
            </div>
          </section>

          {/* ── Interaction Section ── */}
          <section aria-labelledby="interaction-heading">
            <div className="flex items-center gap-2 mb-3">
              <MousePointerClick className="w-3.5 h-3.5 text-[#FFB627]" aria-hidden="true" />
              <h3 id="interaction-heading" className="text-xs font-semibold uppercase tracking-wider text-[#FFB627]">
                Interaction
              </h3>
            </div>

            <div className="vb-glass rounded-lg p-3 space-y-4">
              {/* Haptic Feedback */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-white/80">Haptic Feedback</Label>
                  <p className="text-[10px] text-[#6C757D]">Vibrate on actions (mobile devices)</p>
                </div>
                <Switch
                  checked={store.hapticFeedback}
                  onCheckedChange={handleHapticFeedbackChange}
                  aria-label="Toggle haptic feedback"
                />
              </div>

              <Separator className="bg-white/5" />

              {/* Spatial Audio */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-white/80">Spatial Audio</Label>
                  <p className="text-[10px] text-[#6C757D]">Place sounds in 3D space around you</p>
                </div>
                <Switch
                  checked={store.spatialAudio}
                  onCheckedChange={handleSpatialAudioChange}
                  aria-label="Toggle spatial audio"
                />
              </div>

              <Separator className="bg-white/5" />

              {/* Keyboard Shortcuts */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-white/80">Keyboard Shortcuts</Label>
                  <p className="text-[10px] text-[#6C757D]">Use keyboard to control VoiceBridge</p>
                </div>
                <Switch
                  checked={store.keyboardShortcuts}
                  onCheckedChange={handleKeyboardShortcutsChange}
                  aria-label="Toggle keyboard shortcuts"
                />
              </div>
            </div>
          </section>

          {/* ── Contrast Checker Section ── */}
          <section aria-labelledby="contrast-heading">
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-3.5 h-3.5 text-[#00F0FF]" aria-hidden="true" />
              <h3 id="contrast-heading" className="text-xs font-semibold uppercase tracking-wider text-[#00F0FF]">
                Contrast Checker
              </h3>
            </div>

            <div className="vb-glass rounded-lg p-3 space-y-4">
              <p className="text-[10px] text-[#6C757D]">
                Test color combinations for WCAG accessibility compliance.
              </p>

              {/* Color inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fg-color-input" className="text-[10px] text-[#6C757D]">
                    Foreground
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="fg-color-input"
                      type="color"
                      value={fgColor}
                      onChange={handleFgColorChange}
                      className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer"
                      aria-label="Foreground color picker"
                    />
                    <input
                      type="text"
                      value={fgColor}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setFgColor(val)
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 font-mono focus:outline-none focus:border-[#00F0FF]/50"
                      aria-label="Foreground hex color value"
                      maxLength={7}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bg-color-input" className="text-[10px] text-[#6C757D]">
                    Background
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="bg-color-input"
                      type="color"
                      value={bgColor}
                      onChange={handleBgColorChange}
                      className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer"
                      aria-label="Background color picker"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setBgColor(val)
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 font-mono focus:outline-none focus:border-[#00F0FF]/50"
                      aria-label="Background hex color value"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              {/* Live preview strip */}
              <div
                className="rounded-md px-3 py-2 text-center text-xs font-medium"
                style={{ backgroundColor: bgColor, color: fgColor }}
                role="img"
                aria-label={`Preview: ${fgColor} text on ${bgColor} background`}
              >
                Sample Text Preview
              </div>

              {/* Ratio & WCAG badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#6C757D]">Contrast Ratio</span>
                  <span className="text-sm font-bold text-white/90 font-mono">
                    {ratio > 0 ? ratio.toFixed(2) : '—'}:1
                  </span>
                </div>
                <Badge
                  className={cn('text-[10px] font-semibold border px-2 py-0', levelBadgeVariant)}
                  aria-label={`WCAG level: ${level === 'fail' ? 'Does not meet' : level}`}
                >
                  {level === 'fail' ? 'Fail' : level}
                </Badge>
              </div>
            </div>
          </section>

          {/* ── Screen Reader Section ── */}
          <section aria-labelledby="screenreader-heading">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-3.5 h-3.5 text-[#51CF66]" aria-hidden="true" />
              <h3 id="screenreader-heading" className="text-xs font-semibold uppercase tracking-wider text-[#51CF66]">
                Screen Reader
              </h3>
            </div>

            <div className="vb-glass rounded-lg p-3 space-y-3">
              <p className="text-xs text-white/70 leading-relaxed">
                VoiceBridge AI is fully compatible with screen readers. All status changes are
                announced via ARIA live regions.
              </p>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs border-[#51CF66]/30 text-[#51CF66] hover:bg-[#51CF66]/10 hover:text-[#51CF66]"
                onClick={handleTestAnnouncement}
                aria-label="Test screen reader announcement"
              >
                <Volume2 className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                Test Announcement
              </Button>
            </div>
          </section>

          {/* ── Voice Profile Section ── */}
          <section aria-labelledby="voice-profile-heading">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="w-3.5 h-3.5 text-[#FFB627]" aria-hidden="true" />
              <h3 id="voice-profile-heading" className="text-xs font-semibold uppercase tracking-wider text-[#FFB627]">
                Voice Profile
              </h3>
            </div>

            <div className="vb-glass rounded-lg p-3">
              <div className="grid grid-cols-3 gap-2 mb-3">
                {/* Speech Rate */}
                <div
                  className="rounded-md bg-white/5 border border-white/5 p-2 text-center"
                  role="status"
                  aria-label={`Speech rate: ${store.voiceSpeed.toFixed(1)}x`}
                >
                  <p className="text-[10px] text-[#6C757D] mb-0.5">Rate</p>
                  <p className="text-sm font-bold text-[#00F0FF] font-mono">
                    {store.voiceSpeed.toFixed(1)}x
                  </p>
                </div>

                {/* Pitch */}
                <div
                  className="rounded-md bg-white/5 border border-white/5 p-2 text-center"
                  role="status"
                  aria-label={`Pitch: ${store.voicePitch.toFixed(1)}`}
                >
                  <p className="text-[10px] text-[#6C757D] mb-0.5">Pitch</p>
                  <p className="text-sm font-bold text-[#5CE0D8] font-mono">
                    {store.voicePitch.toFixed(1)}
                  </p>
                </div>

                {/* Volume */}
                <div
                  className="rounded-md bg-white/5 border border-white/5 p-2 text-center"
                  role="status"
                  aria-label={`Volume: ${Math.round(store.voiceVolume * 100)}%`}
                >
                  <p className="text-[10px] text-[#6C757D] mb-0.5">Volume</p>
                  <p className="text-sm font-bold text-[#FFB627] font-mono">
                    {Math.round(store.voiceVolume * 100)}%
                  </p>
                </div>
              </div>

              {/* Response Verbosity */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#6C757D]">Response Verbosity</span>
                <Badge
                  className={cn('text-[10px] font-semibold border px-2 py-0', verbosityBadgeVariant)}
                  aria-label={`Response verbosity: ${store.responseVerbosity}`}
                >
                  {store.responseVerbosity.charAt(0).toUpperCase() + store.responseVerbosity.slice(1)}
                </Badge>
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </section>
  )
}
