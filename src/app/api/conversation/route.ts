import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const limit = parseInt(searchParams.get('limit') || '50')

    const conversations = await db.conversation.findMany({
      where: sessionId ? { sessionId } : undefined,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: limit,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Failed to fetch conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, sessionId, title, message } = body

    // Find existing conversation or create new
    let conversation
    if (sessionId) {
      conversation = await db.conversation.findFirst({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!conversation) {
      const user = await db.user.upsert({
        where: { id: userId || 'default-user' },
        update: {},
        create: { id: userId || 'default-user', name: 'VoiceBridge User' },
      })

      conversation = await db.conversation.create({
        data: {
          userId: user.id,
          sessionId,
          title: title || 'New Conversation',
        },
      })
    }

    // Add message if provided
    let savedMessage = null
    if (message) {
      savedMessage = await db.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          confidence: message.confidence,
          metadata: message.metadata ? JSON.stringify(message.metadata) : undefined,
        },
      })
    }

    return NextResponse.json({ conversation, message: savedMessage })
  } catch (error) {
    console.error('Failed to create conversation:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
