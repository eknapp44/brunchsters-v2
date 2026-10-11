import { NoopEventBus, type EventBus } from '@brunchsters/core';

// The one place the app decides which EventBus implementation runs, so routes
// never construct their own. Still the no-op bus until the Inngest-backed one
// is wired in (spec 0008, ADR 0009).
export const eventBus: EventBus = new NoopEventBus();
