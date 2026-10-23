import { randomUUID } from 'node:crypto';
import { createDb } from '@brunchsters/database';
import {
  RATE_LIMIT_POLICIES,
  type BrunchId,
  type InviteId,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresRateLimiter } from '../rateLimit/PostgresRateLimiter';
import { getInviteWaits } from './getInviteWaits';

// Requires: supabase start + the RateLimitBucket migration. The counters are keyed by ids made up
// here (they have no foreign keys), and the suite deletes its own rows at the end.
const db = createDb();
const limiter = new PostgresRateLimiter({ db });
const RUN = randomUUID();

const brunchId = `${RUN}-brunch` as BrunchId;
const hostId = `${RUN}-host` as UserId;
const inviteId = `${RUN}-invite` as InviteId;
const otherInviteId = `${RUN}-other` as InviteId;

afterAll(async () => {
  await db.rateLimitBucket.deleteMany({ where: { key: { contains: RUN } } });
  await db.$disconnect();
});

describe('getInviteWaits against the real counters', () => {
  it('says what the budgets that really refuse would say, and spends nothing by asking', async () => {
    const ask = async () =>
      (
        await getInviteWaits(
          { brunchId, hostId, inviteIds: [inviteId, otherInviteId] },
          { rateLimiter: limiter },
        )
      )._unsafeUnwrap();

    // Nothing spent: nothing to wait for. Asking twice changes nothing.
    expect(await ask()).toEqual({ send: undefined, resend: {} });
    expect(await ask()).toEqual({ send: undefined, resend: {} });

    // One invite is resent: only that invite waits, and it says it is the cooldown.
    await limiter.consume({ policy: RATE_LIMIT_POLICIES.resendPerInvite, subject: inviteId });
    const afterResend = await ask();
    expect(afterResend.send).toBeUndefined();
    expect(Object.keys(afterResend.resend)).toEqual([inviteId]);
    expect(afterResend.resend[inviteId]?.policy).toBe('resend-invite');

    // The brunch's budget is used up: sending waits, resending (the host's budget) does not.
    await limiter.consume({
      policy: RATE_LIMIT_POLICIES.inviteEmailsPerBrunch,
      subject: brunchId,
      cost: RATE_LIMIT_POLICIES.inviteEmailsPerBrunch.limit,
    });
    const afterBrunch = await ask();
    expect(afterBrunch.send?.policy).toBe('invite-emails-brunch');
    expect(Object.keys(afterBrunch.resend)).toEqual([inviteId]);

    // The host's day is used up: every control that emails waits, with the day's reason.
    await limiter.consume({
      policy: RATE_LIMIT_POLICIES.inviteEmailsPerHost,
      subject: hostId,
      cost: RATE_LIMIT_POLICIES.inviteEmailsPerHost.limit,
    });
    const afterHost = await ask();
    expect(afterHost.send?.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(afterHost.resend[otherInviteId]?.policy).toBe('invite-emails-host');
    expect(afterHost.resend[inviteId]?.policy).toBe('invite-emails-host');

    // And it agrees with what really refuses: a send is refused, by the same policy.
    const refused = await limiter.consume({
      policy: RATE_LIMIT_POLICIES.inviteEmailsPerHost,
      subject: hostId,
    });
    expect(refused._unsafeUnwrap()).toMatchObject({ allowed: false });
  });
});
