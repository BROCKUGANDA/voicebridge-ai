import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, sessionId, command, response, success, responseTimeMs, metadata } = body

    // Save to interaction history
    const interaction = await db.interactionHistory.create({
      data: {
        userId: userId || 'default-user',
        sessionId,
        type: 'voice_command',
        command,
        response,
        success: success ?? true,
        responseTimeMs,
        metadata: JSON.stringify(metadata || {}),
      },
    })

    // Update session metrics
    if (sessionId) {
      const session = await db.voiceSession.findUnique({ where: { id: sessionId } })
      if (session) {
        await db.voiceSession.update({
          where: { id: sessionId },
          data: {
            commandCount: session.commandCount + 1,
            successCount: success ? session.successCount + 1 : session.successCount,
            errorCount: success ? session.errorCount : session.errorCount + 1,
          },
        })
      }
    }

    return NextResponse.json({ interaction })
  } catch (error) {
    console.error('Failed to process voice command:', error)
    return NextResponse.json({ error: 'Failed to process voice command' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const limit = parseInt(searchParams.get('limit') || '50')

    const interactions = await db.interactionHistory.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const formatted = interactions.map((i) => ({
      ...i,
      metadata: JSON.parse(i.metadata),
    }))

    return NextResponse.json({ interactions: formatted })
  } catch (error) {
    console.error('Failed to fetch interactions:', error)
    return NextResponse.json({ error: 'Failed to fetch interactions' }, { status: 500 })
  }
}
