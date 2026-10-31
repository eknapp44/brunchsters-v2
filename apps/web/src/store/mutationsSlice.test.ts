import { describe, expect, it, vi } from 'vitest';
import { makeStore, type ThunkExtra } from './makeStore';
import {
  mutationReleased,
  runMutation,
  type RunMutationArg,
  selectAnyMutationPending,
  selectMutation,
} from './mutationsSlice';

function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setup(fetch: ThunkExtra['fetch']) {
  return makeStore({ fetch });
}

function arg(overrides: Partial<RunMutationArg> = {}): RunMutationArg {
  return {
    key: 'rsvp:brunch-1',
    request: { url: '/api/v1/brunches/brunch-1/rsvp', method: 'POST', body: { response: 'yes' } },
    failure: 'toast',
    ...overrides,
  };
}

describe('runMutation', () => {
  it('sends the request as given and clears the entry when the route says yes', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>().mockResolvedValue(json({ ok: true }, 200));
    const store = setup(fetch);

    const result = await store.dispatch(runMutation(arg())).unwrap();

    expect(result).toEqual({ status: 200 });
    expect(fetch).toHaveBeenCalledWith('/api/v1/brunches/brunch-1/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'yes' }),
    });
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toBeUndefined();
  });

  it('sends no body and no content type for a request without one', async () => {
    const fetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const store = setup(fetch);

    await store
      .dispatch(runMutation(arg({ request: { url: '/api/v1/invites/i-1', method: 'DELETE' } })))
      .unwrap();

    expect(fetch).toHaveBeenCalledWith('/api/v1/invites/i-1', { method: 'DELETE' });
  });

  it('is pending while the request is out', async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetch = vi.fn<ThunkExtra['fetch']>().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const store = setup(fetch);

    const done = store.dispatch(runMutation(arg()));
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')?.status).toBe('pending');

    finish(json({}, 200));
    await done;
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toBeUndefined();
  });

  it('keeps the code the route sent when it fails', async () => {
    const fetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockResolvedValue(
        json({ error: { code: 'brunch_called_off', message: 'This brunch was called off' } }, 409),
      );
    const store = setup(fetch);

    await expect(store.dispatch(runMutation(arg())).unwrap()).rejects.toEqual({
      code: 'brunch_called_off',
      rateLimit: undefined,
    });
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toMatchObject({
      status: 'failed',
      failure: { code: 'brunch_called_off' },
    });
  });

  it('reads a route that still sends the old body by its status', async () => {
    const fetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockResolvedValue(json({ error: 'Only the host can confirm' }, 403));
    const store = setup(fetch);

    await expect(store.dispatch(runMutation(arg())).unwrap()).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('keeps the facts of a 429 so a control can start its own wait', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>().mockResolvedValue(
      json({ error: 'Too many requests', policy: 'write', retryAfterSeconds: 30 }, 429, {
        'Retry-After': '30',
      }),
    );
    const store = setup(fetch);

    await expect(store.dispatch(runMutation(arg())).unwrap()).rejects.toEqual({
      code: 'rate_limited',
      rateLimit: { policy: 'write', retryAfterSeconds: 30 },
    });
  });

  it('says the request never got an answer when fetch rejects', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>().mockRejectedValue(new TypeError('Failed to fetch'));
    const store = setup(fetch);

    await expect(store.dispatch(runMutation(arg())).unwrap()).rejects.toEqual({
      code: 'network',
      rateLimit: undefined,
    });
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')?.status).toBe('failed');
  });

  it('does nothing at all for a second tap on a key already in flight', async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetch = vi.fn<ThunkExtra['fetch']>().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const store = setup(fetch);

    const first = store.dispatch(runMutation(arg()));
    const second = store.dispatch(runMutation(arg()));
    await expect(second.unwrap()).rejects.toMatchObject({ name: 'ConditionError' });
    expect(fetch).toHaveBeenCalledTimes(1);

    finish(json({}, 200));
    await first;
  });

  it('lets two different keys run together', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>().mockResolvedValue(json({}, 200));
    const store = setup(fetch);

    await Promise.all([
      store.dispatch(runMutation(arg({ key: 'rsvp:brunch-1' }))),
      store.dispatch(runMutation(arg({ key: 'rsvp:brunch-2' }))),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('allows a new tap after a failure, and clears the old failure while it runs', async () => {
    const fetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockResolvedValueOnce(json({ error: { code: 'internal', message: 'x' } }, 500))
      .mockResolvedValueOnce(json({}, 200));
    const store = setup(fetch);

    await store.dispatch(runMutation(arg()));
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')?.status).toBe('failed');

    const retry = store.dispatch(runMutation(arg()));
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toMatchObject({
      status: 'pending',
      failure: undefined,
    });
    await retry;
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toBeUndefined();
  });

  it('ignores a result that lands after its entry was released (the control unmounted)', async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetch = vi.fn<ThunkExtra['fetch']>().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const store = setup(fetch);

    const first = store.dispatch(runMutation(arg()));
    store.dispatch(mutationReleased('rsvp:brunch-1'));
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toBeUndefined();

    finish(json({ error: { code: 'internal', message: 'x' } }, 500));
    await first;
    // The late failure must not bring back an entry for a control that is gone.
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toBeUndefined();
  });

  it('ignores a late result from an earlier request when the key has been started again', async () => {
    const resolvers: ((response: Response) => void)[] = [];
    const fetch = vi.fn<ThunkExtra['fetch']>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const store = setup(fetch);

    const first = store.dispatch(runMutation(arg()));
    store.dispatch(mutationReleased('rsvp:brunch-1'));
    const second = store.dispatch(runMutation(arg()));

    // The first one fails late; the entry belongs to the second.
    resolvers[0]?.(json({ error: { code: 'internal', message: 'x' } }, 500));
    await first;
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')?.status).toBe('pending');

    resolvers[1]?.(json({}, 200));
    await second;
    expect(selectMutation(store.getState(), 'rsvp:brunch-1')).toBeUndefined();
  });

  it('says whether any control has a request on its way (the refresh on focus waits for it)', async () => {
    let finish: (response: Response) => void = () => undefined;
    const store = setup(
      vi.fn<ThunkExtra['fetch']>(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    expect(selectAnyMutationPending(store.getState())).toBe(false);

    const running = store.dispatch(runMutation(arg()));
    expect(selectAnyMutationPending(store.getState())).toBe(true);

    finish(json({}, 200));
    await running;
    expect(selectAnyMutationPending(store.getState())).toBe(false);
  });
});
