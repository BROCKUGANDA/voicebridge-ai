import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId = body.userId || 'default-user'

    // End any existing active sessions
    await db.voiceSession.updateMany({
      where: { userId, status: 'active', endedAt: null },
      data: { status: 'ended', endedAt: new Date() },
    })

    // Ensure user exists
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, name: 'VoiceBridge User' },
    })

    // Create new session
    const session = await db.voiceSession.create({
      data: {
        userId,
        status: 'active',
      },
    })

    return NextResponse.json({ session })
  } catch (error) {
    console.error('Failed to create session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, status } = body

    const session = await db.voiceSession.update({
      where: { id: sessionId },
      data: {
        status: status || 'ended',
        endedAt: status === 'ended' ? new Date() : undefined,
      },
    })

    return NextResponse.json({ session })
  } catch (error) {
    console.error('Failed to update session:', error)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || 'default-user'
    const limit = parseInt(searchParams.get('limit') || '10')

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
  } catch (error) {
    console.error('Failed to fetch sessions:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}
