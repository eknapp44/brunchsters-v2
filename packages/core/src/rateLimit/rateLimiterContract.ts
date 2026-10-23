import { randomUUID } from 'node:crypto';
import type { RateLimitPolicy } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import type { RateLimitDecision, RateLimiter, RateLimitStatus } from './RateLimiter';

// The behavior every RateLimiter must have, run against each implementation (the in-memory one in
// a unit test, the Postgres one in an integration test), so they cannot drift apart.
export type TestClock = {
  readonly now: () => Date;
  readonly set: (iso: string) => void;
};

export function createTestClock(startIso: string): TestClock {
  let current = new Date(startIso);
  return {
    now: () => current,
    set: (iso) => {
      current = new Date(iso);
    },
  };
}

const POLICY: RateLimitPolicy = { name: 'contract-test', limit: 5, windowSeconds: 60 };
const OTHER_POLICY: RateLimitPolicy = { name: 'contract-other', limit: 5, windowSeconds: 60 };
// Ten seconds into a minute window.
const START = '2026-03-01T12:00:10Z';

export function describeRateLimiterContract(params: {
  readonly name: string;
  readonly create: (clock: TestClock) => RateLimiter;
}): void {
  describe(`${params.name} (RateLimiter contract)`, () => {
    // A fresh subject per test: the Postgres counters persist between runs.
    function setup(): {
      readonly limiter: RateLimiter;
      readonly clock: TestClock;
      readonly subject: string;
      readonly consume: (input?: {
        readonly cost?: number;
        readonly policy?: RateLimitPolicy;
        readonly subject?: string;
      }) => Promise<RateLimitDecision>;
    } {
      const clock = createTestClock(START);
      const limiter = params.create(clock);
      const subject = `contract-${randomUUID()}`;
      return {
        limiter,
        clock,
        subject,
        consume: async (input = {}) => {
          const result = await limiter.consume({
            policy: input.policy ?? POLICY,
            subject: input.subject ?? subject,
            ...(input.cost !== undefined ? { cost: input.cost } : {}),
          });
          if (result.isErr()) throw new Error(`consume failed: ${JSON.stringify(result.error)}`);
          return result.value;
        },
      };
    }

    it('allows up to the limit, counting down what is left, then refuses', async () => {
      const { consume } = setup();

      for (const remaining of [4, 3, 2, 1, 0]) {
        expect(await consume()).toEqual({ allowed: true, remaining });
      }
      expect(await consume()).toEqual({ allowed: false, retryAfterSeconds: 50 });
    });

    it('does not count a refused request, so a smaller one still fits afterwards', async () => {
      const { consume } = setup();

      expect(await consume({ cost: 3 })).toEqual({ allowed: true, remaining: 2 });
      expect(await consume({ cost: 3 })).toMatchObject({ allowed: false });
      expect(await consume({ cost: 3 })).toMatchObject({ allowed: false });
      // Had the refusals counted, there would be nothing left for this.
      expect(await consume({ cost: 2 })).toEqual({ allowed: true, remaining: 0 });
    });

    it('spends several units at once', async () => {
      const { consume } = setup();

      expect(await consume({ cost: 5 })).toEqual({ allowed: true, remaining: 0 });
      expect(await consume()).toMatchObject({ allowed: false });
    });

    it('refuses a request bigger than the whole limit and spends nothing', async () => {
      const { consume } = setup();

      expect(await consume({ cost: 6 })).toEqual({ allowed: false, retryAfterSeconds: 50 });
      expect(await consume({ cost: 5 })).toEqual({ allowed: true, remaining: 0 });
    });

    it('says how long until the window ends, at least one second', async () => {
      const { consume, clock } = setup();
      await consume({ cost: 5 });

      expect(await consume()).toEqual({ allowed: false, retryAfterSeconds: 50 });
      clock.set('2026-03-01T12:00:59.500Z');
      expect(await consume()).toEqual({ allowed: false, retryAfterSeconds: 1 });
    });

    it('starts a fresh count when the window rolls over', async () => {
      const { consume, clock } = setup();
      await consume({ cost: 5 });
      expect(await consume()).toMatchObject({ allowed: false });

      clock.set('2026-03-01T12:01:00Z');

      expect(await consume()).toEqual({ allowed: true, remaining: 4 });
    });

    it('keeps subjects and policies apart', async () => {
      const { consume } = setup();
      await consume({ cost: 5 });

      expect(await consume({ subject: `contract-${randomUUID()}` })).toMatchObject({
        allowed: true,
      });
      expect(await consume({ policy: OTHER_POLICY })).toMatchObject({ allowed: true });
    });

    it('refuses a cost that is not a positive whole number as a programming error', async () => {
      const { limiter, subject } = setup();

      for (const cost of [0, -1, 1.5, Number.NaN]) {
        await expect(limiter.consume({ policy: POLICY, subject, cost })).rejects.toThrow(
          /positive whole number/,
        );
      }
    });

    // ---- peek: the same answer consume would give, without spending ------------------------

    async function peekOne(
      limiter: RateLimiter,
      input: {
        readonly subject: string;
        readonly policy?: RateLimitPolicy;
        readonly cost?: number;
      },
    ): Promise<RateLimitStatus> {
      const result = await limiter.peek([
        {
          policy: input.policy ?? POLICY,
          subject: input.subject,
          ...(input.cost !== undefined ? { cost: input.cost } : {}),
        },
      ]);
      if (result.isErr()) throw new Error(`peek failed: ${JSON.stringify(result.error)}`);
      const [status] = result.value;
      if (status === undefined) throw new Error('peek answered nothing');
      return status;
    }

    it('peek says what is left, and when the budget is spent says how long to wait', async () => {
      const { limiter, subject, consume } = setup();

      expect(await peekOne(limiter, { subject })).toEqual({ blocked: false, remaining: 5 });
      await consume({ cost: 2 });
      expect(await peekOne(limiter, { subject })).toEqual({ blocked: false, remaining: 3 });
      await consume({ cost: 3 });
      // The same wait consume gives: ten seconds into a minute window leaves fifty.
      expect(await peekOne(limiter, { subject })).toEqual({ blocked: true, retryAfterSeconds: 50 });
    });

    it('peek spends nothing, however often it is asked', async () => {
      const { limiter, subject, consume } = setup();

      for (let ask = 0; ask < 12; ask += 1) await peekOne(limiter, { subject });

      // All five are still there.
      for (const remaining of [4, 3, 2, 1, 0]) {
        expect(await consume()).toEqual({ allowed: true, remaining });
      }
    });

    it('peek asks about a request of a given size: blocked when it would not fit', async () => {
      const { limiter, subject, consume } = setup();
      await consume({ cost: 3 });

      expect(await peekOne(limiter, { subject, cost: 2 })).toEqual({
        blocked: false,
        remaining: 2,
      });
      expect(await peekOne(limiter, { subject, cost: 3 })).toMatchObject({ blocked: true });
      // More than the whole limit never fits, whatever has been spent.
      expect(await peekOne(limiter, { subject: `contract-${randomUUID()}`, cost: 6 })).toEqual({
        blocked: true,
        retryAfterSeconds: 50,
      });
    });

    it('peek is open again when the window rolls over', async () => {
      const { limiter, subject, consume, clock } = setup();
      await consume({ cost: 5 });
      expect(await peekOne(limiter, { subject })).toMatchObject({ blocked: true });

      clock.set('2026-03-01T12:01:00Z');

      expect(await peekOne(limiter, { subject })).toEqual({ blocked: false, remaining: 5 });
    });

    it('peek answers several questions in order, for different subjects and policies', async () => {
      const { limiter, subject, consume } = setup();
      await consume({ cost: 5 });
      const stranger = `contract-${randomUUID()}`;

      const result = await limiter.peek([
        { policy: POLICY, subject },
        { policy: POLICY, subject: stranger },
        { policy: OTHER_POLICY, subject },
        { policy: POLICY, subject },
      ]);

      expect(result._unsafeUnwrap().map((status) => status.blocked)).toEqual([
        true,
        false,
        false,
        true,
      ]);
    });

    it('peek answers an empty question with an empty answer', async () => {
      const { limiter } = setup();

      expect((await limiter.peek([]))._unsafeUnwrap()).toEqual([]);
    });

    it('peek refuses a cost that is not a positive whole number as a programming error', async () => {
      const { limiter, subject } = setup();

      for (const cost of [0, -1, 1.5, Number.NaN]) {
        await expect(limiter.peek([{ policy: POLICY, subject, cost }])).rejects.toThrow(
          /positive whole number/,
        );
      }
    });
  });
}
