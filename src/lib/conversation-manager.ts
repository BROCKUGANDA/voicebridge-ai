// Conversation context management for multi-turn dialogue

export interface ConversationContext {
  turnCount: number
  lastIntent: string | null
  lastAction: string | null
  currentPage: string
  recentTopics: string[]
  userMood: 'neutral' | 'confident' | 'frustrated' | 'curious'
  pendingAction: string | null
}

export function createContext(): ConversationContext {
  return {
    turnCount: 0,
    lastIntent: null,
    lastAction: null,
    currentPage: typeof window !== 'undefined' ? window.location.href : '',
    recentTopics: [],
    userMood: 'neutral',
    pendingAction: null,
  }
}

export function updateContext(
  ctx: ConversationContext,
  intent: string,
  userText: string,
  success: boolean
): ConversationContext {
  const newCtx = { ...ctx }
  newCtx.turnCount++
  newCtx.lastIntent = intent
  newCtx.lastAction = success ? intent : null
  newCtx.currentPage = typeof window !== 'undefined' ? window.location.href : ctx.currentPage

  // Track topics
  if (userText.length > 5) {
    newCtx.recentTopics = [...ctx.recentTopics, userText].slice(-10)
  }

  // Detect mood from interaction patterns
  if (ctx.turnCount > 3) {
    const recentSuccess = success
    if (!recentSuccess && ctx.userMood === 'neutral') {
      newCtx.userMood = 'frustrated'
    } else if (recentSuccess && ctx.userMood === 'frustrated') {
      newCtx.userMood = 'neutral'
    }
    if (userText.includes('?') || userText.toLowerCase().includes('how')) {
      newCtx.userMood = 'curious'
    }
  }

  return newCtx
}

export function getContextualPrefix(ctx: ConversationContext): string {
  if (ctx.turnCount === 0) return ''

  const parts: string[] = []

  if (ctx.lastAction && ctx.turnCount <= 3) {
    parts.push(`Following up on your previous request.`)
  }

  if (ctx.userMood === 'frustrated') {
    parts.push('I understand this may be frustrating. Let me try a different approach.')
  }

  if (ctx.pendingAction) {
    parts.push(`Continuing with ${ctx.pendingAction}.`)
  }

  return parts.join(' ')
}

export function buildSystemPrompt(ctx: ConversationContext): string {
  const parts = [
    'You are VoiceBridge AI, a voice-first accessibility assistant designed for users with visual impairments.',
    'Your role is to help users navigate and understand digital interfaces through voice commands.',
    'Always be clear, concise, and provide spatial references when describing elements.',
    'Use directional language (upper right, lower left) to help orient users.',
    'When describing images, be detailed and specific about visual content.',
    'If a command fails, suggest alternatives and remain encouraging.',
    'Current context:',
  ]

  if (ctx.lastIntent) {
    parts.push(`- Last action: ${ctx.lastIntent}`)
  }

  if (ctx.currentPage) {
    parts.push(`- Current page: ${ctx.currentPage}`)
  }

  if (ctx.recentTopics.length > 0) {
    parts.push(`- Recent topics discussed: ${ctx.recentTopics.slice(-3).join(', ')}`)
  }

  if (ctx.userMood !== 'neutral') {
    parts.push(`- User appears ${ctx.userMood}`)
  }

  return parts.join('\n')
}
