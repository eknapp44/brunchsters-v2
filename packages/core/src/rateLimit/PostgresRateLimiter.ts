import type { DbClient } from '@brunchsters/database';
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

  // One read for all the questions. A bucket is one row per key and window, so a key can have a
  // current row and an older one still waiting to be pruned: the current window is picked by its
  // start. A key with no row for this window has spent nothing.
  async peek(
    inputs: readonly PeekInput[],
  ): Promise<Result<readonly RateLimitStatus[], RateLimitError>> {
    if (inputs.length === 0) return ok([]);
    const now = this.now();
    const questions = inputs.map((input) => ({
      key: `${input.policy.name}:${input.subject}`,
      windowStart: windowStartFor({ now, windowSeconds: input.policy.windowSeconds }).getTime(),
      retryAfterSeconds: secondsUntilWindowEnd({ now, windowSeconds: input.policy.windowSeconds }),
      limit: input.policy.limit,
      cost: input.cost ?? 1,
    }));
    for (const question of questions) {
      if (!Number.isInteger(question.cost) || question.cost < 1) {
        throw new Error(`Rate limit cost must be a positive whole number, got ${question.cost}`);
      }
    }

    try {
      const keys = [...new Set(questions.map((question) => question.key))];
      const rows = await this.db.$queryRaw<
        ReadonlyArray<{ readonly key: string; readonly windowStart: Date; readonly count: number }>
      >`SELECT "key", "windowStart", "count" FROM "RateLimitBucket" WHERE "key" = ANY(${keys}::text[])`;
      const spent = new Map(
        rows.map((row) => [`${row.key}@${row.windowStart.getTime()}`, Number(row.count)]),
      );

      return ok(
        questions.map((question): RateLimitStatus => {
          const used = spent.get(`${question.key}@${question.windowStart}`) ?? 0;
          // The same rule consume applies, without spending: more than the whole limit never
          // fits, otherwise it fits while used + cost stays within the limit.
          return question.cost > question.limit || used + question.cost > question.limit
            ? { blocked: true, retryAfterSeconds: question.retryAfterSeconds }
            : { blocked: false, remaining: question.limit - used };
        }),
      );
    } catch (cause) {
      return err({ kind: 'db_error', cause });
    }
  }
}
