import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import type { BrunchEventName, BrunchEventPayloads, EventBus } from './EventBus';

const BRUNCH_ID = '00000000-0000-4000-8000-000000000001' as BrunchId;
const HOST_ID = '00000000-0000-4000-8000-000000000002' as UserId;

function makeBus(): { readonly bus: EventBus; readonly seen: BrunchEventName[] } {
  const seen: BrunchEventName[] = [];
  return {
    seen,
    bus: {
      emit(name) {
        seen.push(name);
        return Promise.resolve();
      },
    },
  };
}

// These are compile-time guarantees: if the payload map stops catching a wrong
// payload, the `@ts-expect-error` lines below become unused and typecheck fails.
describe('EventBus payload types', () => {
  it('accepts the payload that matches the event name', async () => {
    const { bus, seen } = makeBus();
    const payload: BrunchEventPayloads['brunch/created'] = {
      brunchId: BRUNCH_ID,
      hostId: HOST_ID,
    };

    await bus.emit('brunch/created', payload);

    expect(seen).toEqual(['brunch/created']);
  });

  it('rejects a payload that belongs to a different event', async () => {
    const { bus } = makeBus();

    // @ts-expect-error a brunch/created payload has no inviteId; remove when the map stops enforcing this
    await bus.emit('invite/resent', { brunchId: BRUNCH_ID, hostId: HOST_ID });
  });

  it('rejects an unbranded string where an id is required', async () => {
    const { bus } = makeBus();

    // @ts-expect-error brunchId must be a BrunchId, not any string; remove when ids stop being branded
    await bus.emit('brunch/created', { brunchId: 'not-branded', hostId: HOST_ID });
  });

  it('rejects an event name nothing emits', async () => {
    const { bus } = makeBus();

    // @ts-expect-error brunch/cancelled has no producer yet, so it is not in the union (ADR 0009)
    await bus.emit('brunch/cancelled', { brunchId: BRUNCH_ID });
  });
});
