'client'

import { cn } from '@/lib/utils'
import type { VoiceState } from '@/stores/voice-store'

const STATE_STYLES: Record<VoiceState, { dot: string; label: string; ring: string }> = {
  idle: {
    dot: 'bg-[#6C757D]',
    label: 'Ready',
    ring: '',
  },
  listening: {
    dot: 'bg-[#00F0FF] animate-pulse',
    label: 'Listening',
    ring: 'ring-2 ring-[#00F0FF]/30',
  },
  processing: {
    dot: 'bg-[#FFB627] animate-pulse',
    label: 'Processing',
    ring: 'ring-2 ring-[#FFB627]/30',
  },
  speaking: {
    dot: 'bg-[#5CE0D8] animate-pulse',
    label: 'Speaking',
    ring: 'ring-2 ring-[#5CE0D8]/30',
  },
  error: {
    dot: 'bg-[#FF6B6B]',
    label: 'Error',
    ring: 'ring-2 ring-[#FF6B6B]/30',
  },
}

export function StatusIndicator({ state }: { state: VoiceState }) {
  const config = STATE_STYLES[state]

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <div className="relative">
        <div className={cn('w-2.5 h-2.5 rounded-full', config.dot)} />
        {config.ring && <div className={cn('absolute inset-0 rounded-full', config.ring)} />}
      </div>
      <span className="text-xs text-[#6C757D] hidden sm:inline">{config.label}</span>
    </div>
  )
}
