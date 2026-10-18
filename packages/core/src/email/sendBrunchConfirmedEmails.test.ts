import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { MockEmailService } from './MockEmailService';
import {
  resolveConfirmationRecipients,
  sendConfirmationEmail,
  type ConfirmationRecipient,
  type ConfirmedBrunchSummary,
} from './sendBrunchConfirmedEmails';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const APP_URL = 'https://app.example.com';

const HOST = { id: 'host-id', name: 'Evan', email: 'host@example.com' };
const LOCATION = {
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
};
const TIME = { scheduledAt: new Date('2026-10-24T15:30:00Z') };

type InviteRow = {
  id: string;
  invitedEmail: string;
  token: string;
  attendee: null | {
    deletedAt: Date | null;
    rsvpStatus: { code: string };
    user: { name: string };
  };
};

function invite(id: string, email: string, attendee: InviteRow['attendee']): InviteRow {
  return { id, invitedEmail: email, token: `token-${id}`, attendee };
}

function attendee(code: string, deletedAt: Date | null = null): InviteRow['attendee'] {
  return { deletedAt, rsvpStatus: { code }, user: { name: `User ${code}` } };
}

function makeDb(params: {
  brunch?: unknown;
  location?: unknown;
  time?: unknown;
  invites?: InviteRow[];
}): DbClient {
  return {
    brunch: {
      findFirst: vi.fn().mockResolvedValue(
        'brunch' in params
          ? params.brunch
          : {
              id: BRUNCH_ID,
              title: 'Sunday',
              host: HOST,
              status: { code: 'confirmed' },
            },
      ),
    },
    brunchLocation: {
      findFirst: vi.fn().mockResolvedValue('location' in params ? params.location : LOCATION),
    },
    brunchTime: {
      findFirst: vi.fn().mockResolvedValue('time' in params ? params.time : TIME),
    },
    brunchInvite: { findMany: vi.fn().mockResolvedValue(params.invites ?? []) },
  } as unknown as DbClient;
}

async function recipientsFor(invites: InviteRow[]): Promise<readonly ConfirmationRecipient[]> {
  const result = await resolveConfirmationRecipients(
    { brunchId: BRUNCH_ID },
    { db: makeDb({ invites }) },
  );
  return result._unsafeUnwrap().recipients;
}

describe('resolveConfirmationRecipients', () => {
  it('always includes the host, pointing at the brunch', async () => {
    const recipients = await recipientsFor([]);

    expect(recipients).toEqual([
      { key: 'host', email: 'host@example.com', name: 'Evan', destination: { kind: 'brunch' } },
    ]);
  });

  it('includes yes, maybe and not-yet-answered attendees, pointing at the brunch', async () => {
    const recipients = await recipientsFor([
      invite('1', 'yes@example.com', attendee('yes')),
      invite('2', 'maybe@example.com', attendee('maybe')),
      invite('3', 'waiting@example.com', attendee('invited')),
    ]);

    expect(recipients.map((r) => r.email)).toEqual([
      'host@example.com',
      'yes@example.com',
      'maybe@example.com',
      'waiting@example.com',
    ]);
    expect(recipients.slice(1).every((r) => r.destination.kind === 'brunch')).toBe(true);
    expect(recipients[1]?.name).toBe('User yes');
  });

  it('leaves out anyone who declined', async () => {
    const recipients = await recipientsFor([
      invite('1', 'yes@example.com', attendee('yes')),
      invite('2', 'no@example.com', attendee('no')),
    ]);

    expect(recipients.map((r) => r.email)).not.toContain('no@example.com');
  });

  it('points an invitee with no account at their invite, by id', async () => {
    const recipients = await recipientsFor([invite('9', 'silent@example.com', null)]);

    expect(recipients[1]).toEqual({
      key: 'invite:9',
      email: 'silent@example.com',
      name: undefined,
      destination: { kind: 'invite', inviteId: '9' },
    });
  });

  it('never puts an invite token into the recipients, which are stored as queue step output', async () => {
    const recipients = await recipientsFor([
      invite('9', 'silent@example.com', null),
      invite('1', 'yes@example.com', attendee('yes')),
    ]);

    expect(JSON.stringify(recipients)).not.toContain('token-');
  });

  it('leaves out an attendee who has been removed', async () => {
    const recipients = await recipientsFor([
      invite('1', 'gone@example.com', attendee('yes', new Date())),
    ]);

    expect(recipients.map((r) => r.email)).toEqual(['host@example.com']);
  });

  it('sends one email per address even if two invites share it in different case', async () => {
    const recipients = await recipientsFor([
      invite('1', 'twin@example.com', null),
      invite('2', 'Twin@Example.com', null),
      invite('3', 'Host@Example.com', null),
    ]);

    expect(recipients.map((r) => r.email)).toEqual(['host@example.com', 'twin@example.com']);
  });

  it('summarises the confirmed place and time', async () => {
    const result = await resolveConfirmationRecipients({ brunchId: BRUNCH_ID }, { db: makeDb({}) });

    expect(result._unsafeUnwrap().brunch).toEqual({
      brunchId: BRUNCH_ID,
      title: 'Sunday',
      hostName: 'Evan',
      ...LOCATION,
      scheduledAt: TIME.scheduledAt,
    });
  });

  it('reports brunch_not_found when the brunch is gone', async () => {
    const result = await resolveConfirmationRecipients(
      { brunchId: BRUNCH_ID },
      { db: makeDb({ brunch: null }) },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('reports not_confirmed when the place or the time is not confirmed', async () => {
    const noLocation = await resolveConfirmationRecipients(
      { brunchId: BRUNCH_ID },
      { db: makeDb({ location: null }) },
    );
    const noTime = await resolveConfirmationRecipients(
      { brunchId: BRUNCH_ID },
      { db: makeDb({ time: null }) },
    );

    expect(noLocation._unsafeUnwrapErr()).toEqual({ kind: 'not_confirmed' });
    expect(noTime._unsafeUnwrapErr()).toEqual({ kind: 'not_confirmed' });
  });

  it.each(['cancelled', 'archived'])(
    'does not announce a brunch that has since been %s, however late the run is',
    async (code) => {
      const result = await resolveConfirmationRecipients(
        { brunchId: BRUNCH_ID },
        {
          db: makeDb({
            brunch: { id: BRUNCH_ID, title: 'Sunday', host: HOST, status: { code } },
          }),
        },
      );

      expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_confirmed' });
    },
  );

  it('maps a database failure to db_error', async () => {
    const db = {
      brunch: { findFirst: vi.fn().mockRejectedValue(new Error('connection lost')) },
    } as unknown as DbClient;

    const result = await resolveConfirmationRecipients({ brunchId: BRUNCH_ID }, { db });

    expect(result._unsafeUnwrapErr().kind).toBe('db_error');
  });
});

describe('sendConfirmationEmail', () => {
  const brunch: ConfirmedBrunchSummary = {
    brunchId: BRUNCH_ID,
    title: 'Sunday',
    hostName: 'Evan',
    ...LOCATION,
    scheduledAt: TIME.scheduledAt,
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
    return { db: { brunchInvite: { findFirst } } as unknown as DbClient, findFirst };
  }

  const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

  it('returns invalid_address without treating it as retryable', async () => {
    const emailService = new MockEmailService({
      kind: 'invalid_address',
      address: 'yes@example.com',
    });
    const { db } = makeInviteDb(null);

    const result = await sendConfirmationEmail(
      { brunch, recipient: memberRecipient },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrapErr().kind).toBe('invalid_address');
  });
});
