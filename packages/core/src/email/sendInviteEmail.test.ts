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

const updateMany = vi.fn().mockResolvedValue({ count: 1 });
const deleteMany = vi.fn().mockResolvedValue({ count: 1 });

function makeDb(invite: Record<string, unknown> | null | Error): DbClient {
  const findUnique =
    invite instanceof Error ? vi.fn().mockRejectedValue(invite) : vi.fn().mockResolvedValue(invite);
  updateMany.mockClear();
  deleteMany.mockClear();
  return {
    brunchInvite: { findUnique, updateMany },
    notification: { deleteMany },
    user: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as DbClient;
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
    expect(email?.subject).toBe('Evan wants you at brunch 🥂');
    expect(email?.html).toContain('href="https://app.example.com/invite/token-1"');
    expect(email?.idempotencyKey).toMatch(/^invite:invite-uuid:[0-9a-f]{16}$/);
  });

  it('sends the same idempotency key every time the same event is delivered, so the provider can drop the repeat', async () => {
    const emailService = new MockEmailService();
    const ctx = { db: makeDb(makeInvite()), emailService, appUrl: APP_URL };

    await sendInviteEmail({ inviteId: INVITE_ID }, ctx);
    await sendInviteEmail({ inviteId: INVITE_ID }, ctx);

    expect(emailService.sent).toHaveLength(2);
    expect(emailService.sent[1]?.idempotencyKey).toBe(emailService.sent[0]?.idempotencyKey);
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

  it('treats an email the provider says was already sent as done, not as a failure', async () => {
    const emailService = new MockEmailService({ kind: 'already_sent' });

    const result = await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite()), emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_duplicate');
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

  it('clears a failure the host was told about once an email for the invite goes out, and says so only then', async () => {
    const sent = new MockEmailService();
    await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite()), emailService: sent, appUrl: APP_URL },
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: INVITE_ID, emailFailedAt: { not: null } },
      data: { emailFailedAt: null },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { dedupeKey: { startsWith: `email-failed:${INVITE_ID}:` } },
    });

    // The provider already had this very email: it did go, so the failure is over as well.
    const duplicate = new MockEmailService({ kind: 'already_sent' });
    await sendInviteEmail(
      { inviteId: INVITE_ID },
      { db: makeDb(makeInvite()), emailService: duplicate, appUrl: APP_URL },
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('leaves the failure alone when the email did not go (a refused address, a provider that is down), and when the person opted out', async () => {
    for (const failure of [
      { kind: 'invalid_address', address: 'guest@example.com' } as const,
      { kind: 'delivery_failed', message: 'provider down' } as const,
    ]) {
      await sendInviteEmail(
        { inviteId: INVITE_ID },
        { db: makeDb(makeInvite()), emailService: new MockEmailService(failure), appUrl: APP_URL },
      );
      expect(updateMany).not.toHaveBeenCalled();
      expect(deleteMany).not.toHaveBeenCalled();
    }

    // A skipped invite (revoked here) sent nothing, so there is nothing to clear either.
    await sendInviteEmail(
      { inviteId: INVITE_ID },
      {
        db: makeDb(makeInvite({ deletedAt: new Date() })),
        emailService: new MockEmailService(),
        appUrl: APP_URL,
      },
    );
    expect(updateMany).not.toHaveBeenCalled();
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
