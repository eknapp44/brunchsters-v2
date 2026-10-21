import { describe, expect, it, vi } from 'vitest';
import {
  type BallotEntry,
  type BallotKey,
  ballotKey,
  ballotReleased,
  effectiveSelection,
  SAVE_FAILED_MESSAGE,
  type ToggleBallotArg,
  toggleBallotOption,
} from './ballotsSlice';
import { makeStore, type ThunkExtra } from './makeStore';

const okResponse = (): Response => new Response('{}', { status: 200 });

function arg(overrides: Partial<ToggleBallotArg> = {}): ToggleBallotArg {
  return {
    brunchId: 'brunch-1',
    kind: 'location',
    optionId: 'b',
    current: ['a'],
    readOnly: false,
    ...overrides,
  };
}

function entryOf(store: ReturnType<typeof makeStore>, key: BallotKey): BallotEntry | undefined {
  return store.getState().ballots.byKey[key];
}

const locationKey = ballotKey({ brunchId: 'brunch-1', kind: 'location' });
const timeKey = ballotKey({ brunchId: 'brunch-1', kind: 'time' });

describe('effectiveSelection', () => {
  const entry: BallotEntry = {
    selected: ['b'],
    previous: [],
    requestId: 'r0',
    submitting: false,
    error: undefined,
    emptyWarning: false,
  };

  it("uses the server's selection until the voter has toggled something", () => {
    expect(effectiveSelection({ entry: undefined, seeded: ['a'], optionIds: ['a', 'b'] })).toEqual([
      'a',
    ]);
  });

  it('uses the stored selection once there is one, even when it is empty', () => {
    expect(effectiveSelection({ entry, seeded: ['a'], optionIds: ['a', 'b'] })).toEqual(['b']);
    expect(
      effectiveSelection({ entry: { ...entry, selected: [] }, seeded: ['a'], optionIds: ['a'] }),
    ).toEqual([]);
  });

  it('drops an option that no longer exists, from either source, on every read', () => {
    expect(effectiveSelection({ entry: undefined, seeded: ['a', 'x'], optionIds: ['a'] })).toEqual([
      'a',
    ]);
    expect(effectiveSelection({ entry, seeded: [], optionIds: ['a'] })).toEqual([]);
    // The same stored entry reads differently once the options change.
    expect(effectiveSelection({ entry, seeded: [], optionIds: ['b'] })).toEqual(['b']);
  });
});

describe('toggleBallotOption', () => {
  it('shows the new tick at once, then saves the whole ballot to the right endpoint', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async () => okResponse());
    const store = makeStore({ fetch: fakeFetch });

    const pending = store.dispatch(toggleBallotOption(arg()));

    expect(entryOf(store, locationKey)).toMatchObject({
      selected: ['a', 'b'],
      previous: ['a'],
      submitting: true,
      emptyWarning: false,
    });
    expect((await pending).payload).toEqual({ saved: true });

    const [url, init] = fakeFetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/brunches/brunch-1/votes/locations');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ optionIds: ['a', 'b'] });
    // A successful save keeps the selection.
    expect(entryOf(store, locationKey)).toMatchObject({ selected: ['a', 'b'], submitting: false });
  });

  it('saves times to the times endpoint', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async () => okResponse());
    const store = makeStore({ fetch: fakeFetch });

    await store.dispatch(toggleBallotOption(arg({ kind: 'time' })));

    expect(fakeFetch.mock.calls[0]?.[0]).toBe('/api/v1/brunches/brunch-1/votes/times');
  });

  it('unticks an option that is already ticked', async () => {
    const store = makeStore({ fetch: vi.fn<ThunkExtra['fetch']>(async () => okResponse()) });

    await store.dispatch(toggleBallotOption(arg({ current: ['a', 'b'], optionId: 'a' })));

    expect(entryOf(store, locationKey)?.selected).toEqual(['b']);
  });

  it('never sends an empty ballot: it warns instead and stays unlocked', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>();
    const store = makeStore({ fetch: fakeFetch });

    const result = await store.dispatch(toggleBallotOption(arg({ optionId: 'a' })));

    expect(result.payload).toEqual({ saved: false });
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(entryOf(store, locationKey)).toMatchObject({
      selected: [],
      submitting: false,
      emptyWarning: true,
    });
  });

  it('clears the warning when the voter ticks something again', async () => {
    const store = makeStore({ fetch: vi.fn<ThunkExtra['fetch']>(async () => okResponse()) });
    await store.dispatch(toggleBallotOption(arg({ optionId: 'a' })));

    await store.dispatch(toggleBallotOption(arg({ current: [], optionId: 'b' })));

    expect(entryOf(store, locationKey)).toMatchObject({
      selected: ['b'],
      emptyWarning: false,
    });
  });

  it('does nothing on a read-only ballot', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>();
    const store = makeStore({ fetch: fakeFetch });

    const result = await store.dispatch(toggleBallotOption(arg({ readOnly: true })));

    expect(result.meta.requestStatus).toBe('rejected');
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(entryOf(store, locationKey)).toBeUndefined();
  });

  it('ignores a click while a save is in flight, and the first save still settles', async () => {
    let finish: (response: Response) => void = () => undefined;
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    const store = makeStore({ fetch: fakeFetch });

    const first = store.dispatch(toggleBallotOption(arg()));
    await store.dispatch(toggleBallotOption(arg({ current: ['a', 'b'], optionId: 'c' })));

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(entryOf(store, locationKey)?.selected).toEqual(['a', 'b']);

    finish(okResponse());
    await first;
    expect(entryOf(store, locationKey)).toMatchObject({ selected: ['a', 'b'], submitting: false });
  });

  it('puts back exactly the previous selection when the server refuses the save', async () => {
    const store = makeStore({
      fetch: vi.fn<ThunkExtra['fetch']>(async () => new Response('{}', { status: 409 })),
    });

    const result = await store.dispatch(toggleBallotOption(arg({ current: ['a', 'c'] })));

    expect(result.payload).toBe(SAVE_FAILED_MESSAGE);
    expect(entryOf(store, locationKey)).toEqual({
      selected: ['a', 'c'],
      previous: ['a', 'c'],
      requestId: expect.any(String),
      submitting: false,
      error: SAVE_FAILED_MESSAGE,
      emptyWarning: false,
    });
  });

  it('rolls back on a network error too', async () => {
    const store = makeStore({
      fetch: vi.fn<ThunkExtra['fetch']>(() => Promise.reject(new Error('offline'))),
    });

    await store.dispatch(toggleBallotOption(arg()));

    expect(entryOf(store, locationKey)).toMatchObject({
      selected: ['a'],
      error: SAVE_FAILED_MESSAGE,
      submitting: false,
    });
  });

  it('clears the error when the next save starts, but not when the voter unticks the last box', async () => {
    const fakeFetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(okResponse());
    const store = makeStore({ fetch: fakeFetch });
    await store.dispatch(toggleBallotOption(arg()));
    expect(entryOf(store, locationKey)?.error).toBe(SAVE_FAILED_MESSAGE);

    await store.dispatch(toggleBallotOption(arg({ optionId: 'a' })));
    expect(entryOf(store, locationKey)?.error).toBe(SAVE_FAILED_MESSAGE);

    await store.dispatch(toggleBallotOption(arg({ current: [], optionId: 'b' })));
    expect(entryOf(store, locationKey)?.error).toBeUndefined();
  });

  it('keeps the place ballot and the time ballot of one brunch apart', async () => {
    const fakeFetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const store = makeStore({ fetch: fakeFetch });

    await store.dispatch(
      toggleBallotOption(arg({ kind: 'time', optionId: 't2', current: ['t1'] })),
    );
    await store.dispatch(toggleBallotOption(arg({ kind: 'location' })));

    expect(entryOf(store, timeKey)).toMatchObject({ selected: ['t1', 't2'], error: undefined });
    expect(entryOf(store, locationKey)).toMatchObject({
      selected: ['a'],
      error: SAVE_FAILED_MESSAGE,
    });
  });

  it('keeps the ballots of two brunches apart', async () => {
    const store = makeStore({ fetch: vi.fn<ThunkExtra['fetch']>(async () => okResponse()) });

    await store.dispatch(toggleBallotOption(arg({ brunchId: 'brunch-2', optionId: 'z' })));

    expect(entryOf(store, ballotKey({ brunchId: 'brunch-2', kind: 'location' }))).toBeDefined();
    expect(entryOf(store, locationKey)).toBeUndefined();
  });
});

describe('a save that settles after its ballot was released', () => {
  it('does not unlock, roll back or flag the ballot of the next visit', async () => {
    let settleOld: (response: Response) => void = () => undefined;
    let settleNew: (response: Response) => void = () => undefined;
    const fakeFetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (settleOld = resolve)))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (settleNew = resolve)));
    const store = makeStore({ fetch: fakeFetch });

    // First visit: a save is still in flight when the voter leaves.
    const oldSave = store.dispatch(toggleBallotOption(arg({ optionId: 'b' })));
    store.dispatch(ballotReleased(locationKey));

    // Second visit to the same brunch: a new tick, a new save.
    const newSave = store.dispatch(toggleBallotOption(arg({ optionId: 'c' })));
    expect(entryOf(store, locationKey)).toMatchObject({ selected: ['a', 'c'], submitting: true });

    // The old save fails late. The new ballot must not notice.
    settleOld(new Response('{}', { status: 500 }));
    await oldSave;
    expect(entryOf(store, locationKey)).toMatchObject({
      selected: ['a', 'c'],
      submitting: true,
      error: undefined,
    });

    settleNew(okResponse());
    await newSave;
    expect(entryOf(store, locationKey)).toMatchObject({ selected: ['a', 'c'], submitting: false });
  });
});

describe('ballotReleased', () => {
  it('forgets one ballot so the next visit reseeds from the server', async () => {
    const store = makeStore({ fetch: vi.fn<ThunkExtra['fetch']>(async () => okResponse()) });
    await store.dispatch(toggleBallotOption(arg()));
    await store.dispatch(toggleBallotOption(arg({ kind: 'time' })));

    store.dispatch(ballotReleased(locationKey));

    expect(entryOf(store, locationKey)).toBeUndefined();
    expect(entryOf(store, timeKey)).toBeDefined();
  });
});
