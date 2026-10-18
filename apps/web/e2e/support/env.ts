import os from 'node:os';
import path from 'node:path';

// Single place the suite reads its environment from. Nothing else in e2e/ should
// touch process.env or hardcode a host (ADR 0007).

export const E2E_PORT = 3100;
export const baseUrl: string = process.env.BASE_URL ?? `http://localhost:${E2E_PORT}`;

// Deliberately not DATABASE_URL: that name is what the dev shell and .env files use,
// so reading it here could silently aim the suite at the dev database.
const LOCAL_E2E_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/brunchsters_e2e';

export function getE2eDatabaseUrl(): string {
  const fromEnv = process.env.E2E_DATABASE_URL;
  return fromEnv === undefined || fromEnv === '' ? LOCAL_E2E_DATABASE_URL : fromEnv;
}

// Not a secret: only ever signs cookies for the throwaway e2e server.
export const E2E_AUTH_SECRET = 'e2e-only-auth-secret-never-used-outside-the-test-server';

// The Inngest dev server the suite runs next to the app (spec 0008, ADR 0009). Distinct ports
// from the defaults, so a developer's own `inngest-cli dev` on 8288 does not collide with it.
export const E2E_INNGEST_PORT = 8298;
export const E2E_INNGEST_URL = `http://127.0.0.1:${E2E_INNGEST_PORT}`;
// Pinned: the same version docs/SETUP.md tells developers to use.
export const INNGEST_CLI_VERSION = '1.46.0';

// Where the app's FileEmailService writes every email. Fixed, not per-process: playwright.config.ts
// is also loaded by every test worker, and the server and the workers must agree on it.
export const E2E_OUTBOX_DIR = path.join(os.tmpdir(), 'brunchsters-e2e-mail');

// Where `pnpm --filter @brunchsters/web screenshots` writes the review pictures (spec 0009).
// Git-ignored; resolved from the working directory because the script is run from apps/web.
export const E2E_SCREENSHOT_DIR = path.join(process.cwd(), '.screenshots');
