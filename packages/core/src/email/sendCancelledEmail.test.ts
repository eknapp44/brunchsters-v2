import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteId } from '@brunchsters/shared';
import { err } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { ConfirmationRecipient } from './confirmationTypes';
import type { EmailService } from './EmailService';
import { MockEmailService } from './MockEmailService';
import type { NoticeBrunchSummary } from './noticeTypes';
import { sendBackOnEmail } from './sendBackOnEmail';
import { sendCancelledEmail } from './sendCancelledEmail';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const APP_URL = 'https://app.example.com';
const CANCELLED_AT = new Date('2026-10-23T12:00:00.000Z');

const brunch: NoticeBrunchSummary = {
  brunchId: BRUNCH_ID,
  title: 'Sunday',
  hostName: 'Evan',
  plan: undefined,
};
const member: ConfirmationRecipient = {
  key: 'invite:1',
  email: 'yes@example.com' as ConfirmationRecipient['email'],
  name: 'Sam',
  destination: { kind: 'brunch' },
};
const guest: ConfirmationRecipient = {
  key: 'invite:9',
  email: 'silent@example.com' as ConfirmationRecipient['email'],
  name: undefined,
  destination: { kind: 'invite', inviteId: '9' as InviteId },
};

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const dbWithInvite = (row: { token: string; tokenExpiresAt: Date } | null): DbClient =>
  ({ brunchInvite: { findFirst: vi.fn().mockResolvedValue(row) } }) as unknown as DbClient;

// The called-off and back-on emails share their sending rules and differ in content and key.
describe.each([
  ['sendCancelledEmail', sendCancelledEmail, 'cancelled', 'Evan called off Sunday'],
  ['sendBackOnEmail', sendBackOnEmail, 'backon', 'Sunday is back on 🥂'],
] as const)('%s', (_name, send, keyPrefix, subject) => {
  it('sends one email to a member, linking to the brunch, keyed by this cancellation and person', async () => {
    const emailService = new MockEmailService();

    const result = await send(
      { brunch, cancelledAt: CANCELLED_AT, recipient: member },
      { db: dbWithInvite(null), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('sent');
    expect(emailService.sent).toHaveLength(1);
    expect(emailService.sent[0]).toMatchObject({ to: 'yes@example.com', subject });
    expect(emailService.sent[0]?.html).toContain(
      'href="https://app.example.com/brunch/brunch-uuid"',
    );
    expect(emailService.sent[0]?.idempotencyKey).toBe(
      `${keyPrefix}:brunch-uuid:${CANCELLED_AT.getTime()}:invite:1`,
    );
  });

  it('keys a second cancellation differently, so people are told again', async () => {
    const emailService = new MockEmailService();
    const ctx = { db: dbWithInvite(null), emailService, appUrl: APP_URL };

    await send({ brunch, cancelledAt: CANCELLED_AT, recipient: member }, ctx);
    await send(
      { brunch, cancelledAt: new Date(CANCELLED_AT.getTime() + 60_000), recipient: member },
      ctx,
    );
    await send({ brunch, cancelledAt: CANCELLED_AT, recipient: member }, ctx);

    const keys = emailService.sent.map((email) => email.idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    // The same cancellation twice is the same key: a retry the provider can drop.
    expect(keys[2]).toBe(keys[0]);
  });

  it('links someone with no account to their invite page, reading the token now', async () => {
    const emailService = new MockEmailService();

    const result = await send(
      { brunch, cancelledAt: CANCELLED_AT, recipient: guest },
      {
        db: dbWithInvite({ token: 'rotated', tokenExpiresAt: FUTURE }),
        emailService,
        appUrl: APP_URL,
      },
    );

    expect(result._unsafeUnwrap()).toBe('sent');
    expect(emailService.sent[0]?.html).toContain('href="https://app.example.com/invite/rotated"');
  });

  it('sends nothing to an invitee whose invite was revoked or has expired', async () => {
    const emailService = new MockEmailService();
    const expired = { token: 't', tokenExpiresAt: new Date(Date.now() - 1000) };

    const revoked = await send(
      { brunch, cancelledAt: CANCELLED_AT, recipient: guest },
      { db: dbWithInvite(null), emailService, appUrl: APP_URL },
    );
    const lapsed = await send(
      { brunch, cancelledAt: CANCELLED_AT, recipient: guest },
      { db: dbWithInvite(expired), emailService, appUrl: APP_URL },
    );

    expect(revoked._unsafeUnwrap()).toBe('skipped_invite_gone');
    expect(lapsed._unsafeUnwrap()).toBe('skipped_invite_gone');
    expect(emailService.sent).toHaveLength(0);
  });

  it('records a rejected address and a duplicate as outcomes, not errors', async () => {
    const reject = (kind: 'invalid_address' | 'already_sent'): EmailService => ({
      send: () =>
        Promise.resolve(err(kind === 'invalid_address' ? { kind, address: 'x' } : { kind })),
    });
    const ctx = (emailService: EmailService) => ({
      db: dbWithInvite(null),
      emailService,
      appUrl: APP_URL,
    });

    const invalid = await send(
      { brunch, cancelledAt: CANCELLED_AT, recipient: member },
      ctx(reject('invalid_address')),
    );
    const duplicate = await send(
      { brunch, cancelledAt: CANCELLED_AT, recipient: member },
      ctx(reject('already_sent')),
    );

    expect(invalid._unsafeUnwrap()).toBe('skipped_invalid_address');
    expect(duplicate._unsafeUnwrap()).toBe('skipped_duplicate');
  });

  it('returns a delivery failure as an error, so the queue retries it', async () => {
    const result = await send(
      { brunch, cancelledAt: CANCELLED_AT, recipient: member },
      {
        db: dbWithInvite(null),
        emailService: new MockEmailService({ kind: 'delivery_failed', message: 'provider down' }),
        appUrl: APP_URL,
      },
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'delivery_failed',
      message: 'provider down',
    });
  });
});
