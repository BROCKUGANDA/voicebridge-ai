/**
 * /api/auth/login — exchanges a passphrase for a session cookie.
 *
 * Single-user demo: there is no user table; the "passphrase" is configured
 * via VOICEBRIDGE_AUTH_PASSPHRASE. In a multi-user setup this would be a
 * Stytch/OAuth session exchange.
 *
 * Hardening: there is NO default passphrase. If the env var is unset we
 * refuse every login attempt with a clear server-misconfiguration error
 * rather than accepting a guessable shared secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import {
  issueSession,
  issueCsrfCookie,
  applySecurityHeaders,
  audit,
  withApi,
} from '@/lib/security'
import { AuthLoginBody } from '@/lib/api-schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SESSION_USER = process.env.VOICEBRIDGE_AUTH_USER ?? 'default-user'

function expectedPassphrase(): { ok: true; value: string } | { ok: false } {
  const v = process.env.VOICEBRIDGE_AUTH_PASSPHRASE
  if (!v || v.length < 8) return { ok: false }
  return { ok: true, value: v }
}

async function handler(req: NextRequest) {
  const expected = expectedPassphrase()
  if (!expected.ok) {
    audit({
      req,
      action: 'login-server-misconfigured',
      detail: 'VOICEBRIDGE_AUTH_PASSPHRASE missing or too short',
      userId: null,
      ok: false,
    })
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'Auth is not configured on this server.' },
      { status: 503 },
    )
  }

  // Parse + validate body.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = AuthLoginBody.safeParse(raw)
  if (!parsed.success) {
    audit({
      req,
      action: 'login-bad-input',
      detail: parsed.error.message,
      userId: null,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }

  // Constant-time compare (hash both sides so length never short-circuits).
  const expHash = createHash('sha256').update(expected.value).digest()
  const gotHash = createHash('sha256').update(parsed.data.passphrase).digest()
  if (!timingSafeEqual(expHash, gotHash)) {
    audit({
      req,
      action: 'login-failed',
      detail: 'wrong passphrase',
      userId: null,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_credentials' },
      { status: 401 },
    )
  }

  const res = NextResponse.json({ ok: true, userId: SESSION_USER })
  issueSession(res, SESSION_USER)
  issueCsrfCookie(res)
  audit({
    req,
    action: 'login-success',
    detail: `user=${SESSION_USER}`,
    userId: SESSION_USER,
    ok: true,
  })
  return applySecurityHeaders(res)
}

export const POST = withApi(handler, {
  rateLimit: { rpm: 30, burst: 5 },
  skipCsrf: true, // the client doesn't have a CSRF token yet on first login
  skipBotCheck: true, // login form must work even from curl during dev
})
