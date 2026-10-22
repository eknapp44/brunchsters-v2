import type { DbClient } from '@brunchsters/database';
import { err, ok, type Result } from 'neverthrow';
import type { ConsumeInput, RateLimitDecision, RateLimiter, RateLimitError } from './RateLimiter';
import { secondsUntilWindowEnd, windowStartFor } from './retryAfter';

// The counter lives in RateLimitBucket (ADR 0013), one row per "<policy>:<subject>" and window.
export class PostgresRateLimiter implements RateLimiter {
  private readonly db: DbClient;
  private readonly now: () => Date;

  // `now` is injectable so a test can prove a window rolling over without sleeping.
  constructor(params: { readonly db: DbClient; readonly now?: () => Date }) {
    this.db = params.db;
    this.now = params.now ?? (() => new Date());
  }

  async consume(input: ConsumeInput): Promise<Result<RateLimitDecision, RateLimitError>> {
    const cost = input.cost ?? 1;
    if (!Number.isInteger(cost) || cost < 1) {
      throw new Error(`Rate limit cost must be a positive whole number, got ${cost}`);
    }
    const { policy } = input;
    const now = this.now();
    const retryAfterSeconds = secondsUntilWindowEnd({ now, windowSeconds: policy.windowSeconds });
    // More than the whole limit can never fit in a window: refuse without touching the table.
    if (cost > policy.limit) return ok({ allowed: false, retryAfterSeconds });

    const key = `${policy.name}:${input.subject}`;
    const windowStart = windowStartFor({ now, windowSeconds: policy.windowSeconds });

    try {
      // One statement, so two requests at once cannot both squeeze under the limit, and a
      // request that would go over matches no row to update and changes nothing (a denied
      // request spends nothing). The first request of a window inserts, and cost <= limit was
      // checked above, so an insert never starts over the limit.
      const rows = await this.db.$queryRaw<ReadonlyArray<{ readonly count: number }>>`
        INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
        VALUES (${key}, ${windowStart}, ${cost})
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "count" = "RateLimitBucket"."count" + ${cost}
        WHERE "RateLimitBucket"."count" + ${cost} <= ${policy.limit}
        RETURNING "count"`;

      const [row] = rows;
      if (row === undefined) return ok({ allowed: false, retryAfterSeconds });
      return ok({ allowed: true, remaining: policy.limit - Number(row.count) });
    } catch (cause) {
      return err({ kind: 'db_error', cause });
    }
  }
}
