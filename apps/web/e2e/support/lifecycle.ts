import {
  cancelBrunch,
  NoopEventBus,
  PostgresRateLimiter,
  reinstateBrunch,
} from '@brunchsters/core';
import { CANCEL_NOTICE_HOLD_SECONDS, type BrunchId } from '@brunchsters/shared';
import type { Result } from 'neverthrow';
import { getDb } from './db';
import type { TestUser } from './factories';
import { queueEventBus } from './queue';

// Fixtures for the called-off journeys (spec 0013). Like every factory they go through the real
// core services, so the state they leave is one the app can reach. The one thing a journey cannot
// do is wait out the real hold (five minutes) before the email goes out, and the app must not grow
// a way to skip it. The hold is measured from the moment of the cancellation, which the service
// already takes as an input (`now`), so a journey calls the brunch off *as of* a moment the hold
// has already passed, and the real queue function then finds nothing left to wait for.

function unwrap<T, E>(result: Result<T, E>, what: string): T {
  if (result.isErr()) throw new Error(`${what} failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

// A moment far enough back that a hold started then is over. `extraSeconds` makes a second,
// different moment, so two cancellations of one brunch can be told apart.
export function afterTheHold(extraSeconds = 0): Date {
  return new Date(Date.now() - (CANCEL_NOTICE_HOLD_SECONDS + 60 + extraSeconds) * 1000);
}

// The host calls the brunch off, as of `at`. `announce: false` runs the same service but sends
// nothing to the queue, for a journey that wants to emit the event itself at the right moment.
export async function callOffBrunch(params: {
  readonly brunchId: BrunchId;
  readonly host: TestUser;
  readonly at?: Date;
  readonly announce?: boolean;
}): Promise<Date> {
  const result = await cancelBrunch(
    {
      brunchId: params.brunchId,
      requestedById: params.host.id,
      ...(params.at !== undefined ? { now: params.at } : {}),
    },
    {
      db: getDb(),
      eventBus: params.announce === false ? new NoopEventBus() : queueEventBus,
      // The real counter, like the invite factory: a host who calls off more than the daily budget
      // fails here as they would in the app.
      rateLimiter: new PostgresRateLimiter({ db: getDb() }),
    },
  );
  return unwrap(result, 'cancelBrunch').cancelledAt;
}

export async function bringBackBrunch(params: {
  readonly brunchId: BrunchId;
  readonly host: TestUser;
  readonly announce?: boolean;
}): Promise<void> {
  unwrap(
    await reinstateBrunch(
      { brunchId: params.brunchId, requestedById: params.host.id },
      { db: getDb(), eventBus: params.announce === false ? new NoopEventBus() : queueEventBus },
    ),
    'reinstateBrunch',
  );
}

// Queues a called-off event for a cancellation that was recorded earlier: what the queue delivers
// when a run wakes after the host has already changed their mind.
export async function announceCancellation(params: {
  readonly brunchId: BrunchId;
  readonly cancelledAt: Date;
}): Promise<void> {
  await queueEventBus.emit('brunch/cancelled', {
    brunchId: params.brunchId,
    cancelledAt: params.cancelledAt.toISOString(),
  });
}
