// Voice processing utilities for VoiceBridge AI
// Handles intent recognition, command parsing, and response formatting

export interface ParsedIntent {
  intent: string
  entities: Record<string, string>
  confidence: number
  originalText: string
}

export interface ProcessedResponse {
  text: string
  action?: {
    type: 'navigate' | 'describe' | 'control' | 'read' | 'search' | 'fill' | 'click' | 'help'
    target?: string
    value?: string
  }
  needsVisualAnalysis: boolean
  verbosity: 'concise' | 'balanced' | 'detailed'
}

const INTENT_PATTERNS: Array<{
  pattern: RegExp
  intent: string
  entities: string[]
}> = [
  // Navigation
  { pattern: /(?:go to|navigate|open|visit)\s+(.+)/i, intent: 'navigate', entities: ['target'] },
  { pattern: /(?:go |move |click )?(?:back|previous|return)/i, intent: 'navigate_back', entities: [] },
  { pattern: /(?:go |move |click )?(?:forward|next)/i, intent: 'navigate_forward', entities: [] },

  // Description
  { pattern: /(?:describe|what(?:'s| is) on|tell me about|read)\s+(?:the )?(?:page|screen|image|chart|graph|picture|photo)/i, intent: 'describe_page', entities: [] },
  { pattern: /(?:describe|what(?:'s| is)|tell me about)\s+(?:this|that|the)?\s*(.+)/i, intent: 'describe_element', entities: ['target'] },

  // Reading
  { pattern: /(?:read|recite|speak)\s+(?:the )?(?:whole )?(?:page|article|text|content|document)/i, intent: 'read_page', entities: [] },
  { pattern: /(?:read|recite)\s+(?:from|starting at)?\s*(.+)/i, intent: 'read_section', entities: ['target'] },

  // Search
  { pattern: /(?:search|find|look for|look up)\s+(?:for )?(.+)/i, intent: 'search', entities: ['query'] },

  // Form filling
  { pattern: /(?:fill|enter|type|write|input)\s+(?:in )?(?:(\w+)\s+(?:field|box))?\s*(?:with\s+)?(.+)/i, intent: 'fill_form', entities: ['field', 'value'] },
  { pattern: /(?:submit|send|confirm|complete)\s+(?:the )?(?:form|application|registration)/i, intent: 'submit_form', entities: [] },

  // Clicking / Interaction
  { pattern: /(?:click|press|select|choose|tap)\s+(?:on )?(?:the )?(.+)/i, intent: 'click', entities: ['target'] },
  { pattern: /(?:scroll|move)\s+(up|down|left|right)/i, intent: 'scroll', entities: ['direction'] },

  // Help
  { pattern: /(?:help|how|what can you|commands|instructions)/i, intent: 'help', entities: [] },
  { pattern: /(?:stop|cancel|never mind|forget it)/i, intent: 'cancel', entities: [] },

  // Settings
  { pattern: /(?:speak (?:faster|slower|quicker)|increase|decrease|speed up|slow down)\s*(?:the )?(?:speech|voice|speed|rate)?/i, intent: 'adjust_speed', entities: [] },
  { pattern: /(?:turn (?:up|down)|increase|decrease|set)\s*(?:the )?(?:volume|sound)/i, intent: 'adjust_volume', entities: [] },

  // Smart Home
  { pattern: /(?:turn (?:on|off)|toggle|switch)\s+(?:the )?(.+)/i, intent: 'smart_home', entities: ['device'] },
]

export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim().toLowerCase()

  for (const { pattern, intent, entities } of INTENT_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) {
      const entityMap: Record<string, string> = {}
      entities.forEach((name, idx) => {
        if (match[idx + 1]) {
          entityMap[name] = match[idx + 1].trim()
        }
      })

      return {
        intent,
        entities: entityMap,
        confidence: 0.92,
        originalText: text,
      }
    }
  }

  return {
    intent: 'general_chat',
    entities: {},
    confidence: 0.7,
    originalText: text,
  }
}

export function formatResponse(
  intent: ParsedIntent,
  verbosity: 'concise' | 'balanced' | 'detailed' = 'balanced'
): ProcessedResponse {
  const { intent: intentType, entities } = intent

  const responses: Record<string, { text: string; needsVisual: boolean }> = {
    navigate: {
      text: verbosity === 'concise'
        ? `Navigating to ${entities.target || 'requested page'}.`
        : verbosity === 'detailed'
          ? `I'll navigate to ${entities.target || 'the requested page'} for you. Please wait a moment while the page loads.`
          : `Navigating to ${entities.target || 'the requested page'}. Let me know when you'd like me to describe what's there.`,
      needsVisual: true,
    },
    navigate_back: {
      text: 'Going back to the previous page.',
      needsVisual: true,
    },
    navigate_forward: {
      text: 'Moving forward to the next page.',
      needsVisual: true,
    },
    describe_page: {
      text: verbosity === 'concise'
        ? 'Analyzing the current page...'
        : 'Let me analyze what is currently displayed on the screen. I will describe the layout, text content, images, and interactive elements I find.',
      needsVisual: true,
    },
    describe_element: {
      text: `Let me describe ${entities.target || 'that element'} for you.`,
      needsVisual: true,
    },
    read_page: {
      text: 'Reading the page content aloud. You can say "stop" to pause at any time.',
      needsVisual: true,
    },
    read_section: {
      text: `Reading from ${entities.target || 'the specified section'}.`,
      needsVisual: true,
    },
    search: {
      text: `Searching for "${entities.query || ''}". I'll describe the results as they appear.`,
      needsVisual: true,
    },
    fill_form: {
      text: entities.field && entities.value
        ? `Entering "${entities.value}" in the ${entities.field} field.`
        : 'I need both a field name and value to fill in. For example, "fill name field with John".',
      needsVisual: false,
    },
    submit_form: {
      text: 'Submitting the form. Please wait for confirmation.',
      needsVisual: true,
    },
    click: {
      text: `Clicking on ${entities.target || 'the element'}.`,
      needsVisual: true,
    },
    scroll: {
      text: `Scrolling ${entities.direction || 'down'}.`,
      needsVisual: false,
    },
    help: {
      text: verbosity === 'concise'
        ? 'Commands: describe page, read content, click element, search, fill form, navigate, adjust speed/volume, help.'
        : 'Here are the commands I understand: Describe the page or elements, read content aloud, click or interact with elements, search for information, fill in forms, navigate between pages, and adjust voice settings. You can also ask me general questions. What would you like to do?',
      needsVisual: false,
    },
    cancel: {
      text: 'Action cancelled.',
      needsVisual: false,
    },
    adjust_speed: {
      text: 'Voice speed adjusted. You can say "speak faster" or "speak slower" anytime.',
      needsVisual: false,
    },
    adjust_volume: {
      text: 'Volume adjusted.',
      needsVisual: false,
    },
    smart_home: {
      text: `Toggling ${entities.device || 'the device'}. Smart home control is available in the full desktop application.`,
      needsVisual: false,
    },
    general_chat: {
      text: '',
      needsVisual: false,
    },
  }

  const response = responses[intentType] || responses.general_chat

  return {
    text: response.text,
    needsVisualAnalysis: response.needsVisual,
    verbosity,
  }
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
}