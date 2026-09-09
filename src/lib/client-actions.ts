/**
 * Client-side command executor — the practical half of VoiceBridge.
 *
 * Fallback engines (Vosk / Web Speech / text input) only produce a
 * transcript. Without this module they could not switch panels, describe
 * the live DOM, or read content — the cloud agent's tools only touch the
 * API, not the running dashboard. Local intents run here so the product
 * stays useful offline and when AssemblyAI is down.
 */

import { parseIntent, type ParsedIntent } from './voice-processor'
import { analyzePage, describeElement } from './vision-analyzer'

export type PanelId =
  | 'home'
  | 'conversation'
  | 'visual'
  | 'metrics'
  | 'sound'
  | 'accessibility'
  | 'keyboard'
  | 'settings'

export interface ClientActionContext {
  setActivePanel: (panel: PanelId) => void
  openSettings?: () => void
  speak: (text: string) => void
  /** Optional: stop TTS when the user says stop/cancel. */
  stopSpeaking?: () => void
}

export interface ClientActionResult {
  handled: boolean
  reply: string
  intent: string
  /** True when the action should also be logged as a successful command. */
  success: boolean
}

const PANEL_ALIASES: Record<string, PanelId> = {
  home: 'home',
  dashboard: 'home',
  chat: 'conversation',
  conversation: 'conversation',
  transcript: 'conversation',
  visual: 'visual',
  vision: 'visual',
  metrics: 'metrics',
  stats: 'metrics',
  sound: 'sound',
  audio: 'sound',
  accessibility: 'accessibility',
  a11y: 'accessibility',
  keyboard: 'keyboard',
  keys: 'keyboard',
  shortcuts: 'keyboard',
  settings: 'settings',
  preferences: 'settings',
}

const PANEL_LABEL: Record<PanelId, string> = {
  home: 'Home',
  conversation: 'Conversation',
  visual: 'Vision',
  metrics: 'Metrics',
  sound: 'Sound',
  accessibility: 'Accessibility',
  keyboard: 'Keyboard shortcuts',
  settings: 'Settings',
}

/** Map a spoken panel name (or sentence fragment) to a nav id. */
export function matchPanel(text: string): PanelId | null {
  const t = text.toLowerCase()
  // Prefer longer keys first so "keyboard shortcuts" wins over "keys".
  const keys = Object.keys(PANEL_ALIASES).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    if (t.includes(k)) return PANEL_ALIASES[k]
  }
  return null
}

/**
 * Execute a local dashboard action from free text.
 * Returns `{ handled: false }` when the caller should fall through to
 * the server dispatcher / cloud agent.
 */
export function executeClientAction(
  text: string,
  ctx: ClientActionContext,
): ClientActionResult {
  const intent = parseIntent(text)
  return runIntent(intent, ctx, text)
}

function runIntent(
  intent: ParsedIntent,
  ctx: ClientActionContext,
  raw: string,
): ClientActionResult {
  const t = raw.trim().toLowerCase()

  // Explicit stop / cancel — silence TTS and stay put.
  if (intent.intent === 'cancel' || /^(stop|quiet|silence|shut up)\b/.test(t)) {
    ctx.stopSpeaking?.()
    return { handled: true, reply: 'Stopped.', intent: 'cancel', success: true }
  }

  // Panel navigation: "open metrics", "go to settings", "switch to sound"
  const navMatch =
    t.match(
      /^(?:please\s+)?(?:open|go to|show|switch to|navigate to|take me to)\s+(?:the\s+)?(.+)$/,
    ) ?? t.match(/^(?:the\s+)?(home|metrics|settings|sound|vision|visual|chat|conversation|accessibility|keyboard|a11y|keys)(?:\s+panel)?$/)

  if (navMatch) {
    const panel = matchPanel(navMatch[1] ?? t)
    if (panel) {
      ctx.setActivePanel(panel)
      if (panel === 'settings') ctx.openSettings?.()
      const reply = `Opening ${PANEL_LABEL[panel]}.`
      ctx.speak(reply)
      return { handled: true, reply, intent: 'navigate_panel', success: true }
    }
  }

  // Help
  if (intent.intent === 'help') {
    const reply =
      'You can say: describe the page, read content, open metrics, open settings, go home, or stop. Type commands work too.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'help', success: true }
  }

  // Describe page / element
  if (intent.intent === 'describe_page') {
    try {
      const analysis = analyzePage()
      ctx.speak(analysis.description)
      return {
        handled: true,
        reply: analysis.description,
        intent: 'describe_page',
        success: true,
      }
    } catch {
      const reply = 'I was unable to analyze the page.'
      ctx.speak(reply)
      return { handled: true, reply, intent: 'describe_page', success: false }
    }
  }

  if (intent.intent === 'describe_element' && intent.entities.target) {
    const reply = describeElement(intent.entities.target)
    ctx.speak(reply)
    return { handled: true, reply, intent: 'describe_element', success: true }
  }

  // Read main content
  if (intent.intent === 'read_page') {
    const main =
      document.querySelector<HTMLElement>('main, [role="main"]') ?? document.body
    const text = (main.innerText || '').trim().slice(0, 2400)
    const reply = text || 'No readable content found on this page.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'read_page', success: true }
  }

  // Scroll
  if (intent.intent === 'scroll') {
    const dir = (intent.entities.direction ?? 'down').toLowerCase()
    const delta =
      dir === 'up' || dir === 'left' ? -320 : dir === 'right' ? 320 : 320
    window.scrollBy({ top: dir === 'up' ? delta : dir === 'down' ? delta : 0, left: dir === 'left' ? delta : dir === 'right' ? delta : 0, behavior: 'smooth' })
    const reply = `Scrolled ${dir}.`
    ctx.speak(reply)
    return { handled: true, reply, intent: 'scroll', success: true }
  }

  // History
  if (intent.intent === 'navigate_back') {
    window.history.back()
    const reply = 'Going back.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'navigate_back', success: true }
  }
  if (intent.intent === 'navigate_forward') {
    window.history.forward()
    const reply = 'Going forward.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'navigate_forward', success: true }
  }

  // Practical session controls (voice-accessible, no cloud required).
  if (/\b(export|download)\b.*\b(transcript|conversation|chat)\b/.test(t)) {
    window.dispatchEvent(new CustomEvent('vb:export-transcript'))
    const reply = 'Downloading your conversation transcript.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'export_transcript', success: true }
  }
  if (/\b(clear|reset|wipe)\b.*\b(conversation|transcript|chat|history)\b/.test(t)) {
    window.dispatchEvent(new CustomEvent('vb:clear-conversation'))
    const reply = 'Conversation cleared.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'clear_conversation', success: true }
  }
  if (/\b(mute|silence)\b.*\b(sound|audio|output|voice)\b/.test(t) || t === 'mute') {
    window.dispatchEvent(new CustomEvent('vb:mute', { detail: true }))
    const reply = 'Sound muted.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'mute', success: true }
  }
  if (/\b(unmute)\b/.test(t)) {
    window.dispatchEvent(new CustomEvent('vb:mute', { detail: false }))
    const reply = 'Sound unmuted.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'unmute', success: true }
  }
  // Repeat last assistant reply — core accessibility recovery command.
  if (/^(repeat( that)?|say (that |it )?again|what did you say)\b/.test(t)) {
    const last = window.__vbLastReply
    if (last) {
      ctx.speak(last)
      return { handled: true, reply: last, intent: 'repeat', success: true }
    }
    const reply = 'I have not said anything yet in this session.'
    ctx.speak(reply)
    return { handled: true, reply, intent: 'repeat', success: true }
  }

  return { handled: false, reply: '', intent: intent.intent, success: false }
}

// Bridge last assistant reply for the "repeat" command without a store import
// cycle (client-actions is pure/local; voice store is set by the UI layer).
declare global {
  interface Window {
    __vbLastReply?: string
  }
}
