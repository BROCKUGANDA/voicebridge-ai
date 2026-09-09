'use client'

/**
 * LoginOverlay — passphrase gate for the VoiceBridge dashboard.
 *
 * Shown when any apiFetch call gets a 401 (the `vb:unauthorized` event) or
 * when the app boots without a session. Accessibility rules it follows:
 *   - role="dialog" + aria-modal, focus moves into the form on open and
 *     returns to the previously focused element on close.
 *   - The passphrase input keeps its value on failed submit and the error is
 *     announced via aria-live; the screen-reader copy is never lost.
 *   - No dependency on color alone for the error state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { announceToScreenReader } from '@/lib/accessibility-utils'
import { VoiceBridgeLogo } from './VoiceBridgeLogo'
import { Button } from '@/components/ui/button'
import { KeyRound, Loader2 } from 'lucide-react'

export function LoginOverlay() {
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previousFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    inputRef.current?.focus()
    announceToScreenReader('Please sign in with your VoiceBridge passphrase.', 'assertive')
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [])

  // Trap Tab focus inside the dialog while it's open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const input = inputRef.current
      const submit = document.querySelector<HTMLButtonElement>('[data-vb-login-submit]')
      if (!input) return
      const first: HTMLElement = input
      const last: HTMLElement = submit ?? input
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (busy || !passphrase) return
      setBusy(true)
      setError(null)
      try {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: { passphrase },
        })
        if (res.ok) {
          announceToScreenReader('Signed in. Loading VoiceBridge.', 'polite')
          // Reload so the app boots with the session cookie present.
          window.location.reload()
          return
        }
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        const msg =
          payload.error === 'server_misconfigured'
            ? 'Sign-in is not configured on this server. Ask your administrator.'
            : 'That passphrase was not accepted. Please try again.'
        setError(msg)
        announceToScreenReader(msg, 'assertive')
        inputRef.current?.focus()
      } catch {
        setError('Network error. Check your connection and try again.')
      } finally {
        setBusy(false)
      }
    },
    [busy, passphrase],
  )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0E17]/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to VoiceBridge AI"
    >
      <form
        className="vb-glass w-full max-w-sm mx-4 rounded-2xl p-8 flex flex-col gap-5"
        onSubmit={submit}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <VoiceBridgeLogo size={48} />
          <h1 className="text-xl font-bold text-white">
            Sign in to <span className="vb-gradient-text">VoiceBridge AI</span>
          </h1>
          <p className="text-sm text-[#9AA4B2]">
            Enter your passphrase to unlock your voice assistant dashboard.
          </p>
        </div>

        <label htmlFor="vb-passphrase" className="sr-only">
          Passphrase
        </label>
        <div className="relative">
          <KeyRound className="w-4 h-4 text-[#8B98A8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={inputRef}
            id="vb-passphrase"
            type="password"
            autoComplete="current-password"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-[#8B98A8] focus-visible:outline-2 focus-visible:outline-[#00F0FF] focus-visible:outline-offset-2"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            aria-describedby={error ? 'vb-login-error' : undefined}
            aria-invalid={!!error}
            disabled={busy}
            minLength={8}
            required
          />
        </div>

        {error && (
          <p id="vb-login-error" role="alert" className="text-sm text-[#FF8A80] border border-[#FF8A80]/30 rounded-lg px-3 py-2 bg-[#FF8A80]/10">
            {error}
          </p>
        )}

        <Button
          type="submit"
          data-vb-login-submit
          className="w-full bg-[#00F0FF] text-[#0A0E17] hover:bg-[#00F0FF]/90 font-medium"
          disabled={busy || passphrase.length < 8}
          aria-label="Sign in"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </div>
  )
}
