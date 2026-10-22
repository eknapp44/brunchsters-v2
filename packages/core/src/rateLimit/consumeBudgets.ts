import { err, ok, type Result } from 'neverthrow';
import type { ConsumeInput, RateLimiter } from './RateLimiter';

// What a service returns when a caller is over a budget. `policy` is the name of the policy that
// refused (a control words its message by it) and `retryAfterSeconds` is how long until that
// window ends.
export type RateLimited = {
  readonly kind: 'rate_limited';
  readonly policy: string;
  readonly retryAfterSeconds: number;
};

// The counter could not be read or written. Callers fail closed (ADR 0013): the request is refused,
// not let through.
export type RateLimiterUnavailable = {
  readonly kind: 'rate_limiter_unavailable';
  readonly cause: unknown;
};

// Spends each budget in order and stops at the first refusal. A budget spent before a later one
// refuses stays spent (ADR 0013: a failed attempt costing a little is simpler than refunds, and
// callers order the budgets so the broader one comes last).
export async function consumeBudgets(input: {
  readonly limiter: RateLimiter;
  readonly spends: readonly ConsumeInput[];
}): Promise<Result<void, RateLimited | RateLimiterUnavailable>> {
  for (const spend of input.spends) {
    const result = await input.limiter.consume(spend);
    if (result.isErr()) return err({ kind: 'rate_limiter_unavailable', cause: result.error.cause });
    if (!result.value.allowed) {
      return err({
        kind: 'rate_limited',
        policy: spend.policy.name,
        retryAfterSeconds: result.value.retryAfterSeconds,
      });
    }
  }
  return ok(undefined);
}
