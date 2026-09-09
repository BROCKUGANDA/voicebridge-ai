'use client'

import { cn } from '@/lib/utils'
import { useVoiceStore } from '@/stores/voice-store'
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis'
import { useScreenCapture } from '@/hooks/use-screen-capture'
import { useSoundFeedback } from '@/hooks/use-sound-feedback'
import { useConversationStore } from '@/stores/conversation-store'
import { generateId } from '@/lib/voice-processor'
import {
  Eye,
  BookOpen,
  Search,
  HelpCircle,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'

interface QuickAction {
  id: string
  label: string
  description: string
  icon: React.ElementType
  color: string
  action: () => void
}

export function QuickActions() {
  const { speak } = useSpeechSynthesis()
  const { captureAndAnalyze } = useScreenCapture()
  const { playCompletion, playError } = useSoundFeedback()
  const { addMessage, setVoiceState } = useVoiceStore()
  const { recordCommand, addToContext } = useConversationStore()
  // Reactive (not getState-in-render) so disabled state tracks voice state.
  const voiceState = useVoiceStore((s) => s.voiceState)

  const executeAction = (label: string, responseText: string) => {
    addMessage({
      id: generateId(),
      role: 'user',
      content: label,
      timestamp: Date.now(),
    })

    setVoiceState('processing')

    try {
      // speak() handles the speaking → idle transition via its onend handler
      speak(responseText)
      recordCommand(label, true)
      addToContext(responseText)
      playCompletion()
      // Don't set idle here — speak's onend does that
    } catch {
      recordCommand(label, false)
      playError()
      setVoiceState('idle')
      speak('Sorry, something went wrong. Please try again.')
    }
  }

  const actions: QuickAction[] = [
    {
      id: 'describe',
      label: 'Describe Page',
      description: 'Hear a description of what is on screen',
      icon: Eye,
      color: 'text-[#00F0FF] hover:bg-[#00F0FF]/10 border-[#00F0FF]/20',
      action: () => {
        try {
          const analysis = captureAndAnalyze()
          executeAction('Describe Page', analysis.description)
        } catch {
          executeAction('Describe Page', 'Unable to analyze the page.')
        }
      },
    },
    {
      id: 'read',
      label: 'Read Content',
      description: 'Read all text content aloud',
      icon: BookOpen,
      color: 'text-[#5CE0D8] hover:bg-[#5CE0D8]/10 border-[#5CE0D8]/20',
      action: () => {
        const body = document.body
        const main = body.querySelector<HTMLElement>('main, [role="main"]') || body
        const text = main.innerText?.substring(0, 2000) || 'No text content found on this page.'
        executeAction('Read Content', text)
      },
    },
    {
      id: 'search',
      label: 'Find Element',
      description: 'Search for a specific element on the page',
      icon: Search,
      color: 'text-[#FFB627] hover:bg-[#FFB627]/10 border-[#FFB627]/20',
      action: () => {
        executeAction('Find Element', 'What element would you like me to find? You can say the label or type of element.')
      },
    },
    {
      id: 'back',
      label: 'Go Back',
      description: 'Navigate to the previous page',
      icon: ArrowLeft,
      color: 'text-white/70 hover:bg-white/5 border-white/10',
      action: () => {
        window.history.back()
        executeAction('Go Back', 'Going back.')
      },
    },
    {
      id: 'forward',
      label: 'Go Forward',
      description: 'Navigate to the next page',
      icon: ArrowRight,
      color: 'text-white/70 hover:bg-white/5 border-white/10',
      action: () => {
        window.history.forward()
        executeAction('Go Forward', 'Going forward.')
      },
    },
    {
      id: 'refresh',
      label: 'Refresh Page',
      description: 'Reload the current page',
      icon: RefreshCw,
      color: 'text-white/70 hover:bg-white/5 border-white/10',
      action: () => {
        executeAction('Refresh', 'Refreshing the page.')
        setTimeout(() => window.location.reload(), 300)
      },
    },
    {
      id: 'help',
      label: 'Help',
      description: 'Hear available commands and tips',
      icon: HelpCircle,
      color: 'text-[#51CF66] hover:bg-[#51CF66]/10 border-[#51CF66]/20',
      action: () => {
        const helpText = 'VoiceBridge AI understands these commands: Describe the page, read content, find elements, navigate, search, fill forms, and adjust settings. You can also ask general questions. Press Space to toggle the microphone.'
        executeAction('Help', helpText)
      },
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[#8B98A8] px-1">Quick Actions</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              onClick={action.action}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200',
                'focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                action.color
              )}
              aria-label={`${action.label}: ${action.description}`}
              disabled={voiceState === 'processing' || voiceState === 'speaking'}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] text-center leading-tight">{action.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
