/**
 * Capture frame-by-frame demo beats for the judge video.
 * Saves numbered PNGs + a beat manifest used by scripts/assemble-demo-video.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.DEMO_BASE_URL || 'http://localhost:3000'
const OUT = join(process.cwd(), 'download', 'demo-frames')
mkdirSync(OUT, { recursive: true })

function loadPass() {
  if (process.env.VB_PASS) return process.env.VB_PASS
  const env = readFileSync('.env', 'utf8')
  return env.match(/^VOICEBRIDGE_AUTH_PASSPHRASE=(.*)$/m)?.[1]
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const beats = []

async function shot(page, name, note) {
  const file = join(OUT, `${String(beats.length + 1).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  beats.push({ name, file, note })
  console.log('FRAME', name)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  userAgent: UA,
})

await page.addInitScript(() => {
  try {
    localStorage.setItem('vb-onboarding-dismissed', '1')
  } catch {}
})

// 1. Login screen
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(800)
await shot(page, 'login', 'Sign-in gate — production auth')

// 2. Sign in
const pass = loadPass()
const loginInput = page.locator('input#vb-passphrase')
if ((await loginInput.count()) > 0) {
  await loginInput.fill(pass)
  await shot(page, 'login-filled', 'Passphrase entered')
  await page.locator('button[data-vb-login-submit]').click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}
await shot(page, 'home-ready', 'Dashboard ready — power off')

// 3. Power on
await page.locator('button[aria-label="Start voice agent"]').click()
await page.waitForTimeout(2000)
await shot(page, 'power-on', 'Agent starting / engine status')

// 4. Navigate via typed command (works headless without mic)
const input = page.locator('input#vb-text-command')
await input.waitFor({ state: 'visible', timeout: 10000 })
await page.waitForTimeout(400)
await input.fill('open metrics')
await page.locator('button[aria-label="Send typed command"]').click()
await page.waitForTimeout(1800)
await shot(page, 'metrics', 'Open metrics — panel switch')

// 5. Settings
await page.locator('button[aria-label="Open settings"]').first().click()
await page.waitForTimeout(600)
await shot(page, 'settings', 'Settings drawer — prefs surface')

// 6. Engine tab
const engineTab = page.locator('[role="tab"]').filter({ hasText: 'Engine' }).first()
if ((await engineTab.count()) > 0) {
  await engineTab.click()
  await page.waitForTimeout(400)
  await shot(page, 'engine-tab', 'Multi-engine ladder UI')
}

// 7. Close settings, conversation
await page.locator('[aria-label="Close settings"]').first().click()
await page.waitForTimeout(400)
await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
await page.waitForTimeout(300)
if ((await input.count()) > 0) {
  await input.fill('help')
  await page.locator('button[aria-label="Send typed command"]').click()
  await page.waitForTimeout(1800)
}
await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Chat' }).first().click()
await page.waitForTimeout(500)
await shot(page, 'conversation', 'Live transcript history')

// 8. A11y panel
await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'A11y' }).first().click()
await page.waitForTimeout(400)
await shot(page, 'a11y', 'Accessibility controls')

// 9. Home final beauty shot
await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
await page.waitForTimeout(500)
await shot(page, 'home-final', 'Closing hero shot')

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ baseUrl: BASE, beats }, null, 2))
console.log('BEATS', beats.length)
await browser.close()
