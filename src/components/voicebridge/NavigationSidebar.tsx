'client'

import { cn } from '@/lib/utils'
import { useVoiceStore } from '@/stores/voice-store'
import {
  Home,
  MessageSquare,
  Eye,
  Settings,
  BarChart3,
  Keyboard,
  Volume2,
  Accessibility,
} from 'lucide-react'
import { soundEngine } from '@/lib/sound-engine'
import { useSoundFeedback } from '@/hooks/use-sound-feedback'

interface NavItem {
  id: string
  icon: React.ElementType
  label: string
  ariaLabel: string
  shortcut?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', icon: Home, label: 'Home', ariaLabel: 'Go to home dashboard', shortcut: 'Alt+1' },
  { id: 'conversation', icon: MessageSquare, label: 'Chat', ariaLabel: 'View conversation history', shortcut: 'Alt+2' },
  { id: 'visual', icon: Eye, label: 'Vision', ariaLabel: 'Visual context panel', shortcut: 'Alt+3' },
  { id: 'metrics', icon: BarChart3, label: 'Metrics', ariaLabel: 'View accessibility metrics', shortcut: 'Alt+4' },
  { id: 'sound', icon: Volume2, label: 'Sound', ariaLabel: 'Sound design settings', shortcut: 'Alt+5' },
  { id: 'accessibility', icon: Accessibility, label: 'A11y', ariaLabel: 'Accessibility settings', shortcut: 'Alt+6' },
  { id: 'keyboard', icon: Keyboard, label: 'Keys', ariaLabel: 'Keyboard shortcuts', shortcut: 'Alt+7' },
  { id: 'settings', icon: Settings, label: 'Settings', ariaLabel: 'All settings', shortcut: 'Ctrl+,' },
]

interface NavigationSidebarProps {
  activePanel: string
  onPanelChange: (panel: string) => void
}

export function NavigationSidebar({ activePanel, onPanelChange }: NavigationSidebarProps) {
  const voiceState = useVoiceStore((s) => s.voiceState)
  const { playNavigation } = useSoundFeedback()

  const handleNav = (item: NavItem) => {
    onPanelChange(item.id)
    playNavigation()
    soundEngine.play('navigation', 0.2)
  }

  return (
    <nav
      className="w-14 flex flex-col items-center py-3 gap-1 border-r border-white/5 bg-[#0D1117]/60"
      role="navigation"
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = activePanel === item.id
        const Icon = item.icon

        return (
          <button
            key={item.id}
            onClick={() => handleNav(item)}
            className={cn(
              'relative w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all duration-200',
              'focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-1',
              isActive
                ? 'bg-[#00F0FF]/15 text-[#00F0FF]'
                : 'text-[#6C757D] hover:text-white hover:bg-white/5'
            )}
            aria-label={item.ariaLabel}
            aria-current={isActive ? 'page' : undefined}
            title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
          >
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#00F0FF] rounded-r" />
            )}
            <Icon className="w-4 h-4" />
            <span className="text-[8px] leading-none">{item.label}</span>
          </button>
        )
      })}

      {/* Voice state indicator at bottom */}
      <div className="mt-auto">
        <div
          className={cn(
            'w-3 h-3 rounded-full transition-colors',
            voiceState === 'listening' ? 'bg-[#00F0FF] animate-pulse' :
            voiceState === 'speaking' ? 'bg-[#5CE0D8] animate-pulse' :
            voiceState === 'error' ? 'bg-[#FF6B6B]' :
            'bg-[#6C757D]'
          )}
          aria-hidden="true"
        />
      </div>
    </nav>
  )
}