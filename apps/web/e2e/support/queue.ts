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
