import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
let pass = process.env.VB_PASS
if (!pass) {
  const env = readFileSync(join(root, '.env'), 'utf8')
  pass = env.match(/^VOICEBRIDGE_AUTH_PASSPHRASE=(.*)$/m)?.[1]
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  // Bot heuristics block HeadlessChrome UAs on /api/*.
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})
const logs = []
page.on('console', (m) => {
  if (m.type() === 'error') logs.push('CONSOLE:' + m.text().slice(0, 200))
})
page.on('pageerror', (e) => logs.push('PAGEERR:' + e.message.slice(0, 200)))

// Skip first-run onboarding so it can't block the flyover.
await page.addInitScript(() => {
  try {
    localStorage.setItem('vb-onboarding-dismissed', '1')
  } catch {}
})
await page.goto('http://localhost:3002', { waitUntil: 'networkidle', timeout: 45000 })
console.log('TITLE', await page.title())

const loginInput = page.locator('input#vb-passphrase')
if ((await loginInput.count()) > 0) {
  await loginInput.fill(pass)
  await page.locator('button[data-vb-login-submit]').click()
  await page.waitForLoadState('networkidle')
  console.log('LOGGED_IN')
} else {
  console.log('LOGIN_OVERLAY_ABSENT')
}

// Belt-and-suspenders: dismiss onboarding if it still appears.
const onboard = page.locator('text=Get Started')
if ((await onboard.count()) > 0) {
  await onboard.click()
  await page.waitForTimeout(600)
  console.log('ONBOARDING_DISMISSED')
}
await page.waitForTimeout(400)

const nav = page.locator('nav[aria-label="Main navigation"] button')
console.log('NAV_BUTTONS', await nav.count())

const labels = ['Home', 'Chat', 'Vision', 'Metrics', 'Sound', 'A11y', 'Keys', 'Settings']
for (const label of labels) {
  const btn = page.locator(`nav[aria-label="Main navigation"] button`).filter({ hasText: label }).first()
  if ((await btn.count()) === 0) {
    console.log('NAV_MISSING', label)
    continue
  }
  await btn.click()
  await page.waitForTimeout(350)
  console.log('NAV_CLICKED', label)
}

const closeSettings = page.locator('[aria-label="Close settings"]').first()
if ((await closeSettings.count()) > 0) {
  await closeSettings.click()
  await page.waitForTimeout(400)
  console.log('SETTINGS_CLOSED')
}
// Ensure Home is active for power / text-input checks.
await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
await page.waitForTimeout(300)

for (const label of [
  'Mute all output',
  'Unmute all output',
  'Open settings',
  'Open help and keyboard shortcuts',
  'Start voice agent',
  'Stop voice agent',
]) {
  const b = page.locator(`button[aria-label="${label}"]`).first()
  console.log('BTN', label, await b.count())
}

const power = page.locator('button[aria-label="Start voice agent"], button[aria-label="Stop voice agent"]').first()
console.log('POWER_PRESENT', (await power.count()) > 0)

const textInput = page.locator('input#vb-text-command')
console.log('TEXT_INPUT', await textInput.count())
if ((await textInput.count()) > 0) {
  await textInput.fill('help')
  await page.click('button[aria-label="Send typed command"]')
  await page.waitForTimeout(2000)
  const bodyText = await page.locator('main').innerText()
  console.log('HELP_IN_MAIN', bodyText.toLowerCase().includes('describe') || bodyText.toLowerCase().includes('help'))
}

const qa = page.locator('button').filter({ hasText: 'Help' }).first()
if ((await qa.count()) > 0) {
  await qa.click()
  await page.waitForTimeout(900)
  console.log('QA_HELP_CLICKED')
}

await page.keyboard.press('Space')
await page.waitForTimeout(1200)
console.log('SPACE_STARTS', (await page.locator('button[aria-label="Stop voice agent"]').count()) > 0)
await page.keyboard.press('Space')
await page.waitForTimeout(600)
console.log('SPACE_STOPS', (await page.locator('button[aria-label="Start voice agent"]').count()) > 0)

await page.keyboard.press('Alt+4')
await page.waitForTimeout(400)
console.log('ALT4_METRICS', (await page.locator('text=Accessibility Metrics').count()) > 0)

// Typed nav command — always return Home first (text input lives there).
await page.locator('nav[aria-label="Main navigation"] button').filter({ hasText: 'Home' }).first().click()
await page.waitForTimeout(300)
const textInput2 = page.locator('input#vb-text-command')
if ((await textInput2.count()) > 0) {
  await textInput2.fill('open metrics')
  await page.locator('button[aria-label="Send typed command"]').click()
  await page.waitForTimeout(1800)
  console.log('OPEN_METRICS', (await page.locator('text=Accessibility Metrics').count()) > 0)
} else {
  console.log('OPEN_METRICS skipped — no text input on Home')
}

// Settings tabs clickable
await page.locator('button[aria-label="Open settings"]').first().click()
await page.waitForTimeout(400)
for (const tab of ['Voice', 'A11y', 'Sound', 'Keys', 'Engine']) {
  const t = page.locator(`[role="tab"]`).filter({ hasText: tab }).first()
  if ((await t.count()) > 0) {
    await t.click()
    await page.waitForTimeout(250)
    console.log('SETTINGS_TAB', tab)
  } else {
    console.log('SETTINGS_TAB_MISSING', tab)
  }
}
await page.locator('[aria-label="Close settings"]').first().click()

await page.screenshot({ path: 'download/e2e-flyover.png' })
console.log('SCREENSHOT download/e2e-flyover.png')
console.log('ERRORS', JSON.stringify(logs.slice(0, 12)))
await browser.close()
console.log('DONE')
