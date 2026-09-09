import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Query logging is dev-only: message contents flow through these queries,
// and in production that would write user speech to stdout logs.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient(
    process.env.NODE_ENV === 'production'
      ? undefined
      : { log: ['query'] },
  )

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
