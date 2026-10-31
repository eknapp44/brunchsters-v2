import { mkdir, rm } from 'node:fs/promises';
import { E2E_INNGEST_URL, E2E_OUTBOX_DIR, getE2eDatabaseUrl } from './support/env';
import { assertE2eDatabaseUrl } from './support/guard';

// Every function the app registers (functions.ts): the four email functions, the three that write
// notification rows (spec 0015) and the daily rate-limit prune (spec 0012).
const EXPECTED_FUNCTIONS = 8;

// The Inngest dev server learns about the app's functions by syncing with /api/inngest after
// both are up. An event sent before that sync starts no run, so no test may begin until the
// dev server lists the functions.
async function waitForInngestToKnowTheFunctions(): Promise<void> {
  const deadline = Date.now() + 60_000;
  let last = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${E2E_INNGEST_URL}/dev`);
      const body = (await response.json()) as { functions?: readonly unknown[] };
      last = JSON.stringify(body).slice(0, 300);
      if ((body.functions?.length ?? 0) >= EXPECTED_FUNCTIONS) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The Inngest dev server never listed the app's functions. Last answer: ${last}`);
}

export default async function globalSetup(): Promise<void> {
  assertE2eDatabaseUrl(getE2eDatabaseUrl());

  // A fresh outbox every run, so a test never reads another run's email.
  await rm(E2E_OUTBOX_DIR, { recursive: true, force: true });
  await mkdir(E2E_OUTBOX_DIR, { recursive: true });

  await waitForInngestToKnowTheFunctions();
}
