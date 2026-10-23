import { err, ok, type Result } from 'neverthrow';
import type {
  ConsumeInput,
  PeekInput,
  RateLimitDecision,
  RateLimiter,
  RateLimitError,
  RateLimitStatus,
} from './RateLimiter';
import { secondsUntilWindowEnd, windowStartFor } from './retryAfter';

// For unit tests of services and handlers (like MockEmailService): the same decisions as the
// Postgres limiter, kept in a Map and never pruned. Not for production: on a serverless host each
// instance would count alone.
export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();
  private readonly now: () => Date;
  private readonly failure: unknown;

  // `failWith` makes every consume return a db_error, for the "fail closed" paths.
  constructor(params: { readonly now?: () => Date; readonly failWith?: unknown } = {}) {
    this.now = params.now ?? (() => new Date());
    this.failure = params.failWith;
  }

  // async so a programming error (a bad cost) is a rejected promise, like the Postgres limiter's.
  async consume(input: ConsumeInput): Promise<Result<RateLimitDecision, RateLimitError>> {
    if (this.failure !== undefined) {
      return err({ kind: 'db_error', cause: this.failure });
    }
    const cost = input.cost ?? 1;
    if (!Number.isInteger(cost) || cost < 1) {
      throw new Error(`Rate limit cost must be a positive whole number, got ${cost}`);
    }
    const { policy } = input;
    const now = this.now();
    const wait = secondsUntilWindowEnd({ now, windowSeconds: policy.windowSeconds });
    if (cost > policy.limit) return ok({ allowed: false, retryAfterSeconds: wait });

    const windowStart = windowStartFor({ now, windowSeconds: policy.windowSeconds });
    const key = `${policy.name}:${input.subject}@${windowStart.getTime()}`;
    const used = this.counts.get(key) ?? 0;
    if (used + cost > policy.limit) {
      return ok({ allowed: false, retryAfterSeconds: wait });
    }
    this.counts.set(key, used + cost);
    return ok({ allowed: true, remaining: policy.limit - used - cost });
  }

  // async for the same reason as consume: a bad cost is a rejected promise.
  async peek(
    inputs: readonly PeekInput[],
  ): Promise<Result<readonly RateLimitStatus[], RateLimitError>> {
    if (this.failure !== undefined) {
      return err({ kind: 'db_error', cause: this.failure });
    }
    const now = this.now();
    return ok(
      inputs.map((input): RateLimitStatus => {
        const cost = input.cost ?? 1;
        if (!Number.isInteger(cost) || cost < 1) {
          throw new Error(`Rate limit cost must be a positive whole number, got ${cost}`);
        }
        const { policy } = input;
        const windowStart = windowStartFor({ now, windowSeconds: policy.windowSeconds });
        const used =
          this.counts.get(`${policy.name}:${input.subject}@${windowStart.getTime()}`) ?? 0;
        return cost > policy.limit || used + cost > policy.limit
          ? {
              blocked: true,
              retryAfterSeconds: secondsUntilWindowEnd({
                now,
                windowSeconds: policy.windowSeconds,
              }),
            }
          : { blocked: false, remaining: policy.limit - used };
      }),
    );
  }
}
