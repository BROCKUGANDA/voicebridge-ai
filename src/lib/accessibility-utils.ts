// Accessibility utility functions for VoiceBridge AI

/**
 * Announces a message to screen readers using a live region
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const id = 'vb-live-region'
  let region = document.getElementById(id) as HTMLElement | null

  if (!region) {
    region = document.createElement('div')
    region.id = id
    region.setAttribute('role', priority === 'assertive' ? 'alert' : 'status')
    region.setAttribute('aria-live', priority)
    region.setAttribute('aria-atomic', 'true')
    region.className = 'sr-only'
    document.body.appendChild(region)
  }

  // Clear and re-set to force re-announcement
  region.setAttribute('aria-live', 'off')
  region.style.display = 'none' // trigger reflow
  region.setAttribute('aria-live', priority)
  region.textContent = message
}

/**
 * Triggers haptic feedback if available (Vibration API)
 */
export function hapticFeedback(pattern: number | number[] = 50): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

/**
 * Focus management - moves focus to an element with smooth announcement
 */
export function focusElement(selector: string, announceText?: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null
  if (el) {
    el.focus()
    if (announceText) {
      announceToScreenReader(announceText)
    }
    return true
  }
  return false
}

/**
 * Trap focus within a container (for modals/dialogs)
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusableSelectors = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])', '[contenteditable]'
  ].join(', ')

  const focusableEls = container.querySelectorAll(focusableSelectors)
  const firstFocusable = focusableEls[0] as HTMLElement
  const lastFocusable = focusableEls[focusableEls.length - 1] as HTMLElement

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault()
        lastFocusable?.focus()
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault()
        firstFocusable?.focus()
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown)
  firstFocusable?.focus()

  return () => container.removeEventListener('keydown', handleKeyDown)
}

/**
 * Get all keyboard shortcuts
 */
export function getKeyboardShortcuts(): Array<{ keys: string; description: string; action: string }> {
  return [
    { keys: 'Alt + 1–7', description: 'Switch dashboard panels (Home, Conversation, Visual, Metrics, Sound, Accessibility, Shortcuts)', action: 'nav-panel' },
    { keys: 'Escape', description: 'Stop speaking / close drawer', action: 'cancel' },
    { keys: 'Ctrl + /', description: 'Open help', action: 'help' },
    { keys: 'Ctrl + ,', description: 'Open settings', action: 'settings' },
    { keys: 'Ctrl + D', description: 'Describe current page', action: 'describe-page' },
    { keys: 'Tab', description: 'Move to next element (browser default)', action: 'next-element' },
    { keys: 'Shift + Tab', description: 'Move to previous element (browser default)', action: 'prev-element' },
  ]
}

/**
 * Calculate contrast ratio between two colors
 */
export function contrastRatio(color1: string, color2: string): number {
  function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255

    const srgb = [r, g, b].map((c) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    )
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  }

  const l1 = luminance(color1)
  const l2 = luminance(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check WCAG compliance level for a contrast ratio
 */
export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'A' | 'fail' {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'A'
  return 'fail'
}
