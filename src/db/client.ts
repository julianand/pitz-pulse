import { PrismaClient } from '@prisma/client';

/** Cliente Prisma compartido por la app. */
export const prisma = new PrismaClient();

/**
 * PRAGMAs de SQLite por conexión: WAL mejora la concurrencia de lectura/escritura y
 * `foreign_keys=ON` garantiza la integridad referencial. Idempotente.
 */
export async function aplicarPragmasSqlite(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
}

export async function desconectar(): Promise<void> {
  await prisma.$disconnect();
}
