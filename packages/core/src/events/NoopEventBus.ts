import type { EventBus } from './EventBus';

// Placeholder until the Inngest spec ships a queue-backed implementation.
// Injected where an EventBus is required so service signatures don't change later.
export class NoopEventBus implements EventBus {
  emit(): Promise<void> {
    return Promise.resolve();
  }
}
