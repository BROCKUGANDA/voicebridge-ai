'use client'

/**
 * apiFetch — the ONE way client code talks to our own API.
 *
 * Responsibilities:
 *   - Attaches the `X-Vb-Csrf` header (double-submit cookie pattern) on
 *     state-changing requests so the server's withApi CSRF check passes.
 *   - On 401, fires a single global `vb:unauthorized` event so the app can
 *     show the login overlay; the caller gets the 401 Response back and
 *     decides whether to surface an error.
 *   - Normalizes fetch options (credentials + JSON content type).
 *
 * It intentionally does NOT retry automatically — auth and rate limits must
 * be user-visible, never silently looped.
 */

const CSRF_COOKIE = 'vb_csrf'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

export class ApiUnauthorizedError extends Error {
  constructor() {
    super('Session expired or not signed in.')
    this.name = 'ApiUnauthorizedError'
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function apiFetch(input: string, init: ApiFetchOptions = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers.set('x-vb-csrf', csrf)
  }

  // Explicit Accept so middleware bot-detection and API routes agree this
  // is a same-origin browser JSON call (not a scraper missing headers).
  if (!headers.has('accept')) headers.set('accept', 'application/json')

  const res = await fetch(input, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

  if (res.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vb:unauthorized'))
  }
  return res
}
