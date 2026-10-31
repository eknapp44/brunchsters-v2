import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ConfirmationRecipient, ConfirmedBrunchSummary } from './confirmationTypes';
import { MockEmailService } from './MockEmailService';
import { sendConfirmationEmail } from './sendConfirmationEmail';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const APP_URL = 'https://app.example.com';

const brunch: ConfirmedBrunchSummary = {
  brunchId: BRUNCH_ID,
  title: 'Sunday',
  hostName: 'Evan',
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
  scheduledAt: new Date('2026-10-24T15:30:00Z'),
};
const memberRecipient: ConfirmationRecipient = {
  key: 'invite:1',
  email: 'yes@example.com' as ConfirmationRecipient['email'],
  name: 'Sam',
  destination: { kind: 'brunch' },
};
const inviteRecipient: ConfirmationRecipient = {
  key: 'invite:9',
  email: 'silent@example.com' as ConfirmationRecipient['email'],
  name: undefined,
  destination: { kind: 'invite', inviteId: '9' as InviteId },
};

function makeInviteDb(row: { token: string; tokenExpiresAt: Date } | null): {
  db: DbClient;
  findFirst: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(row);
  return {
    db: {
      brunchInvite: { findFirst },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as DbClient,
    findFirst,
  };
}

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

describe('sendConfirmationEmail', () => {
  it('sends one email with the time in the brunch’s timezone and a per-recipient key', async () => {
    const emailService = new MockEmailService();
    const { db } = makeInviteDb(null);

    const result = await sendConfirmationEmail(
      { brunch, recipient: memberRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('sent');
    expect(emailService.sent).toHaveLength(1);
    expect(emailService.sent[0]?.to).toBe('yes@example.com');
    expect(emailService.sent[0]?.html).toContain('Saturday, October 24, 2026 at 10:30 AM CDT');
    expect(emailService.sent[0]?.html).toContain(
      'href="https://app.example.com/brunch/brunch-uuid"',
    );
    expect(emailService.sent[0]?.idempotencyKey).toBe('confirmed:brunch-uuid:invite:1');
  });

  it('sends the same idempotency key every time the same event is delivered, so the provider can drop the repeat', async () => {
    const emailService = new MockEmailService();
    const { db } = makeInviteDb(null);
    const ctx = { db, emailService, appUrl: APP_URL };

    await sendConfirmationEmail({ brunch, recipient: memberRecipient }, ctx);
    await sendConfirmationEmail({ brunch, recipient: memberRecipient }, ctx);

    expect(emailService.sent).toHaveLength(2);
    expect(emailService.sent[1]?.idempotencyKey).toBe(emailService.sent[0]?.idempotencyKey);
  });

  it('reads the invite token when sending, so a token rotated since listing is the one emailed', async () => {
    const emailService = new MockEmailService();
    const { db, findFirst } = makeInviteDb({ token: 'rotated-token', tokenExpiresAt: FUTURE });

    const result = await sendConfirmationEmail(
      { brunch, recipient: inviteRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('sent');
    expect(findFirst).toHaveBeenCalledWith({ where: { id: '9' } });
    expect(emailService.sent[0]?.html).toContain(
      'href="https://app.example.com/invite/rotated-token"',
    );
  });

  it('sends nothing to an invitee whose invite was revoked since the list was made', async () => {
    const emailService = new MockEmailService();
    const { db } = makeInviteDb(null);

    const result = await sendConfirmationEmail(
      { brunch, recipient: inviteRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_invite_gone');
    expect(emailService.sent).toHaveLength(0);
  });

  it('sends nothing to an invitee whose link has expired', async () => {
    const emailService = new MockEmailService();
    const { db } = makeInviteDb({ token: 't', tokenExpiresAt: new Date(Date.now() - 1000) });

    const result = await sendConfirmationEmail(
      { brunch, recipient: inviteRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_invite_gone');
    expect(emailService.sent).toHaveLength(0);
  });

  it('maps a database failure while reading the invite to db_error', async () => {
    const emailService = new MockEmailService();
    const db = {
      brunchInvite: { findFirst: vi.fn().mockRejectedValue(new Error('connection lost')) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as DbClient;

    const result = await sendConfirmationEmail(
      { brunch, recipient: inviteRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrapErr().kind).toBe('db_error');
    expect(emailService.sent).toHaveLength(0);
  });

  it('returns delivery_failed so the queue retries just this recipient', async () => {
    const emailService = new MockEmailService({ kind: 'delivery_failed', message: 'down' });
    const { db } = makeInviteDb(null);

    const result = await sendConfirmationEmail(
      { brunch, recipient: memberRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'delivery_failed', message: 'down' });
  });

  it('treats an email the provider says was already sent as done, not as a failure', async () => {
    const emailService = new MockEmailService({ kind: 'already_sent' });
    const { db } = makeInviteDb(null);

    const result = await sendConfirmationEmail(
      { brunch, recipient: memberRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_duplicate');
  });

  it('records a permanently rejected address as an outcome, so it cannot end the run for everyone after them', async () => {
    const emailService = new MockEmailService({
      kind: 'invalid_address',
      address: 'yes@example.com',
    });
    const { db } = makeInviteDb(null);

    const result = await sendConfirmationEmail(
      { brunch, recipient: memberRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_invalid_address');
  });
});
