'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io as socketIOClient, Socket } from 'socket.io-client'
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
import { DashboardHeader } from '@/components/voicebridge/DashboardHeader'
import { NavigationSidebar } from '@/components/voicebridge/NavigationSidebar'
import { VoiceInput } from '@/components/voicebridge/VoiceInput'
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
import { Button } from '@/components/ui/button'
import { Sparkles, Keyboard, Volume2 } from 'lucide-react'

type VoiceIntent = ReturnType<typeof parseIntent>

// Navigation panel IDs
const NAV_PANELS = ['home', 'conversation', 'visual', 'metrics', 'sound', 'accessibility', 'keyboard', 'settings'] as const
type NavPanelId = (typeof NAV_PANELS)[number]

export default function VoiceBridgeDashboard() {
  const [activePanel, setActivePanel] = useState<NavPanelId>('home')
  const [onboarding, setOnboarding] = useState(true)
  const socketRef = useRef<Socket | null>(null)
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

  // Store hooks
  const { isSettingsOpen, setSettingsOpen, responseVerbosity, soundVolume } = useSettingsStore()
  const { setVoiceState, setWebSocketConnected, setProcessingStartTime } = useVoiceStore()
  const { startSession, recordCommand, addToContext } = useConversationStore()
  const { captureAndAnalyze, describeElementByQuery } = useScreenCapture()
  const { speak, stop: stopSpeaking } = useSpeechSynthesis()
  const { playCompletion, playError } = useSoundFeedback()

  // Core intelligence pipeline
  const handleVoiceResultRef = useRef<((text: string, intent: VoiceIntent) => Promise<void>) | undefined>(undefined)

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
          if (socketRef.current?.connected) {
            socketRef.current.emit('voice-input', { text, timestamp: startTime })
            responseText = await new Promise<string>((resolve) => {
              const handler = (data: { text: string }) => {
                socketRef.current?.off('voice-response', handler)
                resolve(data.text)
              }
              socketRef.current?.on('voice-response', handler)
              setTimeout(() => {
                socketRef.current?.off('voice-response', handler)
                resolve(`I understand you said: \"${text}\". Try \"describe the page\" or \"help\".`)
              }, 3000)
            })
          } else {
            responseText = `I understand: \"${text}\". I'm processing locally. Try \"describe the page\" or \"read content\".`
          }
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
        fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'user-1', sessionId: sid, command: text, response: responseText, success: true, responseTimeMs: responseTime, metadata: { intent: intent.intent, confidence: intent.confidence } }),
        }).catch(() => {})
        fetch('/api/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'user-1', sessionId: sid, message: { role: 'user', content: text, confidence: intent.confidence } }),
        }).catch(() => {})
        setTimeout(() => {
          fetch('/api/conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: 'user-1', sessionId: sid, message: { role: 'assistant', content: responseText } }),
          }).catch(() => {})
        }, 500)
      } catch (err) {
        console.error('Voice processing error:', err)
        const errorMsg = 'Sorry, I encountered an error. Please try again or say \"help\" for commands.'
        speak(errorMsg)
        recordCommand(text, false)
        playError()
        fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'user-1', sessionId: useConversationStore.getState().sessionId, command: text, response: errorMsg, success: false }),
        }).catch(() => {})
      }
      const currentState = useVoiceStore.getState().voiceState
      if (currentState === 'processing') {
        setVoiceState('idle')
      }
    },
    [responseVerbosity, setVoiceState, setProcessingStartTime, captureAndAnalyze, describeElementByQuery, speak, recordCommand, playCompletion, playError, addToContext]
  )

  useEffect(() => { handleVoiceResultRef.current = handleVoiceResult }, [handleVoiceResult])

  // Voice recognition: SINGLE instance
  const voiceRec = useVoiceRecognition(handleVoiceResult)
  const { toggleListening: toggleMic, isListening, isSupported, error: recError } = voiceRec

  // Handle nav panel changes
  const handlePanelChange = useCallback((panel: string) => {
    const id = panel as NavPanelId
    setActivePanel(id)
    // If 'settings' nav item clicked, also open the drawer
    if (id === 'settings') {
      setSettingsOpen(true)
    }
  }, [setSettingsOpen])

  // Header callbacks
  const handleOpenHelp = useCallback(() => {
    setActivePanel('keyboard')
  }, [])

  const handleReconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current.connect()
    }
  }, [])

  // WebSocket connection
  useEffect(() => {
    const socket = socketIOClient('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })
    socket.on('connect', () => { console.log('[VB] WS connected'); setWebSocketConnected(true) })
    socket.on('disconnect', () => { console.log('[VB] WS disconnected'); setWebSocketConnected(false) })
    socket.on('session-start', (data: { sessionId: string }) => { startSession(data.sessionId) })
    socket.on('voice-response', () => { setWebSocketConnected(true) })
    socketRef.current = socket
    return () => { socket.disconnect() }
  }, [setWebSocketConnected, startSession])

  // Start session
  useEffect(() => {
    fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-1' }),
    }).then(r => r.json()).then(({ session }) => startSession(session.id)).catch(console.error)
  }, [startSession])

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
        fetch('/api/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, ...metrics }) }).catch(() => {})
      }
    }, 15000)
    return () => clearInterval(interval)
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
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      // Alt+1-7 for nav panels
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 7) {
          e.preventDefault()
          setActivePanel(NAV_PANELS[num - 1])
          soundEngine.play('navigation', 0.2)
          return
        }
      }

      if (e.ctrlKey && e.key === '/') { e.preventDefault(); setActivePanel('keyboard') }
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); setSettingsOpen(true) }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); handleQuickDescribePage() }
      if (e.key === 'Escape') {
        if (isSettingsOpen) setSettingsOpen(false)
        else { stopSpeaking(); setVoiceState('idle') }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSettingsOpen, setSettingsOpen, setVoiceState, stopSpeaking, handleQuickDescribePage])

  const dismissOnboarding = () => {
    setOnboarding(false)
    soundEngine.play('action-confirmation', soundVolume)
    announceToScreenReader('Welcome to VoiceBridge AI. Press Space or tap the microphone button to start.')
  }

  // Render the right sidebar panel based on active nav item
  const renderRightPanel = () => {
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
        return <SettingsPanel onClose={() => setActivePanel('home')} />
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
        // Apply font size from settings
        useSettingsStore.getState().fontSize === 'small' && 'text-[14px]',
        useSettingsStore.getState().fontSize === 'large' && 'text-[18px]',
        useSettingsStore.getState().fontSize === 'xlarge' && 'text-[20px]',
      )}
      role="application"
      aria-label="VoiceBridge AI Dashboard"
    >
      <DashboardHeader onOpenHelp={handleOpenHelp} onReconnect={handleReconnect} />

      <div className="flex-1 flex overflow-hidden">
        <NavigationSidebar activePanel={activePanel} onPanelChange={handlePanelChange} />

        <main className="flex-1 flex flex-col overflow-hidden" role="main">
          {/* Voice Input Section — shown on Home panel */}
          {showVoiceInput && (
            <div className="flex flex-col items-center justify-center gap-6 px-4 py-8 border-b border-white/5 animate-vb-fade-in">
              <div className="text-center max-w-md">
                <h2 className="text-xl font-semibold mb-2">
                  <span className="vb-gradient-text">VoiceBridge</span> AI
                </h2>
                <p className="text-sm text-[#6C757D]">
                  Tap the microphone or press Space to start speaking. I will help you navigate and understand this page.
                </p>
              </div>
              <ErrorBoundary>
                <VoiceInput onToggle={toggleMic} isListening={isListening} isSupported={isSupported} recognitionError={recError} />
              </ErrorBoundary>
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
          className="w-80 border-l border-white/5 bg-[#0D1117]/40 flex-shrink-0 overflow-hidden hidden lg:flex flex-col"
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
          <div className="relative w-full max-w-md h-full bg-[#111827] border-l border-white/5 shadow-2xl animate-vb-slide-in-right">
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      )}

      {/* Onboarding Overlay */}
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
              <p className="text-[#6C757D] text-sm mb-6 leading-relaxed">Your voice-first accessibility assistant. Navigate digital interfaces, describe visual content, and interact with elements using only your voice.</p>
              <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="rounded-xl bg-white/3 border border-white/5 p-3">
                  <Keyboard className="w-5 h-5 text-[#00F0FF] mx-auto mb-1.5" />
                  <p className="text-[10px] text-white/70">Voice Commands</p>
                </div>
                <div className="rounded-xl bg-white/3 border border-white/5 p-3">
                  <Sparkles className="w-5 h-5 text-[#5CE0D8] mx-auto mb-1.5" />
                  <p className="text-[10px] text-white/70">Visual Analysis</p>
                </div>
                <div className="rounded-xl bg-white/3 border border-white/5 p-3">
                  <Volume2 className="w-5 h-5 text-[#FFB627] mx-auto mb-1.5" />
                  <p className="text-[10px] text-white/70">Sound Design</p>
                </div>
              </div>
              <div className="text-left rounded-xl bg-white/3 border border-white/5 p-4 mb-6">
                <p className="text-xs text-[#00F0FF] font-medium mb-2">Quick Start Tips</p>
                <ul className="space-y-1.5">
                  <li className="text-[11px] text-white/60 flex gap-2">
                    <span className="text-[#51CF66] shrink-0">1.</span>
                    Press <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono">Space</kbd> or tap the mic to speak
                  </li>
                  <li className="text-[11px] text-white/60 flex gap-2">
                    <span className="text-[#51CF66] shrink-0">2.</span>
                    Say &quot;describe the page&quot; to hear what is on screen
                  </li>
                  <li className="text-[11px] text-white/60 flex gap-2">
                    <span className="text-[#51CF66] shrink-0">3.</span>
                    Say &quot;help&quot; for all available commands
                  </li>
                  <li className="text-[11px] text-white/60 flex gap-2">
                    <span className="text-[#51CF66] shrink-0">4.</span>
                    Press <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono">Ctrl+D</kbd> to describe page anytime
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

      <footer className="h-7 flex items-center justify-between px-4 border-t border-white/5 bg-[#0D1117]/60 text-[10px] text-[#6C757D]" role="contentinfo">
        <div className="flex items-center gap-4">
          <span>VoiceBridge AI v1.0.0</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">AssemblyAI Voice Agent Hackathon</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">Press Space to speak</span>
          <span>Ctrl+/ for help</span>
        </div>
      </footer>
    </div>
  )
}