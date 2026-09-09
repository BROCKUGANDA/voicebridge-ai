/**
 * Judge demo capture — walks the golden path and writes frame-by-frame PNGs
 * plus a timeline JSON that assemble-demo-video.mjs uses for narration sync.
 *
 * Usage: node scripts/capture-demo.mjs
 * Requires: dev server on :3000, passphrase in .env
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const outDir = join(root, 'download', 'demo-frames')
mkdirSync(outDir, { recursive: true })

function loadPass() {
  if (process.env.VB_PASS) return process.env.VB_PASS
  for (const f of ['.env.local', '.env']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/^VOICEBRIDGE_AUTH_PASSPHRASE=(.*)$/m)
    if (m?.[1]) return m[1]
  }
  throw new Error('VOICEBRIDGE_AUTH_PASSPHRASE not set')
}

const BASE = process.env.DEMO_BASE || 'http://localhost:3000'
const pass = loadPass()
const frames = []
let frameNo = 0

async function shot(page, name, caption, holdMs = 2200) {
  frameNo += 1
  const file = join(outDir, `f${String(frameNo).padStart(3, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  frames.push({ index: frameNo, file, caption, holdMs, name })
  console.log(`frame ${frameNo}: ${name} — ${caption}`)
}

async function typeCommand(page, text, waitMs = 1600) {
  const input = page.locator('input#vb-text-command')
  await input.waitFor({ state: 'visible', timeout: 10000 })
  await input.fill(text)
  await page.locator('button[aria-label="Send typed command"]').click()
  await page.waitForTimeout(waitMs)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})

try {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vb-onboarding-dismissed', '1')
    } catch {}
  })

  // 1. Login screen
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
  const login = page.locator('input#vb-passphrase')
  if ((await login.count()) > 0) {
    await shot(page, 'login', 'Sign in — passphrase-gated dashboard', 2000)
    await login.fill(pass)
    await page.locator('button[data-vb-login-submit]').click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
  }

  // Dismiss onboarding if present
  const onboard = page.locator('text=Get Started')
  if ((await onboard.count()) > 0) {
    await onboard.click()
    await page.waitForTimeout(500)
  }

  // 2. Home + power controls
  await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
  await page.waitForTimeout(400)
  await shot(page, 'home', 'Home — voice agent controls and quick actions', 2500)

  // 3. Power button (starts engine ladder)
  const power = page.locator('button[aria-label="Start voice agent"], button[aria-label="Stop voice agent"]').first()
  if ((await power.count()) > 0) {
    await power.click()
    await page.waitForTimeout(1800)
    await shot(page, 'engine-live', 'Engine status — AssemblyAI Voice Agent session', 2800)
  }

  // 4. Typed command: open metrics (same intent path as speech)
  await typeCommand(page, 'open metrics', 1800)
  await shot(page, 'metrics', 'Voice intent: "open metrics" navigates the dashboard', 2600)

  // 5. Describe page
  await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
  await page.waitForTimeout(300)
  await typeCommand(page, 'describe the page', 1800)
  await shot(page, 'describe', 'Visual context — page description spoken to the user', 2600)

  // 6. Settings / engine tab
  await page.locator('button[aria-label="Open settings"]').first().click()
  await page.waitForTimeout(500)
  const engineTab = page.locator('[role="tab"]').filter({ hasText: 'Engine' }).first()
  if ((await engineTab.count()) > 0) {
    await engineTab.click()
    await page.waitForTimeout(400)
  }
  await shot(page, 'settings-engine', 'Engine ladder — AssemblyAI → Vosk → Web Speech → text', 2800)

  const voiceTab = page.locator('[role="tab"]').filter({ hasText: 'Voice' }).first()
  if ((await voiceTab.count()) > 0) {
    await voiceTab.click()
    await page.waitForTimeout(400)
  }
  await shot(page, 'settings-voice', 'Preferences — agent can write these via dispatch_tool', 2400)

  await page.locator('[aria-label="Close settings"]').first().click()
  await page.waitForTimeout(400)

  // 7. Help + conversation transcript
  await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
  await page.waitForTimeout(300)
  await typeCommand(page, 'help', 1800)
  await shot(page, 'help', 'Help — practical commands for accessibility users', 2600)

  await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Chat' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, 'transcript', 'Conversation log — exportable transcript', 2400)

  // 8. Metrics panel
  await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Metrics' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, 'metrics-panel', 'Session metrics — task completion and error rate', 2400)

  // 9. Back to home power
  await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
  await page.waitForTimeout(400)
  await shot(page, 'outro', 'VoiceBridge AI — accessibility first, AssemblyAI powered', 3000)

  writeFileSync(
    join(outDir, 'timeline.json'),
    JSON.stringify({ base: BASE, frames, capturedAt: new Date().toISOString() }, null, 2),
  )
  console.log(`\nCaptured ${frames.length} frames → ${outDir}`)
} catch (err) {
  console.error('CAPTURE_FAILED', err)
  await page.screenshot({ path: join(outDir, 'error.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
