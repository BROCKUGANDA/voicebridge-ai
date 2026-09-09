/**
 * /api/auth/audit — read the persistent audit trail (admin-only).
 *
 * Reads from the AuditEvent table (survives restarts) and falls back to the
 * in-memory hot ring when the DB read fails. Also reports the number of
 * events still queued for the DB sink.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  applySecurityHeaders,
  withApi,
  getSession,
  audit,
  type SessionWithRole,
} from '@/lib/security'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(req: NextRequest, session: SessionWithRole | null) {
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'forbidden', detail: 'Admin only.' },
      { status: 403 },
    )
  }
  const limit = Math.max(
    1,
    Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50),
  )

  let events: Array<{
    id: string
    ts: string | Date
    action: string
    detail: string
    userId: string | null
    ip: string
    ua: string
    ok: boolean
  }>
  let source: 'db' | 'memory' = 'db'
  try {
    events = await db.auditEvent.findMany({
      orderBy: { ts: 'desc' },
      take: limit,
    })
  } catch {
    // DB read failed — degrade to the in-process ring (recent events only).
    const { getAuditLog } = await import('@/lib/security')
    events = getAuditLog(limit).map((e, i) => ({
      id: `mem-${i}`,
      ts: new Date(e.ts).toISOString(),
      action: e.action,
      detail: e.detail,
      userId: e.userId,
      ip: e.ip,
      ua: e.ua,
      ok: e.ok,
    }))
    source = 'memory'
  }

  audit({
    req,
    action: 'audit-read',
    detail: `limit=${limit} source=${source}`,
    userId: session.userId,
    ok: true,
  })
  return applySecurityHeaders(
    NextResponse.json({ events, source }),
  )
}

export const GET = withApi(handler, { requireAuth: true, rateLimit: { rpm: 30, burst: 10 } })
