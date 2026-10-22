import type { DbClient } from '@brunchsters/database';
import { RATE_LIMIT_RETENTION_DAYS } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

export type PruneRateLimitBucketsInput = { readonly now: Date };

export type PruneRateLimitBucketsError = { readonly kind: 'db_error'; readonly cause: unknown };

// Counters are operational data, not a domain entity: they are hard-deleted once they are older
// than the retention (ADR 0013, Constitution 11 and 30). A window is at most a day long, so
// nothing a limiter still reads is ever older than this.
export async function pruneRateLimitBuckets(
  input: PruneRateLimitBucketsInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ readonly deleted: number }, PruneRateLimitBucketsError>> {
  const cutoff = new Date(input.now.getTime() - RATE_LIMIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const { count } = await ctx.db.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });
    return ok({ deleted: count });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
