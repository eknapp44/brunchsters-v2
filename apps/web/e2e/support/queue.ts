import type { BrunchEventName, BrunchEventPayloads, EventBus } from '@brunchsters/core';
import { Inngest } from 'inngest';
import { E2E_INNGEST_URL } from './env';

// The same queue the app's own events go through (the Inngest dev server the suite runs beside the
// app, spec 0008), reachable from a test process. A factory that calls a core service with this bus
// makes the service emit exactly what it would from a route, and the real functions then run. It
// forwards only the events a journey needs it to; every other event is dropped as the factories'
// Noop bus does, so seeding stays quiet (an invite factory must not queue invite emails).

const FORWARDED: ReadonlySet<BrunchEventName> = new Set<BrunchEventName>([
  'brunch/cancelled',
  'brunch/reinstated',
]);

const client = new Inngest({
  id: 'brunchsters-e2e-harness',
  isDev: true,
  baseUrl: E2E_INNGEST_URL,
});

export const queueEventBus: EventBus = {
  async emit<N extends BrunchEventName>(name: N, data: BrunchEventPayloads[N]): Promise<void> {
    if (!FORWARDED.has(name)) return;
    await client.send({ name, data: { ...data } });
  },
};

type EventRecord = {
  readonly id: string;
  readonly name?: string;
  readonly data?: { readonly brunchId?: string };
};
type RunRecord = { readonly status?: string };

const FINISHED = new Set(['Completed', 'Failed', 'Cancelled']);

// Waits until the queue has handled one kind of event about one brunch: the event has reached the
// Inngest dev server (they show up about half a second after the request that sent them), and its
// runs (`runs` of them, one per function that handles it) have all finished. A journey that must show
// something did NOT happen (an email never sent, a row never written) waits for this first, so the
// quiet is observed after the work is done, never guessed with a pause. It looks only at this
// brunch's events, so other tests running at the same time do not hold it up.
// The dev server lists at most 51 events at a time, newest first, whatever limit is asked for, so
// with several tests running the newest 51 of everything can push this brunch's event out before it
// is looked at. Asking for the one event name keeps the competition to that kind of event, and the
// cursor pages back through older ones until this brunch's is found.
async function myEvents(params: {
  readonly event: string;
  readonly brunchId: string;
  readonly events: number;
}): Promise<EventRecord[]> {
  const found: EventRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 12; page += 1) {
    const query = new URLSearchParams({ name: params.event });
    if (cursor !== undefined) query.set('cursor', cursor);
    const body = (await (
      await fetch(`${E2E_INNGEST_URL}/v1/events?${query.toString()}`)
    ).json()) as {
      data?: readonly EventRecord[];
    };
    const events = body.data ?? [];
    found.push(
      ...events.filter(
        (event) => event.name === params.event && event.data?.brunchId === params.brunchId,
      ),
    );
    const last = events[events.length - 1];
    // Keep paging until every event this journey sent has been found: other journeys send 50 invites
    // at once, which pushes a brunch's own two events beyond the first page of that name.
    if (found.length >= params.events || last === undefined) break;
    cursor = last.id;
  }
  return found;
}

export async function waitForRuns(params: {
  readonly event: string;
  readonly brunchId: string;
  readonly runs: number;
  // How many events of this name the journey sent for the brunch (one unless it says).
  readonly events?: number;
}): Promise<void> {
  const deadline = Date.now() + 30_000;
  let last = 'the event has not reached the queue';
  while (Date.now() < deadline) {
    const mine = await myEvents({ ...params, events: params.events ?? 1 });
    const runs: RunRecord[] = [];
    for (const event of mine) {
      const found = (await (
        await fetch(`${E2E_INNGEST_URL}/v1/events/${event.id}/runs`)
      ).json()) as {
        data?: readonly RunRecord[];
      };
      runs.push(...(found.data ?? []));
    }
    if (runs.length >= params.runs && runs.every((run) => FINISHED.has(run.status ?? ''))) return;
    last = `${mine.length} event(s), ${runs.length} of ${params.runs} run(s), statuses ${runs
      .map((run) => run.status)
      .join(',')}`;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The queue never finished ${params.event} for the brunch (${last})`);
}
