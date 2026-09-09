import { NextRequest, NextResponse } from 'next/server'
import { AgentToolsBody, assertMethodAllowed } from '@/lib/api-schemas'
import {
  withApi,
  applySecurityHeaders,
  audit,
  assertSession,
  type SessionWithRole,
} from '@/lib/security'

/**
 * Single dispatcher tool for the VoiceBridge voice agent.
 *
 * The agent's only tool is `dispatch_tool`, which takes (endpoint, method,
 * query, body) and proxies to one of our six existing API routes. This keeps
 * the agent surface tiny (one tool) while exposing the full VoiceBridge API
 * catalogue — and it matches the pre-existing voice-agent-config.ts design.
 *
 * Body contract:
 *   { call_id, name: 'dispatch_tool', arguments: { endpoint, method, query?, body? } }
 *
 * Returns:
 *   { call_id, ok: true, result: <route body> }      on 2xx
 *   { call_id, ok: false, error: '<reason>' }        on tool-level failure
 *
 * We deliberately return 200 for tool-level errors so the agent can speak
 * the error to the user. Returning non-2xx would only mark the dispatch as
 * failed upstream with no useful message.
 *
 * Security:
 *   - Strict Zod validation via AgentToolsBody (rejects unknown keys).
 *   - Per-endpoint method allowlist enforced (defense-in-depth).
 *   - requireAuth: a session cookie is MANDATORY — this route can read and
 *     write the caller's conversations, preferences and history, so it must
 *     never accept anonymous traffic.
 *   - All scoping uses the verified session userId; any client-supplied
 *     userId is stripped and overwritten.
 *   - CSRF: the browser dispatches this from our own JS via fetch (which can
 *     set headers), but the AssemblyAI WS tool-call loop can't guarantee a
 *     pre-fetched token, so SameSite=Strict session cookie is the primary
 *     CSRF defense here and the header check is skipped.
 *   - Rate-limited to 120/min per user and audited.
 */
export const runtime = 'nodejs'

const ok = (callId: string, result: unknown) =>
  applySecurityHeaders(
    NextResponse.json({ call_id: callId, ok: true, result }),
  )

const fail = (callId: string, message: string) =>
  applySecurityHeaders(
    NextResponse.json({ call_id: callId, ok: false, error: message }),
  )

async function handler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId

  // Parse + validate body.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = AgentToolsBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }

  const { call_id, name, arguments: args } = parsed.data

  if (name !== 'dispatch_tool') {
    return fail(call_id, `Unknown tool: ${name}`)
  }

  // Per-endpoint method allowlist.
  try {
    assertMethodAllowed(args.endpoint, args.method)
  } catch (err) {
    return fail(call_id, err instanceof Error ? err.message : 'method not allowed')
  }

  const endpoint = args.endpoint
  const method = args.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

  // ALWAYS scope to the verified session user — the upstream routes derive
  // identity from the forwarded session cookie, never from query params
  // (their strict query schemas reject unknown keys like userId).
  // Client-supplied userId values are dropped — they can never widen scope.
  const query: Record<string, string | number | boolean | undefined> = {
    ...(args.query ?? {}),
  }
  delete query.userId
  if (endpoint === 'voice' && !query.sessionId && args.body && typeof args.body === 'object') {
    const bodyObj = args.body as Record<string, unknown>
    if (typeof bodyObj.sessionId === 'string') {
      query.sessionId = bodyObj.sessionId
    }
  }

  const bodyOut: Record<string, unknown> | undefined =
    args.body && typeof args.body === 'object' && !Array.isArray(args.body)
      ? { ...(args.body as Record<string, unknown>) }
      : undefined
  if (bodyOut) {
    // Never let the caller impersonate another user via the body.
    delete bodyOut.userId
    // conversation/voice/vision schemas accept an explicit userId field that
    // withApi then overwrites from the verified session. session/preferences
    // schemas are .strict() WITHOUT userId — injecting it would 400 every
    // write. Only inject where the upstream schema actually allows the key.
    if (
      endpoint === 'conversation' ||
      endpoint === 'voice' ||
      endpoint === 'vision'
    ) {
      bodyOut.userId = userId
    }
  }

  try {
    const fullPath = (() => {
      if (!query || Object.keys(query).length === 0) return `/api/${endpoint}`
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) qs.set(k, String(v))
      }
      return `/api/${endpoint}?${qs.toString()}`
    })()
    const r = await callInternal(req, fullPath, {
      method,
      body: bodyOut && method !== 'GET' ? JSON.stringify(bodyOut) : undefined,
    })
    audit({
      req,
      action: 'agent-tools-dispatch',
      detail: `${method} /api/${endpoint} status=${r.status}`,
      userId,
      ok: r.ok,
    })
    if (!r.ok) {
      return fail(
        call_id,
        `Upstream ${method} /api/${endpoint} returned ${r.status}`,
      )
    }
    return ok(call_id, r.body)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Tool dispatch failed'
    return fail(call_id, message)
  }
}

export const POST = withApi(handler, {
  requireAuth: true,
  skipCsrf: true,
  skipBotCheck: true, // the WS-driven fetch may carry minimal headers
  rateLimit: { rpm: 120, burst: 30 },
})

/**
 * Internal route handlers return JSON. We forward both the result and any
 * HTTP error so the agent can speak a meaningful error to the user instead
 * of a generic "tool failed".
 *
 * Prefer the inbound request's host/protocol so self-fetch always lands on
 * THIS process (dev port, LAN IP, reverse-proxied host). Only fall back to
 * INTERNAL_BASE_URL when the inbound host is missing/unusable — never the
 * reverse, or a stale env pin silently dispatches to another app.
 */
async function callInternal(req: NextRequest, path: string, init: RequestInit) {
  const inboundHost = req.headers.get('host') || req.nextUrl.host
  const inboundProto =
    req.headers.get('x-forwarded-proto') ||
    req.nextUrl.protocol.replace(':', '') ||
    'http'
  const baseUrl =
    inboundHost && inboundHost !== 'undefined'
      ? `${inboundProto}://${inboundHost}`
      : (process.env.INTERNAL_BASE_URL ?? 'http://localhost:3000')
  const url = new URL(path, baseUrl)
  // Forward the caller's session cookie AND CSRF token on this
  // server-to-server hop: upstream routes are session-scoped (requireAuth)
  // and state-changing methods still enforce double-submit CSRF. Without
  // the CSRF header every POST/PUT/PATCH dispatch 403s.
  const cookie = req.headers.get('cookie')
  const csrf = req.headers.get('x-vb-csrf')
  const res = await fetch(url.toString(), {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-vb-csrf': csrf } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { ok: res.ok, status: res.status, body: parsed }
}