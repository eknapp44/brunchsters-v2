import { RATE_LIMIT_POLICIES, type UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { RateLimiterUnavailable } from '../rateLimit/consumeBudgets';
import type { RateLimiter } from '../rateLimit/RateLimiter';

// What "Call it off" is waiting on, asked of the same counter that refuses (spec 0013, ADR 0013
// addendum): the host's daily budget of cancellations. The manage page asks it as it loads and hands
// the answer to the control, so the wait is the server's and is the same in every tab and on every
// device. A derived presentation rule, so it lives here and not in a component (ADR 0012).
// `retryAfterSeconds` is relative to when it was asked.
export type CancelWait = {
  readonly policy: string;
  readonly retryAfterSeconds: number;
};

export async function getCancelWait(
  input: { readonly hostId: UserId },
  ctx: { readonly rateLimiter: RateLimiter },
): Promise<Result<CancelWait | undefined, RateLimiterUnavailable>> {
  const policy = RATE_LIMIT_POLICIES.cancelNoticesPerHost;

  const answered = await ctx.rateLimiter.peek([{ policy, subject: input.hostId }]);
  if (answered.isErr()) {
    return err({ kind: 'rate_limiter_unavailable', cause: answered.error.cause });
  }

  const status = answered.value[0];
  return ok(
    status?.blocked === true
      ? { policy: policy.name, retryAfterSeconds: status.retryAfterSeconds }
      : undefined,
  );
}
