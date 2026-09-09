'use client'

/**
 * TextInputFallback — last-resort engine (#4). Always rendered under the
 * power controls when the orchestrator has fallen through to text-input,
 * and always available as a manual override so the dashboard stays usable
 * even with no mic, no model, and no cloud token.
 */

import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'

export interface TextInputFallbackProps {
  onSubmit: (text: string) => void | Promise<void>
  /** When true, the form is the primary input (engine #4). */
  primary?: boolean
  disabled?: boolean
}

export function TextInputFallback({ onSubmit, primary = false, disabled = false }: TextInputFallbackProps) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      const text = value.trim()
      if (!text || busy || disabled) return
      setBusy(true)
      try {
        await onSubmit(text)
        setValue('')
      } finally {
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [value, busy, disabled, onSubmit],
  )

  return (
    <form
      onSubmit={submit}
      className={`flex w-full max-w-md items-center gap-2 ${
        primary ? 'mt-1' : 'mt-2 opacity-90'
      }`}
      aria-label="Type a command for VoiceBridge"
    >
      <label htmlFor="vb-text-command" className="sr-only">
        Type a voice command
      </label>
      <input
        ref={inputRef}
        id="vb-text-command"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Try "describe the page", "help", or "switch to metrics"'
        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[#8B98A8] focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-2"
        disabled={busy || disabled}
        maxLength={500}
        autoComplete="off"
      />
      <Button
        type="submit"
        size="sm"
        className="h-9 rounded-xl bg-[#00F0FF] text-[#0A0E17] hover:bg-[#00F0FF]/90"
        disabled={busy || disabled || !value.trim()}
        aria-label="Send typed command"
      >
        <Send className="w-4 h-4" />
      </Button>
    </form>
  )
}
