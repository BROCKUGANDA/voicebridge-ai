'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useVoiceStore } from '@/stores/voice-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useConversationStore } from '@/stores/conversation-store'
import { parseIntent, formatResponse, generateId } from '@/lib/voice-processor'
import { createContext, updateContext } from '@/lib/conversation-manager'
import { updateProfile, getPersonalizedResponse, type UserBehaviorProfile } from '@/lib/personalization'
import { useVoiceRecognition } from '@/hooks/use-voice-recognition'
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis'
import { useScreenCapture } from '@/hooks/use-screen-capture'
import { useSoundFeedback } from '@/hooks/use-sound-feedback'
import { announceToScreenReader } from '@/lib/accessibility-utils'
import { soundEngine } from '@/lib/sound-engine'
import { apiFetch } from '@/lib/api-client'
import { DashboardHeader } from '@/components/voicebridge/DashboardHeader'
import { NavigationSidebar } from '@/components/voicebridge/NavigationSidebar'
import { VoiceInput } from '@/components/voicebridge/VoiceInput'
import { VoiceAgentMic } from '@/components/voicebridge/VoiceAgentMic'
import { TranscriptPanel } from '@/components/voicebridge/TranscriptPanel'
import { VisualContext } from '@/components/voicebridge/VisualContext'
import { SettingsPanel } from '@/components/voicebridge/SettingsPanel'
import { MetricsPanel } from '@/components/voicebridge/MetricsPanel'
import { QuickActions } from '@/components/voicebridge/QuickActions'
import { KeyboardShortcutsPanel } from '@/components/voicebridge/KeyboardShortcutsPanel'
import { HomePanel } from '@/components/voicebridge/HomePanel'
import { SoundPanel } from '@/components/voicebridge/SoundPanel'
import { AccessibilityPanel } from '@/components/voicebridge/AccessibilityPanel'
import { ErrorBoundary } from '@/components/voicebridge/ErrorBoundary'
import { LoginOverlay } from '@/components/voicebridge/LoginOverlay'
import { Button } from '@/components/ui/button'
import { Sparkles, Keyboard, Volume2 } from 'lucide-react'

type VoiceIntent = ReturnType<typeof parseIntent>

// Navigation panel IDs
const NAV_PANELS = ['home', 'conversation', 'visual', 'metrics', 'sound', 'accessibility', 'keyboard', 'settings'] as const
type NavPanelId = (typeof NAV_PANELS)[number]

/** Alt+1..7 map to these; Alt+8 ("settings") also opens the drawer. */
const ALT_NAV_MAP: NavPanelId[] = ['home', 'conversation', 'visual', 'metrics', 'sound', 'accessibility', 'keyboard']

export default function VoiceBridgeDashboard() {
  const [activePanel, setActivePanel] = useState<NavPanelId>('home')
  const [authed, setAuthed] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const convContextRef = useRef(createContext())
  const profileRef = useRef<UserBehaviorProfile>({
    averageCommandLength: 0,
    preferredCommandStyle: 'natural',
    commonCommands: new Map(),
    averageResponseTime: 0,
    errorRecoveryRate: 0,
    preferredNavigationStyle: 'sequential',
    sessionFrequency: 0,
  })

  // Store hooks — selector-style where possible to limit re-render blast.
  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen)
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen)
  const responseVerbosity = useSettingsStore((s) => s.responseVerbosity)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const keyboardShortcuts = useSettingsStore((s) => s.keyboardShortcuts)
  const setVoiceState = useVoiceStore((s) => s.setVoiceState)
  const setProcessingStartTime = useVoiceStore((s) => s.setProcessingStartTime)
  const startSession = useConversationStore((s) => s.startSession)
  const recordCommand = useConversationStore((s) => s.recordCommand)
  const addToContext = useConversationStore((s) => s.addToContext)
  const { captureAndAnalyze, describeElementByQuery } = useScreenCapture()
  const { speak, stop: stopSpeaking } = useSpeechSynthesis()
  const { playCompletion, playError } = useSoundFeedback()

  // Core intelligence pipeline
  const handleVoiceResult = useCallback(
    async (text: string, intent: VoiceIntent) => {
      const startTime = Date.now()
      setVoiceState('processing')
      setProcessingStartTime(startTime)

      try {
        const processed = formatResponse(intent, responseVerbosity)
        let responseText = processed.text

        if (processed.needsVisualAnalysis) {
          try {
            const analysis = captureAndAnalyze()
            if (intent.intent === 'describe_page') {
              responseText = analysis.description
            } else if (intent.intent === 'describe_element' && intent.entities.target) {
              responseText = describeElementByQuery(intent.entities.target)
            }
          } catch {
            responseText = 'I was unable to analyze the page. Please try again.'
          }
        }

        if (!responseText && intent.intent === 'general_chat') {
          responseText = `I understand: "${text}". I'm processing locally. Try "describe the page" or "read content".`
        }

        const responseTime = Date.now() - startTime
        profileRef.current = updateProfile(profileRef.current, text, responseTime, true)
        responseText = getPersonalizedResponse(profileRef.current, responseText, false)
        convContextRef.current = updateContext(convContextRef.current, intent.intent, text, true)
        addToContext(text)

        speak(responseText)
        recordCommand(text, true)
        playCompletion()

        const sid = useConversationStore.getState().sessionId
        // Persist both turns; the server derives our identity from the session
        // cookie — never from a client-supplied userId.
        void apiFetch('/api/voice', {
          method: 'POST',
          body: {
            sessionId: sid,
            command: text,
            response: responseText,
            success: true,
            responseTimeMs: responseTime,
            metadata: { intent: intent.intent, confidence: intent.confidence },
          },
        }).catch(() => {})
        void apiFetch('/api/conversation', {
          method: 'POST',
          body: {
            sessionId: sid,
            message: { role: 'user', content: text, confidence: intent.confidence },
          },
        }).catch(() => {})
        void apiFetch('/api/conversation', {
          method: 'POST',
          body: { sessionId: sid, message: { role: 'assistant', content: responseText } },
        }).catch(() => {})
      } catch (err) {
        console.error('Voice processing error:', err)
        const errorMsg = 'Sorry, I encountered an error. Please try again or say "help" for commands.'
        speak(errorMsg)
        recordCommand(text, false)
        playError()
        void apiFetch('/api/voice', {
          method: 'POST',
          body: {
            sessionId: useConversationStore.getState().sessionId,
            command: text,
            response: errorMsg,
            success: false,
          },
        }).catch(() => {})
      }
      const currentState = useVoiceStore.getState().voiceState
      if (currentState === 'processing') {
        setVoiceState('idle')
      }
    },
    [responseVerbosity, setVoiceState, setProcessingStartTime, captureAndAnalyze, describeElementByQuery, speak, recordCommand, playCompletion, playError, addToContext]
  )

  // Voice recognition: SINGLE instance (legacy Web Speech mic)
  const voiceRec = useVoiceRecognition(handleVoiceResult)
  const { toggleListening: toggleMic, isListening, isSupported, error: recError } = voiceRec

  // ---- Auth bootstrap --------------------------------------------------
  // 1. Any 401 from apiFetch flips the login overlay on.
  useEffect(() => {
    const onUnauthorized = () => setShowLogin(true)
    window.addEventListener('vb:unauthorized', onUnauthorized)
    return () => window.removeEventListener('vb:unauthorized', onUnauthorized)
  }, [])

  // 2. Start a session once on load. 401 → login overlay; success → we know
  //    a valid session cookie exists.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/session', { method: 'POST', body: {} })
        if (res.status === 401) {
          if (!cancelled) setShowLogin(true)
          return
        }
        if (!res.ok) {
          console.error('[VB] session bootstrap failed', res.status)
          return
        }
        const { session } = (await res.json()) as { session: { id: string } }
        startSession(session.id)
        if (!cancelled) {
          setAuthed(true)
          setShowLogin(false)
        }
        // Pull server-stored preferences and merge into the local store so
        // agent-driven preference writes and multi-device settings stick.
        void (async () => {
          try {
            const prefsRes = await apiFetch('/api/preferences')
            if (!prefsRes.ok) return
            const payload = (await prefsRes.json()) as {
              preferences?: Record<string, unknown>
            }
            const p = payload.preferences
            if (!p) return
            const patch: Record<string, unknown> = {}
            const keys = [
              'voiceSpeed', 'voicePitch', 'voiceVolume', 'selectedVoice',
              'responseVerbosity', 'voiceEnginePref', 'autoRecoverPrimary',
              'soundTheme', 'soundVolume', 'hapticFeedback', 'autoDescribe',
              'fontSize', 'highContrast', 'reducedMotion', 'keyboardShortcuts',
              'spatialAudio',
            ] as const
            for (const k of keys) {
              if (p[k] !== undefined && p[k] !== null) patch[k] = p[k]
            }
            if (Object.keys(patch).length > 0) {
              useSettingsStore.getState().updatePreferences(patch)
            }
          } catch {
            /* preferences sync is best-effort */
          }
        })()
      } catch (err) {
        console.error('[VB] session bootstrap error', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [startSession])

  // Onboarding shows once per browser. Read localStorage AFTER mount so the
  // SSR tree matches the first client render (avoids hydration mismatch +
  // the follow-on "maximum update depth" cascade).
  const [onboardingDismissed, setOnboardingDismissed] = useState(true)
  useEffect(() => {
    try {
      setOnboardingDismissed(localStorage.getItem('vb-onboarding-dismissed') === '1')
    } catch {
      setOnboardingDismissed(false)
    }
  }, [])
  // Visible only for signed-in first-timers.
  const onboarding = authed && !showLogin && !onboardingDismissed

  // Session duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      const { metrics, sessionStartTime } = useConversationStore.getState()
      if (sessionStartTime) useConversationStore.getState().updateMetrics({ sessionDuration: Math.round((Date.now() - sessionStartTime) / 1000) })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Save metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const { metrics, sessionId } = useConversationStore.getState()
      if (sessionId && metrics.totalCommands > 0) {
        void apiFetch('/api/metrics', { method: 'POST', body: { sessionId, ...metrics } }).catch(() => {})
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // End the session on tab close so duration counters are accurate.
  useEffect(() => {
    const onPageHide = () => {
      const { sessionId } = useConversationStore.getState()
      if (!sessionId) return
      // keepalive: let the request outlive the page
      void fetch('/api/session', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(document.cookie.match(/(?:^|;\s*)vb_csrf=([^;]*)/)
            ? { 'x-vb-csrf': decodeURIComponent(RegExp.$1) }
            : {}),
        },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ sessionId, status: 'ended' }),
      }).catch(() => {})
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  // Quick describe page
  const handleQuickDescribePage = useCallback(() => {
    setVoiceState('processing')
    try {
      const analysis = captureAndAnalyze()
      speak(analysis.description)
      recordCommand('describe-page (keyboard)', true)
      playCompletion()
    } catch { speak('Unable to analyze the page.'); playError() }
  }, [setVoiceState, captureAndAnalyze, speak, recordCommand, playCompletion, playError])

  // Global keyboard shortcuts
  useEffect(() => {
    if (!keyboardShortcuts) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= ALT_NAV_MAP.length) {
          e.preventDefault()
          setActivePanel(ALT_NAV_MAP[num - 1])
          soundEngine.play('navigation', 0.2)
          return
        }
      }

      if (e.ctrlKey && e.key === '/') { e.preventDefault(); setActivePanel('keyboard') }
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); setSettingsOpen(true) }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); handleQuickDescribePage() }
      // Space toggles the voice agent power (documented on Home + empty state).
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('vb:toggle-power'))
        return
      }
      if (e.key === 'Escape') {
        if (isSettingsOpen) setSettingsOpen(false)
        else { stopSpeaking(); setVoiceState('idle') }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyboardShortcuts, isSettingsOpen, setSettingsOpen, setVoiceState, stopSpeaking, handleQuickDescribePage])

  const dismissOnboarding = () => {
    setOnboardingDismissed(true)
    try {
      localStorage.setItem('vb-onboarding-dismissed', '1')
    } catch {
      /* private mode — fine, it just re-shows next visit */
    }
    soundEngine.play('action-confirmation', soundVolume)
    announceToScreenReader('Welcome to VoiceBridge AI. Tap the power button to start the voice agent.')
  }

  // Handle nav panel changes
  const handlePanelChange = useCallback((panel: string) => {
    const id = panel as NavPanelId
    setActivePanel(id)
    // If 'settings' nav item clicked, also open the drawer
    if (id === 'settings') {
      setSettingsOpen(true)
    }
  }, [setSettingsOpen])

  // Voice/local actions can request a panel switch without prop-drilling.
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const panel = (e as CustomEvent<string>).detail as NavPanelId
      if (panel && (NAV_PANELS as readonly string[]).includes(panel)) {
        handlePanelChange(panel)
        soundEngine.play('navigation', 0.2)
        announceToScreenReader(`Opened ${panel} panel`)
      }
    }
    window.addEventListener('vb:navigate', onNavigate)
    return () => window.removeEventListener('vb:navigate', onNavigate)
  }, [handlePanelChange])

  // Practical voice commands that touch dashboard state without a store import
  // cycle from client-actions (export / clear / mute).
  useEffect(() => {
    const onExport = () => {
      const msgs = useVoiceStore.getState().messages
      if (msgs.length === 0) return
      const lines = msgs.map((m) => {
        const who = m.role === 'user' ? 'You' : m.role === 'system' ? 'System' : 'VoiceBridge'
        return `[${new Date(m.timestamp).toISOString()}] ${who}: ${m.content}`
      })
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `voicebridge-transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
      a.click()
      URL.revokeObjectURL(url)
    }
    const onClear = () => {
      useVoiceStore.getState().clearConversation()
      announceToScreenReader('Conversation cleared.')
    }
    const onMute = (e: Event) => {
      const muted = (e as CustomEvent<boolean>).detail
      useVoiceStore.getState().setMuted(muted)
      if (muted) window.speechSynthesis?.cancel()
      announceToScreenReader(muted ? 'Sound muted' : 'Sound enabled')
    }
    window.addEventListener('vb:export-transcript', onExport)
    window.addEventListener('vb:clear-conversation', onClear)
    window.addEventListener('vb:mute', onMute as EventListener)
    return () => {
      window.removeEventListener('vb:export-transcript', onExport)
      window.removeEventListener('vb:clear-conversation', onClear)
      window.removeEventListener('vb:mute', onMute as EventListener)
    }
  }, [])

  // Keep last assistant reply available for the "repeat" command.
  useEffect(() => {
    const unsub = useVoiceStore.subscribe((s) => {
      for (let i = s.messages.length - 1; i >= 0; i--) {
        if (s.messages[i].role === 'assistant') {
          ;(window as Window & { __vbLastReply?: string }).__vbLastReply =
            s.messages[i].content
          break
        }
      }
    })
    return unsub
  }, [])

  // Render the right sidebar panel based on active nav item.
  // When the settings drawer is open, the aside falls back to Home so we
  // never stack two SettingsPanels (the drawer's tabs then intercept the
  // aside's close button and the close looks dead).
  const renderRightPanel = () => {
    if (isSettingsOpen && activePanel === 'settings') {
      return <HomePanel />
    }
    switch (activePanel) {
      case 'home':
        return <HomePanel />
      case 'conversation':
        return <TranscriptPanel />
      case 'visual':
        return <VisualContext />
      case 'metrics':
        return <MetricsPanel />
      case 'sound':
        return <SoundPanel />
      case 'accessibility':
        return <AccessibilityPanel />
      case 'keyboard':
        return <KeyboardShortcutsPanel />
      case 'settings':
        return <SettingsPanel onClose={() => { setActivePanel('home'); setSettingsOpen(false) }} />
      default:
        return <HomePanel />
    }
  }

  // Determine if the main content should show voice input or be hidden
  const showVoiceInput = activePanel === 'home'
  const showTranscriptMain = activePanel === 'conversation'

  return (
    <div
      className={cn(
        'h-screen w-screen flex flex-col bg-[#0A0E17] text-white overflow-hidden',
        // Font size from settings (reactive — read via the hook, not getState)
        fontSize === 'small' && 'text-[14px]',
        fontSize === 'large' && 'text-[18px]',
        fontSize === 'xlarge' && 'text-[20px]',
      )}
      role="application"
      aria-label="VoiceBridge AI Dashboard"
    >
      <DashboardHeader onOpenHelp={() => setActivePanel('keyboard')} />

      <div className="flex-1 flex overflow-hidden">
        <NavigationSidebar activePanel={activePanel} onPanelChange={handlePanelChange} />

        <main className="flex-1 flex flex-col overflow-hidden min-w-0" role="main">
          {/* Voice Input Section — shown on Home panel */}
          {showVoiceInput && (
            <div className="flex flex-col items-center justify-center gap-6 px-4 py-8 border-b border-white/5 animate-vb-fade-in">
              <div className="text-center max-w-md">
                <h2 className="text-xl font-semibold mb-2">
                  <span className="vb-gradient-text">VoiceBridge</span> AI
                </h2>
                <p className="text-sm text-[#9AA4B2]">
                  Tap the power button to start the voice agent. I will help you navigate and understand this page.
                </p>
              </div>
              <ErrorBoundary>
                <VoiceAgentMic />
              </ErrorBoundary>
              <details className="w-full max-w-md text-xs text-[#9AA4B2]/80">
                <summary className="cursor-pointer hover:text-[#9AA4B2]">Use legacy mic (Web Speech API)</summary>
                <div className="mt-3">
                  <ErrorBoundary>
                    <VoiceInput onToggle={toggleMic} isListening={isListening} isSupported={isSupported} recognitionError={recError} />
                  </ErrorBoundary>
                </div>
              </details>
              <div className="w-full max-w-lg">
                <ErrorBoundary>
                  <QuickActions />
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* Conversation panel — full main area */}
          {showTranscriptMain ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-vb-fade-in">
              <TranscriptPanel />
            </div>
          ) : (
            /* Transcript below voice input on home */
            <div className="flex-1 overflow-hidden">
              <TranscriptPanel />
            </div>
          )}
        </main>

        {/* Right Panel */}
        <aside
          className="w-80 border-l border-white/5 bg-[#0D1117]/40 flex-shrink-0 overflow-hidden flex flex-col"
          role="complementary"
          aria-label="Context and tools panel"
        >
          <ErrorBoundary>
            {renderRightPanel()}
          </ErrorBoundary>
        </aside>
      </div>

      {/* Settings Drawer (overlay) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
            aria-hidden="true"
          />
          <div
            className="relative w-full max-w-md h-full bg-[#111827] border-l border-white/5 shadow-2xl animate-vb-slide-in-right"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <SettingsPanel
              onClose={() => {
                setSettingsOpen(false)
                if (activePanel === 'settings') setActivePanel('home')
              }}
            />
          </div>
        </div>
      )}

      {/* Onboarding Overlay — only for signed-in first-timers */}
      {onboarding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to VoiceBridge AI"
        >
          <div className="max-w-md w-full mx-4 animate-vb-fade-in">
            <div className="vb-glass rounded-2xl p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00F0FF] to-[#5CE0D8] flex items-center justify-center mx-auto mb-6">
                <span className="text-[#0A0E17] font-bold text-2xl">VB</span>
              </div>
              <h1 className="text-2xl font-bold mb-2">Welcome to <span className="vb-gradient-text">VoiceBridge AI</span></h1>
              <p className="text-[#9AA4B2] text-sm mb-6 leading-relaxed">Your voice-first accessibility assistant. Navigate digital interfaces, describe visual content, and interact with elements using only your voice.</p>
              <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <Keyboard className="w-5 h-5 text-[#00F0FF] mx-auto mb-1.5" aria-hidden="true" />
                  <p className="text-[10px] text-white/80">Voice Commands</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <Sparkles className="w-5 h-5 text-[#5CE0D8] mx-auto mb-1.5" aria-hidden="true" />
                  <p className="text-[10px] text-white/80">Visual Analysis</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <Volume2 className="w-5 h-5 text-[#FFB627] mx-auto mb-1.5" aria-hidden="true" />
                  <p className="text-[10px] text-white/80">Sound Design</p>
                </div>
              </div>
              <div className="text-left rounded-xl bg-white/5 border border-white/10 p-4 mb-6">
                <p className="text-xs text-[#00F0FF] font-medium mb-2">Quick Start Tips</p>
                <ul className="space-y-1.5">
                  <li className="text-[11px] text-white/75 flex gap-2">
                    <span className="text-[#51CF66] shrink-0" aria-hidden="true">1.</span>
                    Tap the power button, then speak naturally
                  </li>
                  <li className="text-[11px] text-white/75 flex gap-2">
                    <span className="text-[#51CF66] shrink-0" aria-hidden="true">2.</span>
                    Say &quot;describe the page&quot; to hear what is on screen
                  </li>
                  <li className="text-[11px] text-white/75 flex gap-2">
                    <span className="text-[#51CF66] shrink-0" aria-hidden="true">3.</span>
                    Say &quot;help&quot; for all available commands
                  </li>
                  <li className="text-[11px] text-white/75 flex gap-2">
                    <span className="text-[#51CF66] shrink-0" aria-hidden="true">4.</span>
                    Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-[9px] font-mono">Ctrl+D</kbd> to describe page anytime
                  </li>
                </ul>
              </div>
              <Button
                onClick={dismissOnboarding}
                className="w-full bg-[#00F0FF] text-[#0A0E17] hover:bg-[#00F0FF]/90 font-medium"
                aria-label="Get started with VoiceBridge AI"
                autoFocus
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Login overlay — highest z-index, blocks the dashboard until signed in */}
      {showLogin && <LoginOverlay />}

      <footer className="h-7 flex items-center justify-between px-4 border-t border-white/5 bg-[#0D1117]/60 text-[10px] text-[#9AA4B2]" role="contentinfo">
        <div className="flex items-center gap-4">
          <span>VoiceBridge AI v1.0.0</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">AssemblyAI Voice Agent Hackathon</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">Ctrl+/ for help</span>
          <span>Alt+1–7 to switch panels</span>
        </div>
      </footer>
    </div>
  )
}
