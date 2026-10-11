import type { DbClient } from '@brunchsters/database';
import type { InviteId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { MockEmailService } from './MockEmailService';
import { sendInviteEmail } from './sendInviteEmail';

const INVITE_ID = 'invite-uuid' as InviteId;
const APP_URL = 'https://app.example.com';

function makeInvite(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: INVITE_ID,
    invitedEmail: 'guest@example.com',
    token: 'token-1',
    tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deletedAt: null,
    brunch: {
      title: 'Sunday Funday',
      description: 'Bring an appetite',
      deletedAt: null,
      host: { name: 'Evan', email: 'host@example.com' },
    },
    ...overrides,
  };
}

function makeDb(invite: Record<string, unknown> | null | Error): DbClient {
  const findUnique =
    invite instanceof Error ? vi.fn().mockRejectedValue(invite) : vi.fn().mockResolvedValue(invite);
  return { brunchInvite: { findUnique } } as unknown as DbClient;
}

describe('sendInviteEmail', () => {
  it('sends one email to the invited address with the current token in the link', async () => {
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite()), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('sent');
    expect(emailService.sent).toHaveLength(1);
    const [email] = emailService.sent;
    expect(email?.to).toBe('guest@example.com');
    expect(email?.subject).toBe('Evan invited you to brunch: Sunday Funday');
    expect(email?.html).toContain('href="https://app.example.com/invite/token-1"');
    expect(email?.idempotencyKey).toMatch(/^invite:invite-uuid:[0-9a-f]{16}$/);
  });

  it('uses a different idempotency key once the token has rotated', async () => {
    const emailService = new MockEmailService();

    await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite({ token: 'token-1' })), emailService, appUrl: APP_URL },
    );
    await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite({ token: 'token-2' })), emailService, appUrl: APP_URL },
    );

    expect(emailService.sent[0]?.idempotencyKey).not.toBe(emailService.sent[1]?.idempotencyKey);
    expect(emailService.sent[1]?.html).toContain('/invite/token-2');
  });

  it('skips and sends nothing when the invite no longer exists', async () => {
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(null), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_gone');
    expect(emailService.sent).toHaveLength(0);
  });

  it('skips and sends nothing when the invite was revoked', async () => {
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite({ deletedAt: new Date() })), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_revoked');
    expect(emailService.sent).toHaveLength(0);
  });

  it('skips and sends nothing when the link has already expired', async () => {
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      {
        db: makeDb(makeInvite({ tokenExpiresAt: new Date(Date.now() - 1000) })),
        emailService,
        appUrl: APP_URL,
      },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_expired');
    expect(emailService.sent).toHaveLength(0);
  });

  it('skips and sends nothing when the brunch was deleted', async () => {
    const emailService = new MockEmailService();
    const invite = makeInvite();
    invite.brunch = { ...(invite.brunch as object), deletedAt: new Date() };

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(invite), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_gone');
    expect(emailService.sent).toHaveLength(0);
  });

  it('never emails the host’s own synthetic invite, whatever the address case', async () => {
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      {
        db: makeDb(makeInvite({ invitedEmail: 'Host@Example.com' })),
        emailService,
        appUrl: APP_URL,
      },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_host');
    expect(emailService.sent).toHaveLength(0);
  });

  it('returns delivery_failed so the queue can retry', async () => {
    const emailService = new MockEmailService({
      kind: 'delivery_failed',
      message: 'provider down',
    });

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite()), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'delivery_failed',
      message: 'provider down',
    });
  });

  it('returns invalid_address, a different error from a retryable failure', async () => {
    const emailService = new MockEmailService({
      kind: 'invalid_address',
      address: 'guest@example.com',
    });

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite()), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrapErr().kind).toBe('invalid_address');
  });

  it('maps a database failure to db_error', async () => {
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(new Error('connection lost')), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrapErr().kind).toBe('db_error');
    expect(emailService.sent).toHaveLength(0);
  });
});
