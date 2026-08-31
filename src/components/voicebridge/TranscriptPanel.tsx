'use client'

import { useEffect, useRef } from 'react'
import { useVoiceStore, type VoiceMessage } from '@/stores/voice-store'
import { cn } from '@/lib/utils'
import { User, Bot, Info } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

export function TranscriptPanel() {
  const messages = useVoiceStore((s) => s.messages)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-medium text-white/80">Conversation</h2>
        <span className="text-xs text-[#6C757D]" aria-live="polite">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ScrollArea className="flex-1 vb-scrollbar" ref={scrollRef}>
        <div className="p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-[#6C757D]/40 mx-auto mb-3" />
              <p className="text-[#6C757D] text-sm">
                Your conversation will appear here.
              </p>
              <p className="text-[#6C757D]/60 text-xs mt-1">
                Press Space or tap the microphone to start.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function MessageBubble({ message }: { message: VoiceMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div
      className={cn(
        'flex gap-3 animate-vb-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
      role="article"
      aria-label={`${isUser ? 'You said' : isSystem ? 'System' : 'VoiceBridge responded'}: ${message.content}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-[#00F0FF]/20' : isSystem ? 'bg-[#FFB627]/20' : 'bg-[#5CE0D8]/20'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-[#00F0FF]" />
        ) : isSystem ? (
          <Info className="w-4 h-4 text-[#FFB627]" />
        ) : (
          <Bot className="w-4 h-4 text-[#5CE0D8]" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-[#00F0FF]/15 text-white rounded-tr-sm'
            : isSystem
              ? 'bg-[#FFB627]/10 text-[#FFB627] rounded-tl-sm italic'
              : 'bg-white/5 text-white/90 rounded-tl-sm'
        )}
      >
        <p>{message.content}</p>
        {message.confidence !== undefined && (
          <p className="text-[10px] text-[#6C757D]/60 mt-1">
            Confidence: {Math.round(message.confidence * 100)}%
          </p>
        )}
      </div>
    </div>
  )
}