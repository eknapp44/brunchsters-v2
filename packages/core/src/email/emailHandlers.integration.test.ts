import { createDb } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type BrunchLocationId,
  type BrunchTimeId,
  type Email,
  type InviteId,
  type InviteToken,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmBrunch } from '../brunch/confirmBrunch';
import { createBrunch } from '../brunch/createBrunch';
import { NoopEventBus } from '../events/NoopEventBus';
import { resendInvite } from '../invite/resendInvite';
import { respondToInvite } from '../invite/respondToInvite';
import { revokeInvite } from '../invite/revokeInvite';
import { sendInvites } from '../invite/sendInvites';
import { MockEmailService } from './MockEmailService';
import { resolveConfirmationRecipients } from './resolveConfirmationRecipients';
import { sendConfirmationEmail } from './sendConfirmationEmail';
import { sendInviteEmail } from './sendInviteEmail';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const APP_URL = 'https://app.example.com';

function address(label: string): Email {
  return normalizeEmail(`integration-email-${label}-${RUN_ID}@example.com`);
}

const HOST_EMAIL = address('host');
const YES_EMAIL = address('yes');
const MAYBE_EMAIL = address('maybe');
const NO_EMAIL = address('no');
const WAITING_EMAIL = address('waiting');
const REMOVED_MEMBER_EMAIL = address('removed-member');
const SILENT_EMAIL = address('silent');
const REVOKED_EMAIL = address('revoked');
const ACCOUNT_EMAILS = [
  HOST_EMAIL,
  YES_EMAIL,
  MAYBE_EMAIL,
  NO_EMAIL,
  WAITING_EMAIL,
  REMOVED_MEMBER_EMAIL,
];

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
const userIds = new Map<string, UserId>();
const createdBrunchIds: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a row, found none');
  return value;
}

beforeAll(async () => {
  for (const email of ACCOUNT_EMAILS) {
    const user = await db.user.create({ data: { name: `Name of ${email.split('@')[0]}`, email } });
    userIds.set(email, user.id as UserId);
  }
  hostId = required(userIds.get(HOST_EMAIL));
});

afterAll(async () => {
  await db.brunchLocation.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchTime.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({ where: { email: { in: ACCOUNT_EMAILS } } });
});

async function inviteFor(
  brunchId: BrunchId,
  email: Email,
): Promise<{ id: InviteId; token: string }> {
  const invite = required(
    await db.brunchInvite.findUnique({
      where: { brunchId_invitedEmail: { brunchId, invitedEmail: email } },
    }),
  );
  return { id: invite.id as InviteId, token: invite.token };
}

async function createBrunchWithInvites(
  title: string,
  emails: Email[],
): Promise<{ brunchId: BrunchId; locationId: BrunchLocationId; timeId: BrunchTimeId }> {
  const scheduledAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const created = await createBrunch(
    {
      title,
      hostId,
      locations: [
        {
          placeId: `email-place-${RUN_ID}-${title}`,
          placeName: 'Cafe A',
          placeAddress: '1 Main St',
          placeUrl: 'https://maps.google.com/?cid=a',
          timezone: 'America/Chicago',
        },
      ],
      times: [{ scheduledAt: scheduledAt.toISOString() }],
    },
    { db, eventBus },
  );
  const brunchId = created._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const sent = await sendInvites(
    { brunchId, invitedById: hostId, emails },
    { rateLimiter: new InMemoryRateLimiter(), db, eventBus },
  );
  expect(sent.isOk()).toBe(true);

  const location = required(await db.brunchLocation.findFirst({ where: { brunchId } }));
  const time = required(await db.brunchTime.findFirst({ where: { brunchId } }));
  return {
    brunchId,
    locationId: location.id as BrunchLocationId,
    timeId: time.id as BrunchTimeId,
  };
}

async function respond(
  brunchId: BrunchId,
  email: Email,
  response: 'yes' | 'no' | 'maybe',
): Promise<void> {
  const { token } = await inviteFor(brunchId, email);
  const result = await respondToInvite(
    { token: token as InviteToken, viewerId: required(userIds.get(email)), response },
    { db, eventBus },
  );
  expect(result.isOk()).toBe(true);
}

describe('sendInviteEmail (integration — real Postgres)', () => {
  it('sends the invite with the current token, and a resend sends the new token under a new key', async () => {
    const { brunchId } = await createBrunchWithInvites('resend', [SILENT_EMAIL]);
    const first = await inviteFor(brunchId, SILENT_EMAIL);
    const emailService = new MockEmailService();
    const ctx = { db, emailService, appUrl: APP_URL };

    expect((await sendInviteEmail({ inviteId: first.id }, ctx))._unsafeUnwrap()).toBe('sent');

    const resent = await resendInvite(
      { inviteId: first.id, requestedById: hostId },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus },
    );
    expect(resent.isOk()).toBe(true);
    const second = await inviteFor(brunchId, SILENT_EMAIL);
    expect(second.token).not.toBe(first.token);

    // An event queued before the resend, handled after it, still sends the live token.
    expect((await sendInviteEmail({ inviteId: first.id }, ctx))._unsafeUnwrap()).toBe('sent');

    const [before, after] = emailService.sent;
    expect(before?.to).toBe(SILENT_EMAIL);
    expect(before?.html).toContain(`/invite/${first.token}"`);
    expect(after?.html).toContain(`/invite/${second.token}"`);
    expect(after?.html).not.toContain(first.token);
    expect(before?.idempotencyKey).not.toBe(after?.idempotencyKey);
  });

  it('sends nothing for an invite revoked before the queued email ran', async () => {
    const { brunchId } = await createBrunchWithInvites('revoked-before-send', [REVOKED_EMAIL]);
    const invite = await inviteFor(brunchId, REVOKED_EMAIL);
    const emailService = new MockEmailService();

    const revoked = await revokeInvite({ inviteId: invite.id, requestedById: hostId }, { db });
    expect(revoked.isOk()).toBe(true);

    const result = await sendInviteEmail(
      { inviteId: invite.id },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_revoked');
    expect(emailService.sent).toHaveLength(0);
  });

  it('sends nothing for an invite whose link has expired', async () => {
    const { brunchId } = await createBrunchWithInvites('expired', [SILENT_EMAIL]);
    const invite = await inviteFor(brunchId, SILENT_EMAIL);
    await db.brunchInvite.update({
      where: { id: invite.id },
      data: { tokenExpiresAt: new Date(Date.now() - 60 * 1000) },
    });
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: invite.id },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_expired');
    expect(emailService.sent).toHaveLength(0);
  });

  it('never emails the host’s own synthetic invite', async () => {
    const { brunchId } = await createBrunchWithInvites('host-invite', [SILENT_EMAIL]);
    const hostInvite = await inviteFor(brunchId, HOST_EMAIL);
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: hostInvite.id },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_host');
    expect(emailService.sent).toHaveLength(0);
  });

  it('skips an invite id that does not exist', async () => {
    const emailService = new MockEmailService();

    const result = await sendInviteEmail(
      { inviteId: '00000000-0000-4000-8000-00000000dead' as InviteId },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toBe('skipped_gone');
  });
});

describe('resolveConfirmationRecipients (integration — real Postgres)', () => {
  it('reaches the host and everyone who has not declined, and no one else', async () => {
    const { brunchId, locationId, timeId } = await createBrunchWithInvites('confirm-recipients', [
      YES_EMAIL,
      MAYBE_EMAIL,
      NO_EMAIL,
      WAITING_EMAIL,
      REMOVED_MEMBER_EMAIL,
      SILENT_EMAIL,
      REVOKED_EMAIL,
    ]);
    await respond(brunchId, YES_EMAIL, 'yes');
    await respond(brunchId, MAYBE_EMAIL, 'maybe');
    await respond(brunchId, NO_EMAIL, 'no');
    await respond(brunchId, REMOVED_MEMBER_EMAIL, 'yes');
    // WAITING_EMAIL has an account and an attendee row but has not answered.
    // SILENT_EMAIL has no account at all.

    const removedMember = await inviteFor(brunchId, REMOVED_MEMBER_EMAIL);
    const revoked = await inviteFor(brunchId, REVOKED_EMAIL);
    expect(
      (await revokeInvite({ inviteId: removedMember.id, requestedById: hostId }, { db })).isOk(),
    ).toBe(true);
    expect(
      (await revokeInvite({ inviteId: revoked.id, requestedById: hostId }, { db })).isOk(),
    ).toBe(true);

    const confirmed = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId, timeId },
      { db, eventBus },
    );
    expect(confirmed.isOk()).toBe(true);

    const result = await resolveConfirmationRecipients({ brunchId }, { db });
    const { brunch, recipients } = result._unsafeUnwrap();

    expect(recipients.map((r) => r.email).sort()).toEqual(
      [HOST_EMAIL, YES_EMAIL, MAYBE_EMAIL, WAITING_EMAIL, SILENT_EMAIL].sort(),
    );

    // People with accounts go to the brunch; the person with no account is pointed at their
    // invite by id. The token itself is never in the recipient list (it is stored as queue state).
    const byEmail = new Map(recipients.map((r) => [r.email, r]));
    expect(byEmail.get(YES_EMAIL)?.destination).toEqual({ kind: 'brunch' });
    expect(byEmail.get(HOST_EMAIL)?.destination).toEqual({ kind: 'brunch' });
    const silent = await inviteFor(brunchId, SILENT_EMAIL);
    expect(byEmail.get(SILENT_EMAIL)?.destination).toEqual({ kind: 'invite', inviteId: silent.id });
    expect(byEmail.get(SILENT_EMAIL)?.name).toBeUndefined();
    expect(JSON.stringify(recipients)).not.toContain(silent.token);

    // Sending builds the link then, from the token as it is at that moment: a resend between
    // listing and sending (which rotates the token) means the new link is the one emailed.
    const resent = await resendInvite(
      { inviteId: silent.id, requestedById: hostId },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus },
    );
    expect(resent.isOk()).toBe(true);
    const rotated = await inviteFor(brunchId, SILENT_EMAIL);
    expect(rotated.token).not.toBe(silent.token);
    const emailService = new MockEmailService();
    const silentRecipient = required(byEmail.get(SILENT_EMAIL));
    const sent = await sendConfirmationEmail(
      { brunch, recipient: silentRecipient },
      { db, emailService, appUrl: APP_URL },
    );
    expect(sent._unsafeUnwrap()).toBe('sent');
    expect(emailService.sent[0]?.html).toContain(`${APP_URL}/invite/${rotated.token}"`);
    expect(emailService.sent[0]?.html).not.toContain(silent.token);

    // And an invite revoked after the list was made gets nothing.
    expect(
      (await revokeInvite({ inviteId: silent.id, requestedById: hostId }, { db })).isOk(),
    ).toBe(true);
    const afterRevoke = new MockEmailService();
    const skipped = await sendConfirmationEmail(
      { brunch, recipient: silentRecipient },
      { db, emailService: afterRevoke, appUrl: APP_URL },
    );
    expect(skipped._unsafeUnwrap()).toBe('skipped_invite_gone');
    expect(afterRevoke.sent).toHaveLength(0);

    expect(brunch.placeName).toBe('Cafe A');
    expect(brunch.timezone).toBe('America/Chicago');
  });

  it('the invite page link still works after confirming (the expiry was extended)', async () => {
    const { brunchId, locationId, timeId } = await createBrunchWithInvites('confirm-link', [
      SILENT_EMAIL,
    ]);
    const confirmed = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId, timeId },
      { db, eventBus },
    );
    expect(confirmed.isOk()).toBe(true);

    const silent = await inviteFor(brunchId, SILENT_EMAIL);
    const row = required(await db.brunchInvite.findUnique({ where: { id: silent.id } }));

    expect(row.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a brunch that is not confirmed yet', async () => {
    const { brunchId } = await createBrunchWithInvites('unconfirmed', [SILENT_EMAIL]);

    const result = await resolveConfirmationRecipients({ brunchId }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_confirmed' });
  });

  it('does not announce a brunch that was cancelled after it was confirmed', async () => {
    const { brunchId, locationId, timeId } = await createBrunchWithInvites('cancelled', [
      SILENT_EMAIL,
    ]);
    const confirmed = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId, timeId },
      { db, eventBus },
    );
    expect(confirmed.isOk()).toBe(true);
    const cancelledStatus = required(
      await db.brunchStatus.findFirst({ where: { code: 'cancelled' } }),
    );
    await db.brunch.update({ where: { id: brunchId }, data: { statusId: cancelledStatus.id } });

    const result = await resolveConfirmationRecipients({ brunchId }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_confirmed' });
  });
});
