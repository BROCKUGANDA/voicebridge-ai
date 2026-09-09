'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useVoiceStore, type VoiceMessage } from '@/stores/voice-store'
import { cn } from '@/lib/utils'
import { User, Bot, Info, Download, Trash2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { announceToScreenReader } from '@/lib/accessibility-utils'

export function TranscriptPanel() {
  const messages = useVoiceStore((s) => s.messages)
  const clearConversation = useVoiceStore((s) => s.clearConversation)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const exportTranscript = useCallback(() => {
    if (messages.length === 0) return
    const lines = messages.map((m) => {
      const ts = new Date(m.timestamp).toISOString()
      const who = m.role === 'user' ? 'You' : m.role === 'system' ? 'System' : 'VoiceBridge'
      return `[${ts}] ${who}: ${m.content}`
    })
    const header = `VoiceBridge AI transcript\nExported: ${new Date().toISOString()}\nMessages: ${messages.length}\n\n`
    const blob = new Blob([header + lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voicebridge-transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    announceToScreenReader('Transcript downloaded as a text file.')
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-medium text-white/80">Conversation</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8B98A8]" aria-live="polite">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#8B98A8] hover:text-white"
            onClick={exportTranscript}
            disabled={messages.length === 0}
            aria-label="Download transcript as text"
            title="Download transcript"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#8B98A8] hover:text-[#FF6B6B]"
            onClick={() => {
              clearConversation()
              announceToScreenReader('Conversation cleared.')
            }}
            disabled={messages.length === 0}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 vb-scrollbar" ref={scrollRef}>
        <div className="p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-[#8B98A8]/40 mx-auto mb-3" />
              <p className="text-[#8B98A8] text-sm">
                Your conversation will appear here.
              </p>
              <p className="text-[#8B98A8]/60 text-xs mt-1">
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
          <p className="text-[10px] text-[#8B98A8]/60 mt-1">
            Confidence: {Math.round(message.confidence * 100)}%
          </p>
        )}
      </div>
    </div>
  )
}