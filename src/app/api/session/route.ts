import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withApi, assertOwnedBy, assertSession, audit, type SessionWithRole } from '@/lib/security'

/**
 * Voice session lifecycle — wrapped by withApi. PATCH validates that the
 * session belongs to the calling user.
 */

const SessionPostBody = z
  .object({
    sessionId: z.string().max(64).optional(),
  })
  .strict()

const SessionPatchBody = z
  .object({
    sessionId: z.string().min(1).max(64),
    status: z.enum(['active', 'ended', 'paused']).optional(),
    duration: z.number().int().nonnegative().optional(),
  })
  .strict()

const SessionGetQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

async function postHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  let body: unknown
  try {
    body = (await req.json()) ?? {}
  } catch {
    body = {}
  }
  const parsed = SessionPostBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  // End any existing active sessions for this user.
  await db.voiceSession.updateMany({
    where: { userId, status: 'active', endedAt: null },
    data: { status: 'ended', endedAt: new Date() },
  })
  await db.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, name: 'VoiceBridge User' },
  })
  const created = await db.voiceSession.create({ data: { userId, status: 'active' } })
  return NextResponse.json({ session: created })
}

export const POST = withApi(postHandler, { requireAuth: true, rateLimit: { rpm: 30, burst: 10 } })

async function patchHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = SessionPatchBody.safeParse(body)
  if (!parsed.success) {
    audit({
      req,
      action: 'session-bad-input',
      detail: parsed.error.message.slice(0, 256),
      userId,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, status, duration } = parsed.data

  // Ownership check FIRST — never leak whether a session exists.
  const existing = await db.voiceSession.findUnique({ where: { id: sessionId } })
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  assertOwnedBy(existing.userId, userId, 'voiceSession')

  const updated = await db.voiceSession.update({
    where: { id: sessionId },
    data: {
      status: status ?? 'ended',
      endedAt: status === 'ended' ? new Date() : existing.endedAt,
      duration: duration ?? existing.duration,
    },
  })
  return NextResponse.json({ session: updated })
}

export const PATCH = withApi(patchHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })

async function getHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  const { searchParams } = new URL(req.url)
  const obj: Record<string, string> = {}
  searchParams.forEach((v, k) => (obj[k] = v))
  const parsed = SessionGetQuery.safeParse(obj)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { limit = 10 } = parsed.data
  const sessions = await db.voiceSession.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      conversations: {
        include: { messages: true },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  return NextResponse.json({ sessions })
}

export const GET = withApi(getHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })
