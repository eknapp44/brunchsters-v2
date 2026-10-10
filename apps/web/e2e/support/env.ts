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
