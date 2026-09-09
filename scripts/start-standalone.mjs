/**
 * Production entry: sets NODE_ENV=production then boots the standalone
 * Next.js server. Works on Windows (no bash-only env prefix).
 */
process.env.NODE_ENV = 'production'
await import('../.next/standalone/server.js')
