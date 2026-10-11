// Allow-list guard for the e2e database. Pointing the suite at anything else is a
// code change on purpose, not a typo (ADR 0007).

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);
const E2E_DATABASE_NAME = /^(?:[a-z0-9_]+_)?e2e$/;

export class UnsafeE2eTargetError extends Error {}

export type E2eDatabaseTarget = {
  readonly databaseName: string;
  readonly hostname: string;
};

export function assertE2eDatabaseUrl(url: string | undefined): E2eDatabaseTarget {
  if (url === undefined || url === '') {
    throw new UnsafeE2eTargetError('E2E database URL is not set.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeE2eTargetError('E2E database URL is not a valid URL.');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new UnsafeE2eTargetError(`E2E database URL must be postgres, got ${parsed.protocol}`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new UnsafeE2eTargetError(
      `Refusing to run e2e against host "${parsed.hostname}": only localhost is allowed.`,
    );
  }

  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!E2E_DATABASE_NAME.test(databaseName)) {
    throw new UnsafeE2eTargetError(
      `Refusing to run e2e against database "${databaseName}": the name must be "e2e" or end in "_e2e".`,
    );
  }

  return { databaseName, hostname: parsed.hostname };
}
