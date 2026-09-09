/**
 * Copy Next.js standalone build assets into .next/standalone so the
 * production server can run from that folder alone.
 * Cross-platform replacement for the old `cp -r` shell one-liner.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const staticSrc = join(root, '.next', 'static')
const staticDest = join(root, '.next', 'standalone', '.next', 'static')
const publicSrc = join(root, 'public')
const publicDest = join(root, '.next', 'standalone', 'public')

if (!existsSync(join(root, '.next', 'standalone'))) {
  console.error('Standalone output missing — run `npm run build` first.')
  process.exit(1)
}

mkdirSync(staticDest, { recursive: true })
cpSync(staticSrc, staticDest, { recursive: true })
cpSync(publicSrc, publicDest, { recursive: true })
console.log('Copied .next/static and public/ into .next/standalone/')
