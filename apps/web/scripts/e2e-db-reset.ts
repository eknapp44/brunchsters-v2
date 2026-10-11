import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertE2eDatabaseUrl } from '../e2e/support/guard';
import { getE2eDatabaseUrl } from '../e2e/support/env';

// Recreates the e2e database from scratch: drop, create, migrate, seed reference data.
// Non-interactive on purpose (`migrate deploy`, never `migrate dev`).
async function main(): Promise<void> {
  const databaseUrl = getE2eDatabaseUrl();
  const { databaseName } = assertE2eDatabaseUrl(databaseUrl);

  // CREATE/DROP DATABASE must run against a different database than the one it targets.
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    // databaseName is allow-list validated above, so interpolating it is safe.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl };
  const run = (command: string): void => {
    execSync(command, { stdio: 'inherit', env });
  };
  run('pnpm --filter @brunchsters/database exec prisma migrate deploy');
  run('pnpm --filter @brunchsters/database run seed');

  console.log(`e2e database "${databaseName}" is ready.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
