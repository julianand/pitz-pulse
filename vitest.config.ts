import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/setup/db.ts'],
    // SQLite: un único archivo de test → evitar que los archivos se pisen en paralelo.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      // Resuelto relativo al schema de Prisma → prisma/test.db
      DATABASE_URL: 'file:./test.db',
    },
  },
});
