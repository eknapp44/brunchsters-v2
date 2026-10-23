import {
  RATE_LIMIT_POLICIES,
  type BrunchId,
  type InviteId,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { RateLimiterUnavailable } from '../rateLimit/consumeBudgets';
import type { RateLimiter, RateLimitStatus } from '../rateLimit/RateLimiter';

// What a host is waiting on, asked of the same counters that refuse (spec 0012, ADR 0013 addendum).
// The brunch page asks this as it loads and hands the answer to the panels, so a control's waiting
// state is the server's, and is the same in every tab and on every device. It is a derived
// presentation rule (a control is waiting because a budget says so), so it lives here and not in a
// component (ADR 0012). `retryAfterSeconds` is relative to when it was asked, and the browser turns
// it into a moment on its own clock.
export type InviteWait = {
  // The policy that holds it back, so the wording can say why (the cooldown or the day's budget).
  readonly policy: string;
  readonly retryAfterSeconds: number;
};

export type InviteWaits = {
  // Sending an invite, or approving a suggestion (both email one address): held by the brunch's
  // budget or the host's, whichever lasts longer. Undefined when both have room.
  readonly send: InviteWait | undefined;
  // Re-sending one invite, by invite id: held by that invite's cooldown or the host's budget,
  // whichever lasts longer. Only invites that are held appear.
  readonly resend: Readonly<Record<string, InviteWait>>;
};

export type GetInviteWaitsInput = {
  readonly brunchId: BrunchId;
  // The brunch's host. The caller has already established that: the page only asks when the host
  // check for the invite list passed, so nobody else can reach these budgets or see their state.
  readonly hostId: UserId;
  readonly inviteIds: readonly InviteId[];
};

function longest(candidates: readonly (InviteWait | undefined)[]): InviteWait | undefined {
  let best: InviteWait | undefined;
  for (const candidate of candidates) {
    if (
      candidate !== undefined &&
      (best === undefined || candidate.retryAfterSeconds > best.retryAfterSeconds)
    ) {
      best = candidate;
    }
  }
  return best;
}

function waitOf(policyName: string, status: RateLimitStatus | undefined): InviteWait | undefined {
  return status?.blocked === true
    ? { policy: policyName, retryAfterSeconds: status.retryAfterSeconds }
    : undefined;
}

export async function getInviteWaits(
  input: GetInviteWaitsInput,
  ctx: { readonly rateLimiter: RateLimiter },
): Promise<Result<InviteWaits, RateLimiterUnavailable>> {
  const brunchPolicy = RATE_LIMIT_POLICIES.inviteEmailsPerBrunch;
  const hostPolicy = RATE_LIMIT_POLICIES.inviteEmailsPerHost;
  const resendPolicy = RATE_LIMIT_POLICIES.resendPerInvite;

  // One read for all of it: the two budgets, then one cooldown per invite.
  const answered = await ctx.rateLimiter.peek([
    { policy: brunchPolicy, subject: input.brunchId },
    { policy: hostPolicy, subject: input.hostId },
    ...input.inviteIds.map((inviteId) => ({ policy: resendPolicy, subject: inviteId })),
  ]);
  if (answered.isErr()) {
    return err({ kind: 'rate_limiter_unavailable', cause: answered.error.cause });
  }
  const [brunchStatus, hostStatus, ...cooldowns] = answered.value;

  const brunchWait = waitOf(brunchPolicy.name, brunchStatus);
  const hostWait = waitOf(hostPolicy.name, hostStatus);

  const resend: Record<string, InviteWait> = {};
  input.inviteIds.forEach((inviteId, index) => {
    // A resend spends the invite's cooldown and one of the host's daily emails (not the brunch's).
    const wait = longest([waitOf(resendPolicy.name, cooldowns[index]), hostWait]);
    if (wait !== undefined) resend[inviteId] = wait;
  });

  return ok({ send: longest([brunchWait, hostWait]), resend });
}
