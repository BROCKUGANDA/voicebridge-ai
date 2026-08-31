'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io as socketIOClient, Socket } from 'socket.io-client'
import { cn } from '@/lib/utils'
import { useVoiceStore } from '@/stores/voice-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useConversationStore } from '@/stores/conversation-store'
import { parseIntent, formatResponse, generateId } from '@/lib/voice-processor'
import { createContext, updateContext, buildSystemPrompt } from '@/lib/conversation-manager'
import { updateProfile, getPersonalizedResponse, type UserBehaviorProfile } from '@/lib/personalization'
import { useVoiceRecognition } from '@/hooks/use-voice-recognition'
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis'
import { useScreenCapture } from '@/hooks/use-screen-capture'
import { useSoundFeedback } from '@/hooks/use-sound-feedback'
import { announceToScreenReader, hapticFeedback } from '@/lib/accessibility-utils'
import { DashboardHeader } from '@/components/voicebridge/DashboardHeader'
import { NavigationSidebar } from '@/components/voicebridge/NavigationSidebar'
import { VoiceInput } from '@/components/voicebridge/VoiceInput'
import { TranscriptPanel } from '@/components/voicebridge/TranscriptPanel'
import { VisualContext } from '@/components/voicebridge/VisualContext'
import { SettingsPanel } from '@/components/voicebridge/SettingsPanel'
import { MetricsPanel } from '@/components/voicebridge/MetricsPanel'
import { QuickActions } from '@/components/voicebridge/QuickActions'
import { KeyboardShortcutsPanel } from '@/components/voicebridge/KeyboardShortcutsPanel'

export default function VoiceBridgeDashboard() {
  const [activePanel, setActivePanel] = useState('home')
  const [isMobileRightOpen, setIsMobileRightOpen] = useState(false)
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

  const { isSettingsOpen, setSettingsOpen, responseVerbosity, soundVolume } = useSettingsStore()
  const { setVoiceState, setWebSocketConnected, setProcessingStartTime, setVoiceState: setVS } = useVoiceStore()
  const { startSession, recordCommand, addToContext } = useConversationStore()
  const { captureAndAnalyze, describeElementByQuery } = useScreenCapture()
  const { speak, stop: stopSpeaking } = useSpeechSynthesis()
  const { playCompletion, playError, playAttention } = useSoundFeedback()

  // Initialize WebSocket connection to voice service
  useEffect(() => {
    const socket = socketIOClient('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })

    socket.on('connect', () => {
      console.log('[VoiceBridge] WebSocket connected')
      setWebSocketConnected(true)
    })

    socket.on('disconnect', () => {
      console.log('[VoiceBridge] WebSocket disconnected')
      setWebSocketConnected(false)
    })

    socket.on('session-start', (data) => {
      console.log('[VoiceBridge] Session started:', data.sessionId)
      startSession(data.sessionId)
    })

    socket.on('voice-response', (data) => {
      // We handle responses locally, but this confirms server is alive
      setWebSocketConnected(true)
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [setWebSocketConnected, startSession])

  // Start session on mount
  useEffect(() => {
    const sessionInit = async () => {
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'user-1' }),
        })
        const { session } = await res.json()
        startSession(session.id)
      } catch (err) {
        console.error('Failed to start session:', err)
      }
    }
    sessionInit()
  }, [startSession])

  // Session duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      const { metrics, sessionStartTime } = useConversationStore.getState()
      if (sessionStartTime) {
        const duration = Math.round((Date.now() - sessionStartTime) / 1000)
        useConversationStore.getState().updateMetrics({ sessionDuration: duration })
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Save metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const { metrics, sessionId } = useConversationStore.getState()
      if (sessionId && metrics.totalCommands > 0) {
        fetch('/api/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, ...metrics }),
        }).catch(() => {})
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Handle voice result - the core intelligence pipeline
  const handleVoiceResult = useCallback(
    async (text: string, intent: ReturnType<typeof parseIntent>) => {
      const startTime = Date.now()
      setVoiceState('processing')
      setProcessingStartTime(startTime)

      try {
        // 1. Get formatted response based on intent
        const processed = formatResponse(intent, responseVerbosity)
        let responseText = processed.text

        // 2. Check if visual analysis is needed
        if (processed.needsVisualAnalysis) {
          try {
            const analysis = captureAndAnalyze()
            if (intent.intent === 'describe_page') {
              responseText = analysis.description
            } else if (intent.intent === 'describe_element' && intent.entities.target) {
              responseText = describeElementByQuery(intent.entities.target)
            }
          } catch {
            responseText = 'I was unable to analyze the page. The page might have restricted access. Please try again.'
          }
        }

        // 3. If no specific response yet (general_chat), use WebSocket service
        if (!responseText && intent.intent === 'general_chat') {
          if (socketRef.current?.connected) {
            socketRef.current.emit('voice-input', { text, timestamp: startTime })
            // Wait for response
            responseText = await new Promise<string>((resolve) => {
              const handler = (data: { text: string }) => {
                socketRef.current?.off('voice-response', handler)
                resolve(data.text)
              }
              socketRef.current?.on('voice-response', handler)
              // Timeout fallback
              setTimeout(() => {
                socketRef.current?.off('voice-response', handler)
                resolve(`I understand you said: "${text}". I am processing your request. You can also try specific commands like "describe the page" or "help".`)
              }, 3000)
            })
          } else {
            responseText = `I understand you said: "${text}". I am currently in offline mode. I can still help with commands like "describe the page", "read content", and navigation.`
          }
        }

        // 4. Apply personalization
        const responseTime = Date.now() - startTime
        profileRef.current = updateProfile(profileRef.current, text, responseTime, true)
        responseText = getPersonalizedResponse(profileRef.current, responseText, false)

        // 5. Update context
        convContextRef.current = updateContext(convContextRef.current, intent.intent, text, true)
        addToContext(text)

        // 6. Speak the response
        speak(responseText)
        recordCommand(text, true)
        playCompletion()

        // 7. Log to backend
        fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'user-1',
            sessionId: useConversationStore.getState().sessionId,
            command: text,
            response: responseText,
            success: true,
            responseTimeMs: responseTime,
            metadata: { intent: intent.intent, confidence: intent.confidence },
          }),
        }).catch(() => {})

        // 8. Save conversation
        fetch('/api/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'user-1',
            sessionId: useConversationStore.getState().sessionId,
            message: { role: 'user', content: text, confidence: intent.confidence },
          }),
        }).catch(() => {})

        setTimeout(() => {
          fetch('/api/conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: 'user-1',
              sessionId: useConversationStore.getState().sessionId,
              message: { role: 'assistant', content: responseText },
            }),
          }).catch(() => {})
        }, 500)

      } catch (err) {
        console.error('Voice processing error:', err)
        const errorMsg = 'Sorry, I encountered an error processing your request. Please try again or say "help" for available commands.'
        speak(errorMsg)
        recordCommand(text, false)
        playError()

        fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'user-1',
            sessionId: useConversationStore.getState().sessionId,
            command: text,
            response: errorMsg,
            success: false,
          }),
        }).catch(() => {})
      }

      setVoiceState('idle')
    },
    [responseVerbosity, setVoiceState, setProcessingStartTime, captureAndAnalyze, describeElementByQuery, speak, recordCommand, playCompletion, playError, addToContext]
  )

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
 const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      // Ctrl + / = Help
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        setActivePanel('keyboard')
        speak('VoiceBridge AI help panel opened. Here you will find all available keyboard shortcuts and voice commands.')
      }

      // Ctrl + , = Settings
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }

      // Ctrl + D = Describe page
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        handleQuickDescribePage()
      }

      // Ctrl + R = Read page
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        handleQuickReadPage()
      }

      // Escape = close settings/stop
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          setSettingsOpen(false)
        } else {
          stopSpeaking()
          setVoiceState('idle')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSettingsOpen, setSettingsOpen, setVoiceState, stopSpeaking, speak])

  const handleQuickDescribePage = useCallback(() => {
    setVoiceState('processing')
    try {
      const analysis = captureAndAnalyze()
      speak(analysis.description)
      recordCommand('describe-page (keyboard)', true)
      playCompletion()
    } catch {
      speak('Unable to analyze the current page.')
      playError()
    }
    setVoiceState('idle')
  }, [setVoiceState, captureAndAnalyze, speak, recordCommand, playCompletion, playError])

  const handleQuickReadPage = useCallback(() => {
    setVoiceState('processing')
    try {
      const main = document.querySelector('main, [role="main"]') || document.body
      const text = main.innerText?.substring(0, 2000) || 'No text content found.'
      speak(text)
      recordCommand('read-page (keyboard)', true)
      playCompletion()
    } catch {
      speak('Unable to read page content.')
      playError()
    }
    setVoiceState('idle')
  }, [setVoiceState, speak, recordCommand, playCompletion, playError])

  // Onboarding dismiss
  const dismissOnboarding = () => {
    setOnboarding(false)
    soundEngine.play('action-confirmation', soundVolume)
    announceToScreenReader('Welcome to VoiceBridge AI. Press Space or tap the microphone button to start.')
  }

  // Right panel content
  const renderRightPanel = () => {
    switch (activePanel) {
      case 'visual':
        return <VisualContext />
      case 'metrics':
        return <MetricsPanel />
      case 'sound':
        return (
          <SettingsPanel onClose={() => setActivePanel('home')} />
        )
      case 'accessibility':
        return <SettingsPanel onClose={() => setActivePanel('home')} />
      case 'keyboard':
        return <KeyboardShortcutsPanel />
      case 'settings':
        return <SettingsPanel onClose={() => setActivePanel('home')} />
      case 'conversation':
        return <TranscriptPanel />
      default:
        return <VisualContext />
    }
  }

  return (
    <div className=