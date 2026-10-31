import { updateVotingDeadline } from '@brunchsters/core';
import type { BrunchId } from '@brunchsters/shared';
import { Inngest } from 'inngest';
import { E2E_INNGEST_URL } from './env';
import { getDb } from './db';
import { runOutcomes, waitForRuns } from './queue';
import type { TestUser } from './factories';

// Driving the clock's jobs from a journey (spec 0015 M7). The scheduler function is triggered by a
// cron and also by the `scheduler/tick` event; a journey sends the event for ONE brunch and waits for
// the run to finish, so the real function runs on the real queue without waiting 15 minutes and
// without touching anyone else's brunch (the event carries the brunch's id).

const client = new Inngest({
  id: 'brunchsters-e2e-scheduler',
  isDev: true,
  baseUrl: E2E_INNGEST_URL,
});

const TICK_SETTLE_MS = 750;

// `ticks` is how many ticks this journey has sent for the brunch so far, including this one.
export async function tickScheduler(params: {
  readonly brunchId: BrunchId;
  readonly ticks: number;
}): Promise<string> {
  await client.send({ name: 'scheduler/tick', data: { brunchId: params.brunchId } });
  await waitForRuns({
    event: 'scheduler/tick',
    brunchId: params.brunchId,
    runs: params.ticks,
    events: params.ticks,
  });
  // Finished is not the same as worked: a run that failed would leave the brunch as it was and the
  // journey would blame the page. Say what the runs did.
  const outcomes = await runOutcomes({
    event: 'scheduler/tick',
    brunchId: params.brunchId,
    events: params.ticks,
  });
  const failed = outcomes.filter((outcome) => outcome.status !== 'Completed');
  if (failed.length > 0) {
    throw new Error(`A scheduler tick did not complete: ${JSON.stringify(outcomes)}`);
  }
  // The dev server reports a run Completed a few tens of milliseconds before the run's last database
  // write can be read (found in M7: a journey that read the brunch the instant the run finished saw
  // it unchanged about 1 time in 20, while the scheduler's own log showed the write a moment later).
  // A journey that waits for an effect polls for it; one that shows something did NOT happen needs
  // the run to be truly over first, so it settles here.
  await new Promise((resolve) => setTimeout(resolve, TICK_SETTLE_MS));
  return JSON.stringify(outcomes);
}

// A voting deadline that is close, and was set a while ago: what a brunch looks like a day before
// its vote closes. No service sets one (they record "set now"), so this reaches state directly,
// like `passVotingDeadline`, leaving everything else as the app made it.
export async function setDeadlineAsOf(params: {
  readonly brunchId: BrunchId;
  readonly hoursAhead: number;
  readonly setDaysAgo: number;
}): Promise<Date> {
  const deadline = new Date(Date.now() + params.hoursAhead * 3_600_000);
  await getDb().brunch.update({
    where: { id: params.brunchId },
    data: {
      votingDeadline: deadline,
      votingDeadlineSetAt: new Date(Date.now() - params.setDaysAgo * 86_400_000),
    },
  });
  return deadline;
}

// The host sets a deadline through the real service, as the app does: it is recorded as set now.
export async function hostSetsDeadline(params: {
  readonly brunchId: BrunchId;
  readonly host: TestUser;
  readonly hoursAhead: number;
}): Promise<void> {
  const result = await updateVotingDeadline(
    {
      brunchId: params.brunchId,
      requestedById: params.host.id,
      votingDeadline: new Date(Date.now() + params.hoursAhead * 3_600_000).toISOString(),
    },
    { db: getDb() },
  );
  if (result.isErr())
    throw new Error(`updateVotingDeadline failed: ${JSON.stringify(result.error)}`);
}
