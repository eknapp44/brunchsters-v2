import type { BrunchEventName, BrunchEventPayloads, EventBus } from '@brunchsters/core';

// The slice of the Inngest client this adapter uses, so tests can pass a fake.
export type InngestSender = {
  readonly send: (event: {
    readonly name: string;
    readonly data: Record<string, unknown>;
  }) => Promise<unknown>;
};

export class InngestEventBus implements EventBus {
  // `queuedEvents` is the set of event names some function handles. Anything else is dropped
  // here: no handler means nothing to run, so it would only cost the request a round trip.
  constructor(
    private readonly client: InngestSender,
    private readonly queuedEvents: ReadonlySet<BrunchEventName>,
  ) {}

  async emit<N extends BrunchEventName>(name: N, data: BrunchEventPayloads[N]): Promise<void> {
    if (!this.queuedEvents.has(name)) return;

    // The error still propagates: every service wraps emit in try/catch so a queue outage
    // never fails the request (Constitution 12). It is logged first because that catch is
    // silent, and a dropped invite or confirmation email would otherwise leave no trace.
    try {
      await this.client.send({ name, data: { ...data } });
    } catch (error) {
      console.error(
        `Could not queue event ${name}:`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
