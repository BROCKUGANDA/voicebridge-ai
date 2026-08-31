import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface VoiceSession {
  id: string
  startTime: number
  commandCount: number
  context: string[]
}

const sessions = new Map<string, VoiceSession>()

function getOrCreateSession(socketId: string): VoiceSession {
  let session = sessions.get(socketId)
  if (!session) {
    session = {
      id: `session-${Date.now()}`,
      startTime: Date.now(),
      commandCount: 0,
      context: [],
    }
    sessions.set(socketId, session)
  }
  return session
}

// Simple LLM response generator for hackathon demo
function generateResponse(text: string, context: string[]): string {
  const lower = text.toLowerCase()

  // Greeting
  if (/^(hi|hello|hey|greetings)/.test(lower)) {
    return 'Hello! I am VoiceBridge AI, your voice accessibility assistant. I can describe what is on your screen, read content, help you navigate, and much more. What would you like to do?'
  }

  // Describe page
  if (/describe/.test(lower) && /page|screen|what/.test(lower)) {
    return 'I have analyzed the current page. It contains a navigation sidebar on the left, a main conversation area in the center, and a visual context panel on the right. There are interactive buttons for quick actions and a large microphone button for voice input. The page uses a dark theme with high contrast for accessibility.'
  }

  // Read content
  if (/read/.test(lower) && /page|content|text|article/.test(lower)) {
    return 'The page contains the VoiceBridge AI dashboard interface. The main heading is "VoiceBridge AI" with the subtitle "Accessibility Assistant". Below that is a voice input section with a microphone button. The conversation area shows your interaction history. Quick action buttons include: Describe Page, Read Content, Find Element, Go Back, Go Forward, Refresh, and Help.'
  }

  // Help
  if (/help|command|what can/.test(lower)) {
    return 'Here are the voice commands I understand. First, describe the page to hear what is on screen. Read content to have text read aloud. Click or select an element by name to interact with it. Search for specific terms. Fill form fields with values. Navigate between pages. Adjust voice speed or volume. And you can ask me any general question. Press Space to toggle the microphone.'
  }

  // Stop/cancel
  if (/stop|cancel|never mind|forget/.test(lower)) {
    return 'Action cancelled. What would you like to do next?'
  }

  // Speed
  if (/speak.*(faster|quicker|speed)/.test(lower)) {
    return 'I will speak faster now. You can say "speak slower" to adjust back.'
  }
  if (/speak.*(slower|quiet|reduce)/.test(lower)) {
    return 'I will speak more slowly now. You can say "speak faster" to speed up.'
  }

  // Navigation
  if (/go (back|previous|return)/.test(lower)) {
    return 'Navigating to the previous page. Let me know when you would like me to describe the new content.'
  }
  if (/go (forward|next)/.test(lower)) {
    return 'Moving forward to the next page.'
  }

  // Click
  if (/click|press|select|choose/.test(lower)) {
    const match = lower.match(/(?:click|press|select|choose)\s+(?:on\s+)?(?:the\s+)?(.+)/)
    if (match && match[1]) {
      return `I will attempt to click on "${match[1]}". Let me locate that element on the page for you.`
    }
    return 'What would you like me to click on? Please specify the element name or label.'
  }

  // Search
  if (/search|find|look for/.test(lower)) {
    const match = lower.match(/(?:search|find|look for|look up)\s+(?:for\s+)?(.+)/)
    if (match && match[1]) {
      return `Searching for "${match[1]}" on the current page. I will describe any matching elements I find.`
    }
    return 'What would you like me to search for?'
  }

  // Fill form
  if (/fill|enter|type|input/.test(lower)) {
    return 'I can help you fill in form fields. Please tell me the field name and the value. For example, "fill name field with John".'
  }

  // How are you
  if (/how are you/.test(lower)) {
    return 'I am functioning well and ready to help! I am currently analyzing the VoiceBridge dashboard and all systems are operational. How can I assist you today?'
  }

  // Thank you
  if (/thank|thanks/.test(lower)) {
    return 'You are welcome! I am here to help make digital content more accessible. Is there anything else you would like me to do?'
  }

  // Default - contextual response
  const responses = [
    `I understand you said: "${text}". Let me process that request and assist you.`,
    `I heard: "${text}". I am working on fulfilling that request for you.`,
    `Thank you for the command. I am processing: "${text}".`,
  ]
  return responses[Math.floor(Math.random() * responses.length)]
}

io.on('connection', (socket) => {
  console.log(`[VoiceBridge] Client connected: ${socket.id}`)

  const session = getOrCreateSession(socket.id)

  socket.emit('session-start', {
    sessionId: session.id,
    message: 'VoiceBridge AI connected. Ready to assist.',
  })

  socket.on('voice-input', (data: { text: string; timestamp: number }) => {
    console.log(`[VoiceBridge] Voice input: ${data.text}`)

    session.commandCount++
    session.context.push(data.text)
    if (session.context.length > 20) {
      session.context.shift()
    }

    // Generate response
    const responseText = generateResponse(data.text, session.context)

    socket.emit('voice-response', {
      text: responseText,
      timestamp: Date.now(),
      sessionId: session.id,
      commandCount: session.commandCount,
      latency: Date.now() - data.timestamp,
    })
  })

  socket.on('visual-analysis', (data: { type: string; query?: string }) => {
    console.log(`[VoiceBridge] Visual analysis request: ${data.type}`)

    socket.emit('visual-response', {
      type: data.type,
      description: 'Page analysis complete. Found navigation, interactive elements, and content areas.',
      elements: [
        { type: 'button', label: 'Microphone', description: 'Voice input button' },
        { type: 'heading', label: 'VoiceBridge AI', description: 'Main heading' },
        { type: 'navigation', label: 'Sidebar', description: 'Main navigation' },
      ],
      confidence: 0.88,
      timestamp: Date.now(),
    })
  })

  socket.on('ping', (data) => {
    socket.emit('pong', { ...data, timestamp: Date.now() })
  })

  socket.on('disconnect', () => {
    console.log(`[VoiceBridge] Client disconnected: ${socket.id}`)
    sessions.delete(socket.id)
  })

  socket.on('error', (error) => {
    console.error(`[VoiceBridge] Socket error (${socket.id}):`, error)
  })
})

const PORT = 3004
httpServer.listen(PORT, () => {
  console.log(`[VoiceBridge] Voice service running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[VoiceBridge] Shutting down...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[VoiceBridge] Shutting down...')
  httpServer.close(() => process.exit(0))
})
