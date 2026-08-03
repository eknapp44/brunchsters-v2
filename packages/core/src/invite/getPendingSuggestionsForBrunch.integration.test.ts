import { createDb } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrunch } from '../brunch/createBrunch';
import { NoopEventBus } from '../events/NoopEventBus';
import { getPendingSuggestionsForBrunch } from './getPendingSuggestionsForBrunch';
import { reviewInviteSuggestion } from './reviewInviteSuggestion';
import { sendInvites } from './sendInvites';
import { suggestInvitee } from './suggestInvitee';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-pendingsugg-host-${RUN_ID}@example.com`;
const ATTENDEE_EMAIL = `integration-pendingsugg-attendee-${RUN_ID}@example.com`;
const OUTSIDER_EMAIL = `integration-pendingsugg-outsider-${RUN_ID}@example.com`;
const PENDING_EMAIL = `integration-pendingsugg-pending-${RUN_ID}@example.com`;
const DECLINED_EMAIL = `integration-pendingsugg-declined-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let attendeeId: UserId;
let outsiderId: UserId;
let brunchId: BrunchId;
const createdBrunchIds: string[] = [];

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration PendingSugg Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;

  const attendeeUser = await db.user.create({
    data: { name: 'Integration PendingSugg Attendee', email: ATTENDEE_EMAIL },
  });
  attendeeId = attendeeUser.id as UserId;

  const outsiderUser = await db.user.create({
    data: { name: 'Integration PendingSugg Outsider', email: OUTSIDER_EMAIL },
  });
  outsiderId = outsiderUser.id as UserId;

  const brunch = await createBrunch(
    { title: 'Integration PendingSugg Brunch', locations: [], times: [], hostId },
    { db, eventBus },
  );
  expect(brunch.isOk()).toBe(true);
  brunchId = brunch._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const invites = await sendInvites(
    { brunchId, invitedById: hostId, emails: [ATTENDEE_EMAIL] },
    { db, eventBus },
  );
  expect(invites.isOk()).toBe(true);
});

afterAll(async () => {
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInviteSuggestion.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({
    where: { email: { in: [HOST_EMAIL, ATTENDEE_EMAIL, OUTSIDER_EMAIL] } },
  });
});

describe('getPendingSuggestionsForBrunch integration', () => {
  it('returns an empty list when there are no suggestions yet', async () => {
    const result = await getPendingSuggestionsForBrunch(
      { brunchId, requestedById: hostId },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('returns not_host for a non-host requester', async () => {
    const result = await getPendingSuggestionsForBrunch(
      { brunchId, requestedById: attendeeId },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('lists a pending suggestion with the suggester name, excluding declined ones', async () => {
    const pending = await suggestInvitee(
      { brunchId, suggestedById: attendeeId, email: PENDING_EMAIL },
      { db, eventBus },
    );
    expect(pending.isOk()).toBe(true);

    const declined = await suggestInvitee(
      { brunchId, suggestedById: attendeeId, email: DECLINED_EMAIL },
      { db, eventBus },
    );
    expect(declined.isOk()).toBe(true);
    const review = await reviewInviteSuggestion(
      {
        suggestionId: declined._unsafeUnwrap().suggestionId,
        reviewedById: hostId,
        decision: 'decline',
      },
      { db, eventBus },
    );
    expect(review.isOk()).toBe(true);

    const result = await getPendingSuggestionsForBrunch(
      { brunchId, requestedById: hostId },
      { db },
    );

    expect(result.isOk()).toBe(true);
    const items = result._unsafeUnwrap();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: pending._unsafeUnwrap().suggestionId,
      suggestedEmail: PENDING_EMAIL,
      suggestedByName: 'Integration PendingSugg Attendee',
    });
  });

  it('returns brunch_not_found for a nonexistent brunch', async () => {
    const result = await getPendingSuggestionsForBrunch(
      { brunchId: outsiderId as unknown as BrunchId, requestedById: hostId },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });
});
