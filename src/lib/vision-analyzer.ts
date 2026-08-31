// Client-side visual/DOM analysis engine for VoiceBridge AI
// Analyzes the current page DOM to provide accessibility descriptions

export interface AnalyzedElement {
  type: string
  tag: string
  label: string
  description: string
  role: string
  bounds: { x: number; y: number; width: number; height: number }
 interactive: boolean
  hasText: boolean
  textContent: string
  altText: string
  ariaAttributes: Record<string, string>
 confidence: number
}

export interface PageAnalysis {
  title: string
  url: string
  description: string
  elementCount: number
  interactiveElements: number
  images: number
  forms: number
  landmarks: string[]
  elements: AnalyzedElement[]
 headings: string[]
 links: string[]
 overallConfidence: number
}

function getAccessibleName(el: Element): string {
 // ARIA label first
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel

  // aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy)
 if (labelEl) return labelEl.textContent?.trim() || ''
  }

  // Alt text for images
  if (el instanceof HTMLImageElement) {
    return el.alt || el.getAttribute('aria-label') || ''
  }

  // Title attribute
  const title = el.getAttribute('title')
  if (title) return title

  // Text content for buttons/links
  if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) {
    return el.textContent?.trim().substring(0, 100) || ''
  }

  // Placeholder for inputs
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.placeholder || el.getAttribute('aria-label') || el.name || ''
  }

  return ''
}

function getElementRole(el: Element): string {
  return el.getAttribute('role') || el.tagName.toLowerCase()
}

function getAriaAttributes(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('aria-')) {
      attrs[attr.name] = attr.value
    }
  }
  return attrs
}

function isInteractive(el: Element): boolean {
  const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY']
  if (interactiveTags.includes(el.tagName)) return true
  if (el.getAttribute('role')) {
    const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem', 'tab', 'slider']
    if (interactiveRoles.includes(el.getAttribute('role')!)) return true
  }
  if (el.getAttribute('tabindex') !== null) return true
  if (el.getAttribute('onclick')) return true
  return false
}

function getBounds(el: Element): { x: number; y: number; width: number; height: number } {
  const rect = el.getBoundingClientRect()
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

const IMPORTANT_SELECTORS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a[href]',
  'button',
  'input', 'select', 'textarea',
  'img',
  '[role="button"]',
  '[role="link"]',
  '[role="navigation"]',
  '[role="main"]',
  '[role="search"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="form"]',
  '[aria-label]',
  '[aria-labelledby]',
  'label',
  'table',
  'canvas',
  'svg',
]

export function analyzePage(): PageAnalysis {
  const body = document.body
  const title = document.title || 'Untitled Page'
  const url = window.location.href

  // Collect all important elements
  const elements: AnalyzedElement[] = []
  const headings: string[] = []
  const links: string[] = []
  const landmarks: string[] = []
  let imageCount = 0
  let formCount = 0

  for (const selector of IMPORTANT_SELECTORS) {
    const found = body.querySelectorAll(selector)
    found.forEach((el) => {
      // Skip hidden elements
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return
      if ((el as HTMLElement).offsetParent === null && el.tagName !== 'BODY') return

      const label = getAccessibleName(el)
      const role = getElementRole(el)
      const bounds = getBounds(el)
      const interactive = isInteractive(el)
      const textContent = el.textContent?.trim().substring(0, 200) || ''
      const altText = el instanceof HTMLImageElement ? (el.alt || '') : ''
      const ariaAttrs = getAriaAttributes(el)
      const tag = el.tagName.toLowerCase()

      // Categorize
      if (/^H[1-6]$/.test(tag)) {
        headings.push(textContent.substring(0, 100))
      }
      if (tag === 'a' && el instanceof HTMLAnchorElement && el.href) {
        links.push(label || textContent.substring(0, 100) || el.href)
      }
      if (tag === 'img') imageCount++
      if (['form', '[role="form"]'].some(s => el.matches(s))) formCount++

      // Landmarks
      const landmarkRoles = ['banner', 'navigation', 'main', 'contentinfo', 'search', 'form', 'complementary', 'region']
      const elRole = el.getAttribute('role') || ''
      if (landmarkRoles.includes(elRole) || tag === 'nav' || tag === 'main' || tag === 'header' || tag === 'footer') {
    landmarks.push(`${elRole || tag}: ${label || 'unnamed landmark'}`)
  }

      const confidence = label ? 0.95 : textContent ? 0.8 : 0.6

      elements.push({
        type: tag,
        tag,
        label: label || textContent.substring(0, 80) || tag,
        description: `${role}${label ? ': ' + label : ''}${altText ? ' (Image: ' + altText + ')' : ''}`,
        role,
        bounds,
        interactive,
        hasText: textContent.length > 0,
        textContent: textContent.substring(0, 200),
        altText,
        ariaAttributes: ariaAttrs,
        confidence,
      })
    })
  }

  // Build page description
  const interactiveElements = elements.filter((e) => e.interactive).length
  const description = buildPageDescription(title, headings, interactiveElements, imageCount, formCount, landmarks)

  return {
    title,
    url,
    description,
    elementCount: elements.length,
    interactiveElements,
    images: imageCount,
    forms: formCount,
    landmarks,
    elements: elements.slice(0, 100),
    headings,
    links: links.slice(0, 20),
    overallConfidence: 0.88,
  }
}

function buildPageDescription(
  title: string,
  headings: string[],
  interactiveCount: number,
  imageCount: number,
  formCount: number,
  landmarks: string[]
): string {
  const parts: string[] = []

  parts.push(`Page titled "${title}".`)

  if (headings.length > 0) {
    parts.push(`It contains ${headings.length} heading(s). The first heading is "${headings[0]}".`)
  }

  parts.push(`There are ${interactiveCount} interactive element(s) such as buttons and links.`)

  if (imageCount > 0) {
    parts.push(`The page contains ${imageCount} image(s).`)
  }

  if (formCount > 0) {
    parts.push(`There ${formCount === 1 ? 'is' : 'are'} ${formCount} form(s) on the page.`)
  }

  if (landmarks.length > 0) {
    parts.push(`Page regions include: ${landmarks.join(', ')}.`)
  }

  return parts.join(' ')
}

export function describeElement(query: string): string {
  const body = document.body

  // Try to find element by various strategies
  const strategies = [
    () => body.querySelector(`[aria-label*="${query}" i]`),
    () => body.querySelector(`[id*="${query}" i]`),
    () => {
      const buttons = Array.from(body.querySelectorAll('button'))
      return buttons.find((b) => b.textContent?.toLowerCase().includes(query.toLowerCase()))
    },
    () => {
      const links = Array.from(body.querySelectorAll('a'))
      return links.find((a) => a.textContent?.toLowerCase().includes(query.toLowerCase()))
    },
    () => body.querySelector(`[placeholder*="${query}" i]`),
  ]

  for (const strategy of strategies) {
    const el = strategy()
    if (el) {
      const rect = el.getBoundingClientRect()
      const name = getAccessibleName(el)
      const tag = el.tagName.toLowerCase()
      const text = el.textContent?.trim().substring(0, 200) || ''
      const position = describePosition(rect)

      let desc = `Found a ${tag} element`
      if (name) desc += ` labeled "${name}"`
      desc += ` positioned ${position}`
      if (text && tag !== 'img') desc += `. It contains the text: "${text.substring(0, 150)}"`
      if (el instanceof HTMLImageElement && el.alt) desc += `. Alt text: "${el.alt}"`
      if (isInteractive(el)) desc += `. This is an interactive element you can click or activate.`

      return desc
    }
  }

  return `I could not find an element matching "${query}" on the current page.`
}

function describePosition(rect: DOMRect): string {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  let horizontal = 'center'
  if (cx < vw * 0.33) horizontal = 'on the left'
  else if (cx > vw * 0.66) horizontal = 'on the right'

  let vertical = 'in the middle'
  if (cy < vh * 0.33) vertical = 'near the top'
  else if (cy > vh * 0.66) vertical = 'near the bottom'

  return `${horizontal} ${vertical} of the screen`
}