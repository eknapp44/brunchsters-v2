import type { BrunchEventName, BrunchEventPayloads, EventBus } from '@brunchsters/core';

// The slice of the Inngest client this adapter uses, so tests can pass a fake.
export type InngestSender = {
  send: (event: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
};

export class InngestEventBus implements EventBus {
  constructor(private readonly client: InngestSender) {}

  async emit<N extends BrunchEventName>(name: N, data: BrunchEventPayloads[N]): Promise<void> {
    // Errors propagate: every service wraps emit in try/catch so a queue outage never
    // fails the request (Constitution 12), and swallowing here would hide it from them.
    await this.client.send({ name, data: { ...data } });
  }
}
