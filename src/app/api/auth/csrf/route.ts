/**
 * /api/auth/csrf — issue a fresh CSRF token. The client reads the
 * `vb_csrf` cookie and echoes it back in the `X-Vb-Csrf` header on
 * every state-changing request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { issueCsrfCookie, applySecurityHeaders, withApi } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(_req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  const token = issueCsrfCookie(res)
  res.headers.set('X-CSRF-Token', token)
  return applySecurityHeaders(res)
}

export const GET = withApi(handler, { skipCsrf: true })
