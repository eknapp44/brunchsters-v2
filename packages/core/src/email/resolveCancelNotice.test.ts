import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { resolveBackOnNotice } from './resolveBackOnNotice';
import { resolveCancelNotice } from './resolveCancelNotice';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const CANCELLED_AT = new Date('2026-10-23T12:00:00.000Z');
const HOST = { id: 'host-id', name: 'Evan', email: 'host@example.com' };

function brunchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BRUNCH_ID,
    title: 'Sunday',
    host: HOST,
    status: { code: 'cancelled' },
    cancelledAt: CANCELLED_AT,
    cancelNoticeSentAt: null,
    ...overrides,
  };
}

type InviteRow = {
  id: string;
  invitedEmail: string;
  attendee: null | {
    deletedAt: Date | null;
    rsvpStatus: { code: string };
    user: { name: string };
  };
};
const member = (
  id: string,
  email: string,
  code: string,
  deletedAt: Date | null = null,
): InviteRow => ({
  id,
  invitedEmail: email,
  attendee: { deletedAt, rsvpStatus: { code }, user: { name: `User ${code}` } },
});

function makeDb(params: {
  brunch?: unknown;
  location?: unknown;
  time?: unknown;
  invites?: InviteRow[];
}): DbClient {
  return {
    brunch: {
      findFirst: vi.fn().mockResolvedValue('brunch' in params ? params.brunch : brunchRow()),
    },
    brunchLocation: { findFirst: vi.fn().mockResolvedValue(params.location ?? null) },
    brunchTime: { findFirst: vi.fn().mockResolvedValue(params.time ?? null) },
    brunchInvite: { findMany: vi.fn().mockResolvedValue(params.invites ?? []) },
  } as unknown as DbClient;
}

const cancelNotice = (db: DbClient, cancelledAt: Date = CANCELLED_AT) =>
  resolveCancelNotice({ brunchId: BRUNCH_ID, cancelledAt }, { db });

describe('resolveCancelNotice', () => {
  it('lists everyone invited who has not said no, and never the host', async () => {
    const db = makeDb({
      invites: [
        member('1', 'yes@example.com', 'yes'),
        member('2', 'maybe@example.com', 'maybe'),
        member('3', 'waiting@example.com', 'invited'),
        member('4', 'no@example.com', 'no'),
        member('5', 'removed@example.com', 'yes', new Date()),
        { id: '9', invitedEmail: 'silent@example.com', attendee: null },
      ],
    });

    const resolved = (await cancelNotice(db))._unsafeUnwrap();

    expect(resolved.kind).toBe('send');
    if (resolved.kind !== 'send') return;
    expect(resolved.recipients.map((r) => r.email)).toEqual([
      'yes@example.com',
      'maybe@example.com',
      'waiting@example.com',
      'silent@example.com',
    ]);
    expect(resolved.recipients.at(-1)?.destination).toEqual({ kind: 'invite', inviteId: '9' });
    expect(resolved.cancelledAt).toEqual(CANCELLED_AT);
  });

  it('describes a confirmed brunch by its place and time, and an unconfirmed one by neither', async () => {
    const confirmed = (
      await cancelNotice(
        makeDb({
          location: { placeName: 'Cafe A', timezone: 'America/Chicago' },
          time: { scheduledAt: new Date('2026-10-24T15:30:00Z') },
        }),
      )
    )._unsafeUnwrap();
    const unconfirmed = (await cancelNotice(makeDb({})))._unsafeUnwrap();

    expect(confirmed.kind === 'send' && confirmed.brunch.plan).toEqual({
      placeName: 'Cafe A',
      scheduledAt: new Date('2026-10-24T15:30:00Z'),
      timezone: 'America/Chicago',
    });
    expect(unconfirmed.kind === 'send' && unconfirmed.brunch.plan).toBeUndefined();
  });

  it.each([
    ['the brunch is gone', { brunch: null }, 'brunch_gone'],
    [
      'the host brought it back inside the hold',
      { brunch: brunchRow({ status: { code: 'active' } }) },
      'not_called_off',
    ],
    [
      'it was brought back and called off again (a newer cancellation has its own run)',
      { brunch: brunchRow({ cancelledAt: new Date(CANCELLED_AT.getTime() + 600_000) }) },
      'superseded',
    ],
    [
      'it has no cancellation on record',
      { brunch: brunchRow({ cancelledAt: null }) },
      'superseded',
    ],
    [
      'this cancellation was already announced (a replayed event)',
      { brunch: brunchRow({ cancelNoticeSentAt: new Date() }) },
      'already_sent',
    ],
  ])('stops, without an error, when %s', async (_label, params, reason) => {
    const resolved = (await cancelNotice(makeDb(params)))._unsafeUnwrap();

    expect(resolved).toEqual({ kind: 'stop', reason });
  });

  it('reports a database failure as an error, so the queue retries', async () => {
    const db = {
      brunch: { findFirst: vi.fn().mockRejectedValue(new Error('down')) },
    } as unknown as DbClient;

    expect((await cancelNotice(db))._unsafeUnwrapErr().kind).toBe('db_error');
  });
});

describe('resolveBackOnNotice', () => {
  const brunchBack = (overrides: Record<string, unknown> = {}) =>
    brunchRow({ status: { code: 'active' }, cancelNoticeSentAt: new Date(), ...overrides });
  const backOn = (db: DbClient) => resolveBackOnNotice({ brunchId: BRUNCH_ID }, { db });

  it('tells the same people, with the cancellation it corrects', async () => {
    const db = makeDb({
      brunch: brunchBack(),
      invites: [member('1', 'yes@example.com', 'yes'), member('4', 'no@example.com', 'no')],
    });

    const resolved = (await backOn(db))._unsafeUnwrap();

    expect(resolved.kind).toBe('send');
    if (resolved.kind !== 'send') return;
    expect(resolved.recipients.map((r) => r.email)).toEqual(['yes@example.com']);
    expect(resolved.cancelledAt).toEqual(CANCELLED_AT);
  });

  it.each([
    ['the brunch is gone', { brunch: null }, 'brunch_gone'],
    [
      'it is called off again by now',
      { brunch: brunchBack({ status: { code: 'cancelled' } }) },
      'still_called_off',
    ],
    [
      'nobody was told it was off (it came back inside the hold)',
      { brunch: brunchBack({ cancelNoticeSentAt: null }) },
      'no_notice_sent',
    ],
    [
      'there is no cancellation on record',
      { brunch: brunchBack({ cancelledAt: null }) },
      'no_notice_sent',
    ],
  ])('stops, without an error, when %s', async (_label, params, reason) => {
    expect((await backOn(makeDb(params)))._unsafeUnwrap()).toEqual({ kind: 'stop', reason });
  });
});
