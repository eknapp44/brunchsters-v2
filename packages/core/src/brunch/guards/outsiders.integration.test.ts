import { createDb } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type Email,
  type InviteId,
  type InviteToken,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopEventBus } from '../../events/NoopEventBus';
import { respondToInvite } from '../../invite/respondToInvite';
import { revokeInvite } from '../../invite/revokeInvite';
import { sendInvites } from '../../invite/sendInvites';
import { createBrunch } from '../createBrunch';
import { assertHostOf } from './assertHostOf';
import { isBrunchMember } from './isBrunchMember';
import { InMemoryRateLimiter } from '../../rateLimit/InMemoryRateLimiter';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
//
// "Outsider" means no relationship to the brunch: not the host, not a current attendee. The
// guards answer an outsider exactly as they would for something that does not exist, so an
// unrelated user cannot confirm that a brunch id is real (found by the e2e suite, spec 0006).
const RUN_ID = Date.now();
const email = (label: string): Email =>
  normalizeEmail(`integration-outsiders-${label}-${RUN_ID}@example.com`);

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let attendeeId: UserId;
let outsiderId: UserId;
let brunchId: BrunchId;

beforeAll(async () => {
  const create = async (label: string): Promise<UserId> =>
    (
      await db.user.create({
        data: { name: `Integration Outsiders ${label}`, email: email(label) },
      })
    ).id as UserId;
  hostId = await create('host');
  attendeeId = await create('attendee');
  outsiderId = await create('outsider');

  const created = await createBrunch(
    { title: 'outsiders', hostId, locations: [], times: [] },
    { db, eventBus },
  );
  brunchId = created._unsafeUnwrap().id;
  await sendInvites(
    { brunchId, invitedById: hostId, emails: [email('attendee')] },
    { rateLimiter: new InMemoryRateLimiter(), db, eventBus },
  );
  const invite = await db.brunchInvite.findFirst({
    where: { brunchId, invitedEmail: email('attendee') },
  });
  await respondToInvite(
    { token: invite?.token as InviteToken, viewerId: attendeeId, response: 'yes' },
    { db, eventBus },
  );
});

afterAll(async () => {
  await db.brunchAttendee.deleteMany({ where: { brunchId } });
  await db.brunchInvite.deleteMany({ where: { brunchId } });
  await db.brunch.deleteMany({ where: { id: brunchId } });
  await db.user.deleteMany({
    where: { email: { in: ['host', 'attendee', 'outsider'].map(email) } },
  });
});

describe('outsiders (integration — real Postgres)', () => {
  it('knows who belongs: the host and a current attendee, not an unrelated user', async () => {
    expect(await isBrunchMember({ brunchId, userId: hostId }, { db })).toBe(true);
    expect(await isBrunchMember({ brunchId, userId: attendeeId }, { db })).toBe(true);
    expect(await isBrunchMember({ brunchId, userId: outsiderId }, { db })).toBe(false);
  });

  it('assertHostOf answers a member with not_host and an outsider with brunch_not_found', async () => {
    const asHost = await assertHostOf({ brunchId, userId: hostId }, { db });
    const asMember = await assertHostOf({ brunchId, userId: attendeeId }, { db });
    const asOutsider = await assertHostOf({ brunchId, userId: outsiderId }, { db });

    expect(asHost.isOk()).toBe(true);
    expect(asMember._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(asOutsider._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });

    // The outsider's answer is the very one a made-up id gets.
    const madeUp = await assertHostOf(
      { brunchId: '00000000-0000-4000-8000-000000000000' as BrunchId, userId: outsiderId },
      { db },
    );
    expect(madeUp._unsafeUnwrapErr()).toEqual(asOutsider._unsafeUnwrapErr());
  });

  it('someone whose invite was revoked is an outsider again', async () => {
    const invite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: email('attendee') },
    });
    const revoked = await revokeInvite(
      { inviteId: invite?.id as InviteId, requestedById: hostId },
      { db },
    );
    expect(revoked.isOk()).toBe(true);

    expect(await isBrunchMember({ brunchId, userId: attendeeId }, { db })).toBe(false);
    const result = await assertHostOf({ brunchId, userId: attendeeId }, { db });
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });
});
