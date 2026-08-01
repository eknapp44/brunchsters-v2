import { createDb } from '@brunchsters/database';
import type { BrunchId, InviteSuggestionId, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrunch } from '../brunch/createBrunch';
import { NoopEventBus } from '../events/NoopEventBus';
import { reviewInviteSuggestion } from './reviewInviteSuggestion';
import { sendInvites } from './sendInvites';
import { suggestInvitee } from './suggestInvitee';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-suggest-host-${RUN_ID}@example.com`;
const ATTENDEE_EMAIL = `integration-suggest-attendee-${RUN_ID}@example.com`;
const SUGGESTED_EMAIL_1 = `integration-suggested-1-${RUN_ID}@example.com`;
const SUGGESTED_EMAIL_2 = `integration-suggested-2-${RUN_ID}@example.com`;
const SUGGESTED_EMAIL_3 = `integration-suggested-3-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let attendeeId: UserId;
let brunchId: BrunchId;
const createdBrunchIds: string[] = [];

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration Suggest Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;

  const attendeeUser = await db.user.create({
    data: { name: 'Integration Suggest Attendee', email: ATTENDEE_EMAIL },
  });
  attendeeId = attendeeUser.id as UserId;

  const brunch = await createBrunch(
    { title: 'Integration Suggest Brunch', locations: [], times: [], hostId },
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
    where: {
      email: {
        in: [HOST_EMAIL, ATTENDEE_EMAIL, SUGGESTED_EMAIL_1, SUGGESTED_EMAIL_2, SUGGESTED_EMAIL_3],
      },
    },
  });
});

describe('suggestInvitee + reviewInviteSuggestion integration', () => {
  it('an attendee suggests someone, host approves, and a real invite is created', async () => {
    const suggestion = await suggestInvitee(
      { brunchId, suggestedById: attendeeId, email: SUGGESTED_EMAIL_1 },
      { db, eventBus },
    );
    expect(suggestion.isOk()).toBe(true);
    expect(suggestion._unsafeUnwrap().status).toBe('pending');

    const review = await reviewInviteSuggestion(
      {
        suggestionId: suggestion._unsafeUnwrap().suggestionId,
        reviewedById: hostId,
        decision: 'approve',
      },
      { db, eventBus },
    );
    expect(review.isOk()).toBe(true);

    const suggestionRow = await db.brunchInviteSuggestion.findFirstOrThrow({
      where: { brunchId, suggestedEmail: SUGGESTED_EMAIL_1 },
      include: { status: true },
    });
    expect(suggestionRow.status.code).toBe('approved');

    const invite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: SUGGESTED_EMAIL_1 },
    });
    expect(invite).not.toBeNull();
  });

  it('host declines a suggestion and no invite is created', async () => {
    const suggestion = await suggestInvitee(
      { brunchId, suggestedById: attendeeId, email: SUGGESTED_EMAIL_2 },
      { db, eventBus },
    );
    expect(suggestion.isOk()).toBe(true);

    const review = await reviewInviteSuggestion(
      {
        suggestionId: suggestion._unsafeUnwrap().suggestionId,
        reviewedById: hostId,
        decision: 'decline',
      },
      { db, eventBus },
    );
    expect(review.isOk()).toBe(true);

    const suggestionRow = await db.brunchInviteSuggestion.findFirstOrThrow({
      where: { brunchId, suggestedEmail: SUGGESTED_EMAIL_2 },
      include: { status: true },
    });
    expect(suggestionRow.status.code).toBe('declined');

    const invite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: SUGGESTED_EMAIL_2 },
    });
    expect(invite).toBeNull();
  });

  it('auto-approves immediately when requireHostApprovalToInvite is false', async () => {
    await db.brunch.update({
      where: { id: brunchId },
      data: { requireHostApprovalToInvite: false },
    });

    const suggestion = await suggestInvitee(
      { brunchId, suggestedById: attendeeId, email: SUGGESTED_EMAIL_3 },
      { db, eventBus },
    );

    expect(suggestion.isOk()).toBe(true);
    expect(suggestion._unsafeUnwrap().status).toBe('approved');

    const invite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: SUGGESTED_EMAIL_3 },
    });
    expect(invite).not.toBeNull();

    await db.brunch.update({
      where: { id: brunchId },
      data: { requireHostApprovalToInvite: true },
    });
  });

  it('rejects a duplicate suggestion for the same email on the same brunch', async () => {
    const result = await suggestInvitee(
      { brunchId, suggestedById: attendeeId, email: SUGGESTED_EMAIL_1 },
      { db, eventBus },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_suggested' });
  });

  it('rejects a suggestion from a non-attendee, non-host user', async () => {
    const outsider = await db.user.create({
      data: { name: 'Integration Outsider', email: `integration-outsider-${RUN_ID}@example.com` },
    });

    const result = await suggestInvitee(
      { brunchId, suggestedById: outsider.id as UserId, email: `random-${RUN_ID}@example.com` },
      { db, eventBus },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_attendee' });

    await db.user.delete({ where: { id: outsider.id } });
  });

  it('rejects reviewing the same suggestion twice', async () => {
    const suggestionRow = await db.brunchInviteSuggestion.findFirstOrThrow({
      where: { brunchId, suggestedEmail: SUGGESTED_EMAIL_1 },
    });

    const result = await reviewInviteSuggestion(
      {
        suggestionId: suggestionRow.id as InviteSuggestionId,
        reviewedById: hostId,
        decision: 'decline',
      },
      { db, eventBus },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_reviewed' });
  });
});
