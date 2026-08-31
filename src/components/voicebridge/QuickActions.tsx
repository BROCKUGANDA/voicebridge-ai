'client'

import { cn } from '@/lib/utils'
import { useVoiceStore } from '@/stores/voice-store'
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis'
import { useScreenCapture } from '@/hooks/use-screen-capture'
import { useSoundFeedback } from '@/hooks/use-sound-feedback'
import { useConversationStore } from '@/stores/conversation-store'
import { soundEngine } from '@/lib/sound-engine'
import { generateId } from '@/lib/voice-processor'
import {
  Eye,
  BookOpen,
  Search,
  Navigation,
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
  const { playCompletion, playActionConfirmation, playError } = useSoundFeedback()
  const { addMessage, setVoiceState } = useVoiceStore()
  const { recordCommand, addToContext } = useConversationStore()

  const executeAction = (label: string, text: string, action: () => void) => {
    const startTime = Date.now()
    setVoiceState('processing')

    addMessage({
      id: generateId(),
      role: 'user',
      content: label,
      timestamp: Date.now(),
    })

    try {
      action()
      const responseTime = Date.now() - startTime
      recordCommand(label, true)
      addToContext(text)
      playCompletion()
    } catch {
      recordCommand(label, false)
      playError()
      speak('Sorry, something went wrong. Please try again.')
    }

    setVoiceState('idle')
  }

  const actions: QuickAction[] = [
    {
      id: 'describe',
      label: 'Describe Page',
      description: 'Hear a description of what is on screen',
      icon: Eye,
      color: 'text-[#00F0FF] hover:bg-[#00F0FF]/10 border-[#00F0FF]/20',
      action: () => {
        const analysis = captureAndAnalyze()
        speak(analysis.description)
        executeAction('Describe Page', analysis.description, () => {})
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
        const main = body.querySelector('main, [role="main"]') || body
        const text = main.innerText?.substring(0, 2000) || 'No text content found on this page.'
        speak(text)
        executeAction('Read Content', text, () => {})
      },
    },
    {
      id: 'search',
      label: 'Find Element',
      description: 'Search for a specific element on the page',
      icon: Search,
      color: 'text-[#FFB627] hover:bg-[#FFB627]/10 border-[#FFB627]/20',
      action: () => {
        speak('What element would you like me to find? You can say the label or type of element.')
        executeAction('Find Element', 'User initiated element search', () => {})
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
        speak('Going back.')
        executeAction('Go Back', 'Navigated back', () => {})
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
        speak('Going forward.')
        executeAction('Go Forward', 'Navigated forward', () => {})
      },
    },
    {
      id: 'refresh',
      label: 'Refresh Page',
      description: 'Reload the current page',
      icon: RefreshCw,
      color: 'text-white/70 hover:bg-white/5 border-white/10',
      action: () => {
        window.location.reload()
        speak('Refreshing the page.')
        executeAction('Refresh', 'Page refreshed', () => {})
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
        speak(helpText)
        executeAction('Help', 'User requested help', () => {})
      },
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[#6C757D] px-1">Quick Actions</p>
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
              disabled={useVoiceStore.getState().voiceState === 'processing'}
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