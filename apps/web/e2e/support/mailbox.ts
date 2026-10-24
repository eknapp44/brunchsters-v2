import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { E2E_OUTBOX_DIR } from './env';

// The e2e app writes every email to a folder instead of sending it (FileEmailService, chosen by
// configuration, ADR 0009). The emails arrive through the real Inngest queue, a moment after
// the action that caused them, so tests wait for arrival and never sleep.

export type SentEmail = {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly idempotencyKey: string | undefined;
};

type StoredEmail = {
  id?: unknown;
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  idempotencyKey?: unknown;
};

// Every email so far, oldest first.
export async function readOutbox(): Promise<readonly SentEmail[]> {
  let files: string[];
  try {
    files = (await readdir(E2E_OUTBOX_DIR)).filter((file) => file.endsWith('.json')).sort();
  } catch {
    return [];
  }

  const emails: SentEmail[] = [];
  for (const file of files) {
    try {
      const stored = JSON.parse(
        await readFile(path.join(E2E_OUTBOX_DIR, file), 'utf-8'),
      ) as StoredEmail;
      if (
        typeof stored.id === 'string' &&
        typeof stored.to === 'string' &&
        typeof stored.subject === 'string' &&
        typeof stored.html === 'string'
      ) {
        emails.push({
          id: stored.id,
          to: stored.to,
          subject: stored.subject,
          html: stored.html,
          idempotencyKey:
            typeof stored.idempotencyKey === 'string' ? stored.idempotencyKey : undefined,
        });
      }
    } catch {
      // A file that is still being written is not an email yet; the next poll sees it whole.
    }
  }
  return emails;
}

export async function emailsTo(address: string): Promise<readonly SentEmail[]> {
  return (await readOutbox()).filter((email) => email.to === address);
}

// Waits until at least `count` emails have arrived for the address, then returns all of them.
export async function waitForEmails(params: {
  readonly to: string;
  readonly count: number;
}): Promise<readonly SentEmail[]> {
  await expect
    .poll(async () => (await emailsTo(params.to)).length, {
      message: `emails to ${params.to}`,
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(params.count);
  return emailsTo(params.to);
}

// Proves a quiet period: no email reaches the address for `forMs`. A rule that something is NOT
// sent can only be observed by waiting, so this is the one place a journey waits on a clock; the
// window is chosen against how fast an email that is sent arrives (a couple of seconds).
export async function expectNoEmails(params: {
  readonly to: string;
  readonly forMs: number;
}): Promise<void> {
  const until = Date.now() + params.forMs;
  while (Date.now() < until) {
    expect(await emailsTo(params.to), `no email to ${params.to}`).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// The address behind the email's button ("See the brunch" in both emails).
export function linkIn(email: SentEmail): string {
  const match = /<a href="([^"]+)" style="background/.exec(email.html);
  if (match?.[1] === undefined) throw new Error(`No button link in the email "${email.subject}"`);
  return match[1];
}
