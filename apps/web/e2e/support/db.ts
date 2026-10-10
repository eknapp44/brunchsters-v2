import { createDb, type DbClient } from '@brunchsters/database';
import { getE2eDatabaseUrl } from './env';
import { assertE2eDatabaseUrl } from './guard';

let client: DbClient | undefined;

// The same client (soft-delete extension included) the app itself uses, pointed at the
// e2e database. One per Playwright worker process.
export function getDb(): DbClient {
  if (client === undefined) {
    const url = getE2eDatabaseUrl();
    assertE2eDatabaseUrl(url);
    // createDb() builds a PrismaClient that reads DATABASE_URL from the environment, and
    // the worker inherits the dev shell's. Re-point it before the client exists.
    process.env.DATABASE_URL = url;
    process.env.DIRECT_URL = url;
    client = createDb();
  }
  return client;
}
