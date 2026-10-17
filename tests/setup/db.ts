import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Setup global de tests: recrea la base de test (`prisma/test.db`) desde cero,
 * genera el cliente Prisma y aplica las migraciones. No toca la base de desarrollo.
 */
export default function setup(): void {
  const dbFile = resolve(process.cwd(), 'prisma/test.db');

  for (const file of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (existsSync(file)) rmSync(file);
  }

  const env = { ...process.env, DATABASE_URL: 'file:./test.db' };

  execFileSync('npx', ['prisma', 'generate'], { stdio: 'inherit', env });
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env });
}
