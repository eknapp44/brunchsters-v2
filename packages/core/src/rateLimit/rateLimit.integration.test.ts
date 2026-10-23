import { randomUUID } from 'node:crypto';
import { createDb } from '@brunchsters/database';
import type { RateLimitPolicy } from '@brunchsters/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresRateLimiter } from './PostgresRateLimiter';
import { pruneRateLimitBuckets } from './pruneRateLimitBuckets';
import { describeRateLimiterContract } from './rateLimiterContract';

// Requires: supabase start + migrations applied (RateLimitBucket). The counters persist, so every
// test uses a fresh subject and the suite deletes its own rows at the end.
// The race tests send fifty requests at once. Prisma's pool grows to 2 x CPUs + 1 connections to
// serve them, and with every integration file running in parallel that exhausts the local
// Postgres's 100 connections ("too many clients already"), failing unrelated files. Eight at a
// time still races the statements against each other, and the rest queue.
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
databaseUrl.searchParams.set('connection_limit', '8');
process.env.DATABASE_URL = databaseUrl.toString();

const db = createDb();
const RUN = `it-${randomUUID()}`;

afterAll(async () => {
  await db.rateLimitBucket.deleteMany({ where: { key: { contains: RUN } } });
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: 'contract-' } } });
  await db.$disconnect();
});

describeRateLimiterContract({
  name: 'PostgresRateLimiter',
  create: (clock) => new PostgresRateLimiter({ db, now: clock.now }),
});

describe('PostgresRateLimiter against a real database', () => {
  it('lets exactly the limit through when fifty requests arrive at once', async () => {
    const policy: RateLimitPolicy = { name: 'race-test', limit: 10, windowSeconds: 3_600 };
    const limiter = new PostgresRateLimiter({ db });
    const subject = `${RUN}-race`;

    const results = await Promise.all(
      Array.from({ length: 50 }, () => limiter.consume({ policy, subject })),
    );

    const allowed = results.filter((result) => result._unsafeUnwrap().allowed);
    expect(allowed).toHaveLength(10);
    const row = await db.rateLimitBucket.findFirstOrThrow({
      where: { key: `race-test:${subject}` },
    });
    // The stored count is the limit, not the number of attempts: refusals are not counted.
    expect(row.count).toBe(10);
  });

  it('lets exactly the limit through when units are spent in different sizes at once', async () => {
    const policy: RateLimitPolicy = { name: 'race-cost-test', limit: 10, windowSeconds: 3_600 };
    const limiter = new PostgresRateLimiter({ db });
    const subject = `${RUN}-race-cost`;

    const results = await Promise.all(
      [3, 4, 5, 2, 6, 1, 3, 4].map((cost) => limiter.consume({ policy, subject, cost })),
    );

    const spent = results.flatMap((result, index) =>
      result._unsafeUnwrap().allowed ? [[3, 4, 5, 2, 6, 1, 3, 4][index] ?? 0] : [],
    );
    const total = spent.reduce((sum, cost) => sum + cost, 0);
    expect(total).toBeLessThanOrEqual(10);
    const row = await db.rateLimitBucket.findFirstOrThrow({
      where: { key: `race-cost-test:${subject}` },
    });
    expect(row.count).toBe(total);
  });

  it('returns a db_error, not an exception, when the database cannot be reached', async () => {
    const limiter = new PostgresRateLimiter({
      db: {
        $queryRaw: () => Promise.reject(new Error('connection refused')),
      } as unknown as typeof db,
    });

    const result = await limiter.consume({
      policy: { name: 'down-test', limit: 1, windowSeconds: 60 },
      subject: `${RUN}-down`,
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: 'db_error' });
  });
});

describe('pruneRateLimitBuckets against a real database', () => {
  it('deletes counters older than two days and keeps the recent ones', async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const key = (label: string): string => `prune-test:${RUN}-${label}`;
    await db.rateLimitBucket.createMany({
      data: [
        { key: key('old'), windowStart: new Date(now.getTime() - 3 * day), count: 1 },
        { key: key('just-over'), windowStart: new Date(now.getTime() - 2 * day - 1000), count: 1 },
        // 36 hours old: inside the two-day retention, and not on the cutoff itself.
        {
          key: key('thirty-six-hours'),
          windowStart: new Date(now.getTime() - 1.5 * day),
          count: 1,
        },
        { key: key('yesterday'), windowStart: new Date(now.getTime() - day), count: 1 },
        { key: key('today'), windowStart: now, count: 1 },
      ],
    });

    const result = await pruneRateLimitBuckets({ now }, { db });

    expect(result._unsafeUnwrap().deleted).toBeGreaterThanOrEqual(2);
    const left = await db.rateLimitBucket.findMany({
      where: { key: { startsWith: `prune-test:${RUN}` } },
      orderBy: { windowStart: 'asc' },
    });
    expect(left.map((row) => row.key)).toEqual([
      key('thirty-six-hours'),
      key('yesterday'),
      key('today'),
    ]);
  });
});
