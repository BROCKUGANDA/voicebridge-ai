import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  withApi,
  assertOwnedBy,
  assertSession,
  audit,
  type SessionWithRole,
} from '@/lib/security'
import { getSession } from '@/lib/security'

/**
 * Conversation routes — fully wrapped by withApi (auth + CSRF + rate limit
 * + security headers). The userId in the body is IGNORED — we always use
 * the verified session identity. Cross-tenant access is rejected via
 * `assertOwnedBy` before any read.
 */

// ----- POST /api/conversation -----
const ConversationPostBody = z
  .object({
    sessionId: z.string().max(64).optional(),
    title: z.string().max(200).optional(),
    message: z
      .object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1).max(8_000),
        confidence: z.number().min(0).max(1).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .strict()

async function postHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = ConversationPostBody.safeParse(body)
  if (!parsed.success) {
    audit({
      req,
      action: 'conversation-bad-input',
      detail: parsed.error.message.slice(0, 256),
      userId,
      ok: false,
    })
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, title, message } = parsed.data

  // Find existing conversation for this user + session.
  let conversation: { id: string; userId: string; sessionId: string | null; title: string; context: string; createdAt: Date; updatedAt: Date } | null = null
  if (sessionId) {
    const found = await db.conversation.findFirst({
      where: { userId, sessionId },
      orderBy: { createdAt: 'desc' },
    })
    if (found) {
      assertOwnedBy(found.userId, userId, 'conversation')
      conversation = found
    }
  }

  if (!conversation) {
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, name: 'VoiceBridge User' },
    })
    const created = await db.conversation.create({
      data: {
        userId,
        sessionId: sessionId ?? null,
        title: title || 'New Conversation',
      },
    })
    conversation = created
  }

  let savedMessage: { id: string; conversationId: string; role: string; content: string; confidence: number | null; metadata: string | null; createdAt: Date } | null = null
  if (message) {
    const created = await db.conversationMessage.create({
      data: {
        conversationId: conversation!.id,
        role: message.role,
        content: message.content,
        confidence: message.confidence ?? null,
        metadata: message.metadata ? JSON.stringify(message.metadata) : undefined,
      },
    })
    savedMessage = created
  }

  audit({
    req,
    action: 'conversation-create',
    userId,
    ok: true,
  })

  return NextResponse.json({ conversation, message: savedMessage })
}

export const POST = withApi(postHandler, { requireAuth: true, rateLimit: { rpm: 60, burst: 20 } })

// ----- GET /api/conversation -----
const ConversationGetQuery = z
  .object({
    sessionId: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

async function getHandler(req: NextRequest, session: SessionWithRole | null) {
  const s = assertSession(session)
  const userId = s.userId
  const { searchParams } = new URL(req.url)
  const obj: Record<string, string> = {}
  searchParams.forEach((v, k) => (obj[k] = v))
  const parsed = ConversationGetQuery.safeParse(obj)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', detail: parsed.error.message },
      { status: 400 },
    )
  }
  const { sessionId, limit = 50 } = parsed.data

  const conversations = await db.conversation.findMany({
    where: { userId, ...(sessionId ? { sessionId } : {}) },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: limit },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })

  // Defense-in-depth: every row must belong to the session user.
  for (const c of conversations) {
    assertOwnedBy(c.userId, userId, 'conversation')
  }

  // Trim each conversation to a safe projection. Messages ARE included —
  // the client needs them to restore the transcript after a reload.
  const safe = conversations.slice(0, 20).map((c) => ({
    id: c.id,
    userId: c.userId,
    sessionId: c.sessionId,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messages: (c.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      confidence: m.confidence,
      createdAt: m.createdAt,
    })),
  }))

  return NextResponse.json({ conversations: safe })
}

export const GET = withApi(getHandler, { requireAuth: true, rateLimit: { rpm: 120, burst: 30 } })
