import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env', 'utf8')
const pass = process.env.VB_PASS || env.match(/^VOICEBRIDGE_AUTH_PASSPHRASE=(.*)$/m)?.[1]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})
const logs = []
page.on('console', (m) => logs.push(m.type().toUpperCase() + ':' + m.text().slice(0, 300)))
page.on('pageerror', (e) => logs.push('PAGEERR:' + e.message.slice(0, 300)))
page.on('requestfailed', (r) => logs.push('REQFAIL:' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText || '')))

const res = await page.goto('http://localhost:3002', { waitUntil: 'domcontentloaded', timeout: 45000 })
console.log('STATUS', res?.status())
await page.waitForTimeout(3000)
console.log('TITLE', await page.title())
const html = await page.content()
console.log('HTML_LEN', html.length)
console.log('HTML_SNIP', html.slice(0, 800))
console.log('BODY_TEXT', (await page.locator('body').innerText()).slice(0, 500))
await page.screenshot({ path: 'download/e2e-debug.png' })
console.log('LOGS', JSON.stringify(logs.slice(0, 20), null, 2))
await browser.close()
