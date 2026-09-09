/**
 * /api/auth/logout — clears the session + CSRF cookies.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  clearSession,
  applySecurityHeaders,
  audit,
  withApi,
  getSession,
} from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const session = getSession(req)
  const res = NextResponse.json({ ok: true })
  clearSession(res)
  res.cookies.set('vb_csrf', '', { path: '/', maxAge: 0 })
  audit({
    req,
    action: 'logout',
    detail: '',
    userId: session?.userId ?? null,
    ok: true,
  })
  return applySecurityHeaders(res)
}

export const POST = withApi(handler)
