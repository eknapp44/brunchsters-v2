import {
  RATE_LIMIT_POLICIES,
  type BrunchId,
  type InviteId,
  type RateLimitPolicy,
  type UserId,
} from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { RecordingRateLimiter } from '../rateLimit/RecordingRateLimiter';
import { getInviteWaits } from './getInviteWaits';

const BRUNCH = 'brunch-1' as BrunchId;
const HOST = 'host-1' as UserId;
const A = 'invite-a' as InviteId;
const B = 'invite-b' as InviteId;

// Noon and ten seconds, UTC: a day window has 43,190 seconds left (to midnight) and a ten-minute
// window has 590. The waits below are the time left in each window.
const NOW = () => new Date('2026-03-01T12:00:10Z');
const { inviteEmailsPerBrunch, inviteEmailsPerHost, resendPerInvite } = RATE_LIMIT_POLICIES;

async function spendAll(
  limiter: InMemoryRateLimiter,
  policy: RateLimitPolicy,
  subject: string,
): Promise<void> {
  await limiter.consume({ policy, subject, cost: policy.limit });
}

describe('getInviteWaits', () => {
  it('has nothing to wait for when every budget has room', async () => {
    const rateLimiter = new InMemoryRateLimiter({ now: NOW });

    const result = await getInviteWaits(
      { brunchId: BRUNCH, hostId: HOST, inviteIds: [A, B] },
      { rateLimiter },
    );

    expect(result._unsafeUnwrap()).toEqual({ send: undefined, resend: {} });
  });

  it("holds sending when the brunch budget is spent, but not resending (a resend is not the brunch's)", async () => {
    const rateLimiter = new InMemoryRateLimiter({ now: NOW });
    await spendAll(rateLimiter, inviteEmailsPerBrunch, BRUNCH);

    const result = (
      await getInviteWaits({ brunchId: BRUNCH, hostId: HOST, inviteIds: [A] }, { rateLimiter })
    )._unsafeUnwrap();

    expect(result.send).toEqual({ policy: 'invite-emails-brunch', retryAfterSeconds: 43_190 });
    expect(result.resend).toEqual({});
  });

  it('holds sending and every resend when the host budget is spent', async () => {
    const rateLimiter = new InMemoryRateLimiter({ now: NOW });
    await spendAll(rateLimiter, inviteEmailsPerHost, HOST);

    const result = (
      await getInviteWaits({ brunchId: BRUNCH, hostId: HOST, inviteIds: [A, B] }, { rateLimiter })
    )._unsafeUnwrap();

    const wait = { policy: 'invite-emails-host', retryAfterSeconds: 43_190 };
    expect(result.send).toEqual(wait);
    expect(result.resend).toEqual({ [A]: wait, [B]: wait });
  });

  it('holds only the invite whose cooldown is running, and says it is the cooldown', async () => {
    const rateLimiter = new InMemoryRateLimiter({ now: NOW });
    await spendAll(rateLimiter, resendPerInvite, A);

    const result = (
      await getInviteWaits({ brunchId: BRUNCH, hostId: HOST, inviteIds: [A, B] }, { rateLimiter })
    )._unsafeUnwrap();

    expect(result.send).toBeUndefined();
    // Ten seconds into the ten-minute window leaves 590.
    expect(result.resend).toEqual({ [A]: { policy: 'resend-invite', retryAfterSeconds: 590 } });
  });

  it('names the longer wait when two things hold the same control (the day beats the cooldown)', async () => {
    const rateLimiter = new InMemoryRateLimiter({ now: NOW });
    await spendAll(rateLimiter, resendPerInvite, A);
    await spendAll(rateLimiter, inviteEmailsPerHost, HOST);

    const result = (
      await getInviteWaits({ brunchId: BRUNCH, hostId: HOST, inviteIds: [A] }, { rateLimiter })
    )._unsafeUnwrap();

    expect(result.resend[A]).toEqual({ policy: 'invite-emails-host', retryAfterSeconds: 43_190 });
  });

  it('names the longer of the brunch and host budgets for sending', async () => {
    const rateLimiter = new InMemoryRateLimiter({ now: NOW });
    await spendAll(rateLimiter, inviteEmailsPerBrunch, BRUNCH);
    await spendAll(rateLimiter, inviteEmailsPerHost, HOST);

    const result = (
      await getInviteWaits({ brunchId: BRUNCH, hostId: HOST, inviteIds: [] }, { rateLimiter })
    )._unsafeUnwrap();

    // Equal waits: the first (the brunch) is kept.
    expect(result.send).toMatchObject({ retryAfterSeconds: 43_190 });
  });

  it('asks about the brunch, the host and each invite, in one question, and spends nothing', async () => {
    const rateLimiter = new RecordingRateLimiter();

    await getInviteWaits({ brunchId: BRUNCH, hostId: HOST, inviteIds: [A, B] }, { rateLimiter });

    expect(rateLimiter.peeks).toEqual([
      { policy: 'invite-emails-brunch', subject: BRUNCH, cost: 1 },
      { policy: 'invite-emails-host', subject: HOST, cost: 1 },
      { policy: 'resend-invite', subject: A, cost: 1 },
      { policy: 'resend-invite', subject: B, cost: 1 },
    ]);
    expect(rateLimiter.spends).toEqual([]);
  });

  it('fails closed as "unavailable" when the counters cannot be read, so the caller can decide', async () => {
    const cause = new Error('database is down');

    const result = await getInviteWaits(
      { brunchId: BRUNCH, hostId: HOST, inviteIds: [A] },
      { rateLimiter: new InMemoryRateLimiter({ failWith: cause }) },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'rate_limiter_unavailable', cause });
  });
});
