import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ConfirmationRecipient } from './confirmationTypes';
import { resolveConfirmationRecipients } from './resolveConfirmationRecipients';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;

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
