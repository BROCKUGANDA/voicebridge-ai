/**
 * Mints a single-use temporary token for the AssemblyAI Voice Agent API.
 *
 * Per docs (Section 10 / browser-integration guide):
 *   - `expires_in_seconds`: 1–600
 *   - `max_session_duration_seconds`: 60–10800
 *   - Voice Agent API requires `Authorization: Bearer <key>`
 *   - Tokens are single-use per session — fresh token for every reconnect,
 *     including `session.resume`.
 *
 * Security:
 *   - Wrapped by `withApi({ requireAuth: true })` so a valid session
 *     cookie is mandatory.
 *   - CSRF skipped: the browser cannot set custom headers on a WebSocket
 *     and the token itself is the bearer credential for the upstream
 *     session. The cookie-level auth still gates access.
 *   - Rate-limited to 10/min (token mints cost a round-trip upstream).
 *   - Every mint and every failure is recorded in the audit log.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  withApi,
  audit,
  redactPii,
  getSession,
} from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AGENT_TOKEN_URL = 'https://agents.assemblyai.com/v1/token'

async function handler(req: NextRequest) {
  const session = getSession(req)
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'ASSEMBLYAI_API_KEY is not set.' },
      { status: 500 },
    )
  }

  const url = new URL(AGENT_TOKEN_URL)
  url.searchParams.set('expires_in_seconds', '300')
  // 3 hours is the documented max (10800 s) and the worst-case billing
  // exposure if the user forgets to end the session.
  url.searchParams.set('max_session_duration_seconds', '10800')

  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
  } catch (err) {
    const m = err instanceof Error ? err.message : 'network error'
    audit({
      req,
      action: 'agent-token-upstream-failed',
      detail: redactPii(m),
      userId: session?.userId ?? null,
      ok: false,
    })
    return NextResponse.json({ error: 'upstream_unreachable' }, { status: 502 })
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    audit({
      req,
      action: 'agent-token-upstream-failed',
      detail: `status=${upstream.status}`,
      userId: session?.userId ?? null,
      ok: false,
    })
    return NextResponse.json(
      { error: 'upstream_failed', status: upstream.status, detail: text.slice(0, 256) },
      { status: 502 },
    )
  }

  const data = (await upstream.json()) as { token?: string }
  if (!data.token) {
    return NextResponse.json({ error: 'upstream_no_token' }, { status: 502 })
  }
  audit({
    req,
    action: 'agent-token-minted',
    detail: 'expires_in=300',
    userId: session?.userId ?? null,
    ok: true,
  })
  // agent_id is optional: when set (via scripts/publish-agent.mjs), the
  // browser binds with `{ session: { agent_id } }` — the recommended
  // AssemblyAI deploy path. Inline config remains the fallback.
  const agentId = process.env.ASSEMBLYAI_AGENT_ID || null
  return NextResponse.json({ token: data.token, agentId })
}

export const GET = withApi(handler, {
  requireAuth: true,
  skipCsrf: true,
  rateLimit: { rpm: 10, burst: 3 },
})
