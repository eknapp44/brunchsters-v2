import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getBrunchRoster } from './getBrunchRoster';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid-1111' as UserId;
const MAYA_ID = 'maya-uuid-2222' as UserId;
const DEVON_ID = 'devon-uuid-3333' as UserId;
const ROBIN_ID = 'robin-uuid-4444' as UserId;
const SAM_ID = 'sam-uuid-5555' as UserId;
const JESS_ID = 'jess-uuid-6666' as UserId;

const attendee = (id: string, name: string, code: string) => ({
  user: { id, name },
  rsvpStatus: { code },
});

const BRUNCH = {
  hostId: HOST_ID,
  attendees: [
    attendee(HOST_ID, 'Evan Knapp', 'yes'),
    attendee(MAYA_ID, 'Maya Reyes', 'yes'),
    attendee(DEVON_ID, 'Devon Kim', 'yes'),
    attendee(ROBIN_ID, 'Robin Cole', 'maybe'),
    attendee(SAM_ID, 'Sam Liu', 'no'),
    attendee(JESS_ID, 'Jess Martinez', 'invited'),
  ],
  invites: [{ invitedEmail: 'priya.shah@example.com' }],
};

function makeDb(params: { readonly member: boolean; readonly brunch?: unknown }) {
  const attendeeFindFirst = vi.fn().mockResolvedValue(params.member ? { id: 'a' } : null);
  const brunchFindFirst = vi
    .fn()
    .mockResolvedValue(params.brunch === undefined ? BRUNCH : params.brunch);
  const db = {
    brunchAttendee: { findFirst: attendeeFindFirst },
    brunch: { findFirst: brunchFindFirst },
  } as unknown as DbClient;
  return { db, attendeeFindFirst, brunchFindFirst };
}

async function rosterFor(viewerId: UserId, brunch?: unknown) {
  const { db } = makeDb({ member: true, brunch });
  return getBrunchRoster({ brunchId: BRUNCH_ID, viewerId }, { db });
}

describe('getBrunchRoster, who may see it', () => {
  it('gives an outsider nothing, and reads nothing about the brunch first', async () => {
    const { db, brunchFindFirst } = makeDb({ member: false });

    const roster = await getBrunchRoster({ brunchId: BRUNCH_ID, viewerId: SAM_ID }, { db });

    expect(roster).toBeUndefined();
    expect(brunchFindFirst).not.toHaveBeenCalled();
  });

  it('gives a member nothing when the brunch itself is gone', async () => {
    const { db } = makeDb({ member: true, brunch: null });
    expect(
      await getBrunchRoster({ brunchId: BRUNCH_ID, viewerId: MAYA_ID }, { db }),
    ).toBeUndefined();
  });
});

describe('getBrunchRoster, the host view', () => {
  it('lists everyone by full name with their state, and the host as "You"', async () => {
    const roster = await rosterFor(HOST_ID);

    expect(roster?.kind).toBe('host');
    expect(roster?.people.map((p) => [p.name, p.state])).toEqual([
      ['You', 'yes'],
      ['Devon Kim', 'yes'],
      ['Maya Reyes', 'yes'],
      ['Robin Cole', 'maybe'],
      ['Sam Liu', 'no'],
      ['Jess Martinez', 'pending'],
      ['priya.shah@example.com', 'pending'],
    ]);
  });

  it('counts every state, including people who were only invited', async () => {
    expect((await rosterFor(HOST_ID))?.counts).toEqual({ yes: 3, maybe: 1, no: 1, pending: 2 });
  });

  it('marks only the viewer', async () => {
    const roster = await rosterFor(HOST_ID);
    expect(roster?.people.filter((p) => p.isViewer).map((p) => p.name)).toEqual(['You']);
  });

  it('gives each person initials from their real name, even when shown as "You"', async () => {
    const roster = await rosterFor(HOST_ID);
    expect(roster?.people[0]).toMatchObject({ name: 'You', initials: 'EK' });
    expect(roster?.people.find((p) => p.name === 'Maya Reyes')?.initials).toBe('MR');
  });
});

describe('getBrunchRoster, the member view', () => {
  it('names only people who said yes or maybe, as "First L."', async () => {
    const roster = await rosterFor(MAYA_ID);

    expect(roster?.kind).toBe('member');
    expect(roster?.people.map((p) => [p.name, p.state])).toEqual([
      ['You', 'yes'],
      ['Devon K.', 'yes'],
      ['Evan K.', 'yes'],
      ['Robin C.', 'maybe'],
    ]);
  });

  it('shows a "no", an unanswered invite and an email-only invite only as numbers', async () => {
    const roster = await rosterFor(MAYA_ID);
    expect(roster?.counts).toEqual({ yes: 3, maybe: 1, no: 1, pending: 2 });
  });

  it('never carries a surname, an email, an id, or the name of someone who said no', async () => {
    const serialized = JSON.stringify(await rosterFor(MAYA_ID));

    for (const secret of [
      'Reyes',
      'Knapp',
      'Cole',
      'Kim',
      'Liu',
      'Sam',
      'Martinez',
      'Jess',
      'priya',
      'example.com',
      '-uuid-',
    ]) {
      expect(serialized, `the member view must not contain "${secret}"`).not.toContain(secret);
    }
  });

  it('gives the same view to a member who said maybe, and to one who said no', async () => {
    const asMaybe = await rosterFor(ROBIN_ID);
    const asNo = await rosterFor(SAM_ID);

    expect(asMaybe?.kind).toBe('member');
    expect(asNo?.kind).toBe('member');
    expect(asNo?.people.map((p) => p.name)).toEqual(['Devon K.', 'Evan K.', 'Maya R.', 'Robin C.']);
  });

  it('keeps an avatar color stable for a person across views', async () => {
    const forMaya = await rosterFor(MAYA_ID);
    const forDevon = await rosterFor(DEVON_ID);
    const hostView = await rosterFor(HOST_ID);

    const colorOf = (roster: typeof forMaya, name: string): number | undefined =>
      roster?.people.find((p) => p.name === name)?.colorIndex;
    expect(colorOf(forMaya, 'Robin C.')).toBe(colorOf(forDevon, 'Robin C.'));
    expect(colorOf(forMaya, 'Robin C.')).toBe(colorOf(hostView, 'Robin Cole'));
  });
});

describe('getBrunchRoster, the query', () => {
  it('reads only live attendees and invites nobody has accepted', async () => {
    const { db, brunchFindFirst } = makeDb({ member: true });

    await getBrunchRoster({ brunchId: BRUNCH_ID, viewerId: HOST_ID }, { db });

    // The soft-delete extension only filters the top-level model; the nested filters are explicit.
    expect(brunchFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BRUNCH_ID },
        select: expect.objectContaining({
          attendees: expect.objectContaining({ where: { deletedAt: null } }),
          invites: expect.objectContaining({ where: { deletedAt: null, attendee: null } }),
        }),
      }),
    );
  });
});
