import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
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
      findFirst: vi
        .fn()
        .mockResolvedValue(
          'brunch' in params ? params.brunch : { id: BRUNCH_ID, title: 'Sunday', host: HOST },
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
    { db: makeDb({ invites }), appUrl: APP_URL },
  );
  return result._unsafeUnwrap().recipients;
}

describe('resolveConfirmationRecipients', () => {
  it('always includes the host, linking to the brunch', async () => {
    const recipients = await recipientsFor([]);

    expect(recipients).toEqual([
      {
        key: 'host',
        email: 'host@example.com',
        name: 'Evan',
        link: 'https://app.example.com/brunch/brunch-uuid',
      },
    ]);
  });

  it('includes yes, maybe and not-yet-answered attendees, linking to the brunch', async () => {
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
    expect(recipients.slice(1).every((r) => r.link.endsWith('/brunch/brunch-uuid'))).toBe(true);
    expect(recipients[1]?.name).toBe('User yes');
  });

  it('leaves out anyone who declined', async () => {
    const recipients = await recipientsFor([
      invite('1', 'yes@example.com', attendee('yes')),
      invite('2', 'no@example.com', attendee('no')),
    ]);

    expect(recipients.map((r) => r.email)).not.toContain('no@example.com');
  });

  it('includes an invitee with no account, linking to their invite page', async () => {
    const recipients = await recipientsFor([invite('9', 'silent@example.com', null)]);

    expect(recipients[1]).toEqual({
      key: 'invite:9',
      email: 'silent@example.com',
      name: undefined,
      link: 'https://app.example.com/invite/token-9',
    });
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
    const result = await resolveConfirmationRecipients(
      { brunchId: BRUNCH_ID },
      { db: makeDb({}), appUrl: APP_URL },
    );

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
      { db: makeDb({ brunch: null }), appUrl: APP_URL },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('reports not_confirmed when the place or the time is not confirmed', async () => {
    const noLocation = await resolveConfirmationRecipients(
      { brunchId: BRUNCH_ID },
      { db: makeDb({ location: null }), appUrl: APP_URL },
    );
    const noTime = await resolveConfirmationRecipients(
      { brunchId: BRUNCH_ID },
      { db: makeDb({ time: null }), appUrl: APP_URL },
    );

    expect(noLocation._unsafeUnwrapErr()).toEqual({ kind: 'not_confirmed' });
    expect(noTime._unsafeUnwrapErr()).toEqual({ kind: 'not_confirmed' });
  });

  it('maps a database failure to db_error', async () => {
    const db = {
      brunch: { findFirst: vi.fn().mockRejectedValue(new Error('connection lost')) },
    } as unknown as DbClient;

    const result = await resolveConfirmationRecipients(
      { brunchId: BRUNCH_ID },
      { db, appUrl: APP_URL },
    );

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
  const recipient: ConfirmationRecipient = {
    key: 'invite:1',
    email: 'yes@example.com' as ConfirmationRecipient['email'],
    name: 'Sam',
    link: 'https://app.example.com/brunch/brunch-uuid',
  };

  it('sends one email with the time in the brunch’s timezone and a per-recipient key', async () => {
    const emailService = new MockEmailService();

    const result = await sendConfirmationEmail({ brunch, recipient }, { emailService });

    expect(result._unsafeUnwrap()).toBe('sent');
    expect(emailService.sent).toHaveLength(1);
    expect(emailService.sent[0]?.to).toBe('yes@example.com');
    expect(emailService.sent[0]?.html).toContain('Saturday, October 24, 2026 at 10:30 AM CDT');
    expect(emailService.sent[0]?.idempotencyKey).toBe('confirmed:brunch-uuid:invite:1');
  });

  it('returns delivery_failed so the queue retries just this recipient', async () => {
    const emailService = new MockEmailService({ kind: 'delivery_failed', message: 'down' });

    const result = await sendConfirmationEmail({ brunch, recipient }, { emailService });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'delivery_failed', message: 'down' });
  });

  it('returns invalid_address without treating it as retryable', async () => {
    const emailService = new MockEmailService({
      kind: 'invalid_address',
      address: 'yes@example.com',
    });

    const result = await sendConfirmationEmail({ brunch, recipient }, { emailService });

    expect(result._unsafeUnwrapErr().kind).toBe('invalid_address');
  });
});
