import { createDb } from '@brunchsters/database';

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createDb> | undefined;
};

// Reuse the client across hot-reloads in dev; create fresh in prod.
export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db;
}
