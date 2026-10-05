import { createDb } from '@brunchsters/database';
import type { BrunchId, InviteToken, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { respondToInvite } from '../invite/respondToInvite';
import { sendInvites } from '../invite/sendInvites';
import { NoopEventBus } from '../events/NoopEventBus';
import { castTimeBallot } from './castTimeBallot';
import { createBrunch } from './createBrunch';
import { deriveDecisionMode } from './guards/deriveDecisionMode';
import { getBrunchVoting } from './getBrunchVoting';
import { reviewTimeSuggestion } from './reviewTimeSuggestion';
import { suggestTime } from './suggestTime';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-optionsuggest-host-${RUN_ID}@example.com`;
const VOTER_EMAIL = `integration-optionsuggest-voter-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let voterId: UserId;
const createdBrunchIds: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a row, found none');
  return value;
}

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration OptionSuggest Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;
  const voter = await db.user.create({
    data: { name: 'Integration OptionSuggest Voter', email: VOTER_EMAIL },
  });
  voterId = voter.id as UserId;
});

afterAll(async () => {
  await db.brunchTimeVote.deleteMany({
    where: { brunchTime: { brunchId: { in: createdBrunchIds } } },
  });
  await db.brunchTimeSuggestion.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchTime.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({ where: { email: { in: [HOST_EMAIL, VOTER_EMAIL] } } });
});

async function createBrunchWithOneYesVoter(title: string): Promise<BrunchId> {
  const brunch = await createBrunch(
    {
      title,
      hostId,
      locations: [],
      times: [{ scheduledAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString() }],
    },
    { db, eventBus },
  );
  expect(brunch.isOk()).toBe(true);
  const brunchId = brunch._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const invites = await sendInvites(
    { brunchId, invitedById: hostId, emails: [VOTER_EMAIL] },
    { db, eventBus },
  );
  expect(invites.isOk()).toBe(true);

  const invite = required(
    await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: VOTER_EMAIL } }),
  );
  const joined = await respondToInvite(
    { token: invite.token as InviteToken, viewerId: voterId, response: 'yes' },
    { db, eventBus },
  );
  expect(joined.isOk()).toBe(true);

  return brunchId;
}

describe('option suggestions (integration — real Postgres)', () => {
  it('a pending suggestion does not flip the derived mode', async () => {
    const brunchId = await createBrunchWithOneYesVoter('pending-no-flip');

    expect(await deriveDecisionMode({ brunchId, kind: 'time' }, { db })).toBe('host_decides');

    const suggested = await suggestTime(
      {
        brunchId,
        suggestedById: voterId,
        scheduledAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { db },
    );
    expect(suggested.isOk()).toBe(true);
    expect(suggested._unsafeUnwrap().status).toBe('pending');

    // The invariant ADR 0006 depends on: a pending suggestion is not a real
    // BrunchTime row, so it must not be counted toward the derived mode.
    expect(await deriveDecisionMode({ brunchId, kind: 'time' }, { db })).toBe('host_decides');
  });

  it('approval makes the suggestion a real, votable option and flips the mode', async () => {
    const brunchId = await createBrunchWithOneYesVoter('approve-then-vote');
    const newScheduledAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

    const suggested = await suggestTime(
      { brunchId, suggestedById: voterId, scheduledAt: newScheduledAt },
      { db },
    );
    expect(suggested.isOk()).toBe(true);
    const suggestionId = suggested._unsafeUnwrap().suggestionId;

    const reviewed = await reviewTimeSuggestion(
      { suggestionId, reviewedById: hostId, decision: 'approve' },
      { db },
    );
    expect(reviewed.isOk()).toBe(true);

    expect(await deriveDecisionMode({ brunchId, kind: 'time' }, { db })).toBe('group_vote');

    const newTime = required(
      await db.brunchTime.findFirst({
        where: { brunchId, scheduledAt: new Date(newScheduledAt) },
      }),
    );
    // Approving attributes the real option to the host, not the suggester —
    // same precedent as reviewInviteSuggestion attributing the invite to
    // the host.
    expect(newTime.proposedById).toBe(hostId);

    const voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    expect(voting?.times.options.map((o) => o.id)).toContain(newTime.id);

    const voted = await castTimeBallot(
      { brunchId, voterId, optionIds: [newTime.id as never] },
      { db, eventBus },
    );
    expect(voted.isOk()).toBe(true);

    const votingAfter = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    expect(votingAfter?.times.options.find((o) => o.id === newTime.id)?.voteCount).toBe(1);
  });

  it('a declined suggestion never becomes an option', async () => {
    const brunchId = await createBrunchWithOneYesVoter('decline');
    const suggestedScheduledAt = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString();

    const suggested = await suggestTime(
      { brunchId, suggestedById: voterId, scheduledAt: suggestedScheduledAt },
      { db },
    );
    expect(suggested.isOk()).toBe(true);
    const suggestionId = suggested._unsafeUnwrap().suggestionId;

    const reviewed = await reviewTimeSuggestion(
      { suggestionId, reviewedById: hostId, decision: 'decline' },
      { db },
    );
    expect(reviewed.isOk()).toBe(true);

    const createdTime = await db.brunchTime.findFirst({
      where: { brunchId, scheduledAt: new Date(suggestedScheduledAt) },
    });
    expect(createdTime).toBeNull();

    expect(await deriveDecisionMode({ brunchId, kind: 'time' }, { db })).toBe('host_decides');

    const suggestion = required(
      await db.brunchTimeSuggestion.findFirst({ where: { id: suggestionId } }),
    );
    const status = required(
      await db.brunchOptionSuggestionStatus.findFirst({ where: { id: suggestion.statusId } }),
    );
    expect(status.code).toBe('declined');
  });
});
