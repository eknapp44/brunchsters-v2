import type { PlaceDetails } from '@brunchsters/core';
import { MAX_INVITES_PER_REQUEST } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { makeStore, type ThunkExtra } from './makeStore';
import {
  createBrunch,
  descriptionChanged,
  emailAdded,
  emailRemoved,
  initialWizardState,
  locationAdded,
  locationRemoved,
  stepChosen,
  timeAdded,
  timeRemoved,
  titleChanged,
  votingDeadlineChanged,
  wizardReducer,
  wizardReset,
} from './wizardSlice';

const sunnySide = {
  placeId: 'place-1',
  name: 'Sunny Side',
  address: '1 Main St',
  placeUrl: 'https://maps.example/1',
  timezone: 'America/Los_Angeles',
} as PlaceDetails;
const harbor = { ...sunnySide, placeId: 'place-2', name: 'Harbor Bistro' } as PlaceDetails;

function reduce(...actions: Parameters<typeof wizardReducer>[1][]) {
  return actions.reduce(wizardReducer, initialWizardState);
}

describe('wizard reducers', () => {
  it('starts on step 1 with nothing entered', () => {
    expect(initialWizardState).toMatchObject({
      step: 1,
      title: '',
      locations: [],
      times: [],
      emails: [],
      submitting: false,
      submitError: undefined,
    });
  });

  it('sets text fields and the step', () => {
    const state = reduce(
      titleChanged('Brunch'),
      descriptionChanged('Notes'),
      votingDeadlineChanged('2030-01-01T10:00'),
      stepChosen(3),
    );
    expect(state).toMatchObject({
      title: 'Brunch',
      description: 'Notes',
      votingDeadline: '2030-01-01T10:00',
      step: 3,
    });
  });

  it('adds locations and removes one by place id', () => {
    const state = reduce(
      locationAdded(sunnySide),
      locationAdded(harbor),
      locationRemoved('place-1'),
    );
    expect(state.locations.map((location) => location.placeId)).toEqual(['place-2']);
  });

  it('adds times and removes one by index', () => {
    const state = reduce(
      timeAdded('2030-01-01T10:00:00.000Z'),
      timeAdded('2030-01-02T10:00:00.000Z'),
      timeRemoved(0),
    );
    expect(state.times).toEqual(['2030-01-02T10:00:00.000Z']);
  });

  it('ignores a duplicate email', () => {
    const state = reduce(emailAdded('a@example.com'), emailAdded('a@example.com'));
    expect(state.emails).toEqual(['a@example.com']);
  });

  it('stops adding emails at the per-request cap', () => {
    const emails = Array.from(
      { length: MAX_INVITES_PER_REQUEST + 5 },
      (_, index) => `guest-${index}@example.com`,
    );
    const state = reduce(...emails.map((email) => emailAdded(email)));
    expect(state.emails).toHaveLength(MAX_INVITES_PER_REQUEST);
    expect(state.emails).toEqual(emails.slice(0, MAX_INVITES_PER_REQUEST));
  });

  it('removes an email', () => {
    const state = reduce(
      emailAdded('a@example.com'),
      emailAdded('b@example.com'),
      emailRemoved('a@example.com'),
    );
    expect(state.emails).toEqual(['b@example.com']);
  });

  it('goes back to the initial state on reset', () => {
    const state = reduce(
      titleChanged('Brunch'),
      locationAdded(sunnySide),
      stepChosen(4),
      wizardReset(),
    );
    expect(state).toEqual(initialWizardState);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function storeWith(fakeFetch: ThunkExtra['fetch']) {
  const store = makeStore({ fetch: fakeFetch });
  store.dispatch(titleChanged('  Brunch  '));
  store.dispatch(descriptionChanged('Notes'));
  store.dispatch(locationAdded(sunnySide));
  store.dispatch(timeAdded('2030-01-01T10:00:00.000Z'));
  return store;
}

describe('createBrunch', () => {
  it('posts the trimmed brunch and returns the new id', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async () => jsonResponse(201, { id: 'brunch-1' }));
    const store = storeWith(fakeFetch);

    const result = await store.dispatch(createBrunch());

    expect(result.payload).toEqual({ id: 'brunch-1' });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/brunches');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Brunch',
      description: 'Notes',
      locations: [
        {
          placeId: 'place-1',
          placeName: 'Sunny Side',
          placeAddress: '1 Main St',
          placeUrl: 'https://maps.example/1',
          timezone: 'America/Los_Angeles',
        },
      ],
      times: [{ scheduledAt: '2030-01-01T10:00:00.000Z' }],
    });
    // Navigation is about to happen, so the button stays disabled.
    expect(store.getState().wizard.submitting).toBe(true);
  });

  it('omits the description and sends the deadline as an ISO instant when set', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async () => jsonResponse(201, { id: 'brunch-1' }));
    const store = storeWith(fakeFetch);
    store.dispatch(descriptionChanged(''));
    store.dispatch(votingDeadlineChanged('2030-01-01T10:00'));

    await store.dispatch(createBrunch());

    const body = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('description');
    expect(body.votingDeadline).toBe(new Date('2030-01-01T10:00').toISOString());
  });

  it('sends the invites after a successful create', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async (url) =>
      String(url).endsWith('/invites')
        ? jsonResponse(200, {})
        : jsonResponse(201, { id: 'brunch-1' }),
    );
    const store = storeWith(fakeFetch);
    store.dispatch(emailAdded('a@example.com'));

    await store.dispatch(createBrunch());

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const [url, init] = fakeFetch.mock.calls[1] ?? [];
    expect(url).toBe('/api/v1/brunches/brunch-1/invites');
    expect(JSON.parse(String(init?.body))).toEqual({ emails: ['a@example.com'] });
  });

  it('sends no invite request when there are no emails', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async () => jsonResponse(201, { id: 'brunch-1' }));
    await storeWith(fakeFetch).dispatch(createBrunch());
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('offline'))],
    ['returns 500', async () => jsonResponse(500, { error: 'nope' })],
  ])('still returns the id when the invite request %s', async (_name, inviteResponse) => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async (url) =>
      String(url).endsWith('/invites') ? inviteResponse() : jsonResponse(201, { id: 'brunch-1' }),
    );
    const store = storeWith(fakeFetch);
    store.dispatch(emailAdded('a@example.com'));

    const result = await store.dispatch(createBrunch());

    expect(result.payload).toEqual({ id: 'brunch-1' });
    expect(store.getState().wizard.submitError).toBeUndefined();
  });

  it('hands back the wait when the server refuses the invite batch, and still creates the brunch', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async (url) =>
      String(url).endsWith('/invites')
        ? jsonResponse(429, {
            error: 'Too many requests',
            policy: 'invite-emails-host',
            retryAfterSeconds: 7200,
          })
        : jsonResponse(201, { id: 'brunch-1' }),
    );
    const store = storeWith(fakeFetch);
    store.dispatch(emailAdded('a@example.com'));

    const result = await store.dispatch(createBrunch());

    expect(result.type).toBe(createBrunch.fulfilled.type);
    expect(result.payload).toEqual({
      id: 'brunch-1',
      invitesRefused: { policy: 'invite-emails-host', retryAfterSeconds: 7200 },
    });
    // The create itself did not fail, so there is no error to show on the wizard.
    expect(store.getState().wizard.submitError).toBeUndefined();
  });

  it('falls back to the Retry-After header when a refused invite batch has no usable body', async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async (url) =>
      String(url).endsWith('/invites')
        ? new Response('slow down', { status: 429, headers: { 'Retry-After': '30' } })
        : jsonResponse(201, { id: 'brunch-1' }),
    );
    const store = storeWith(fakeFetch);
    store.dispatch(emailAdded('a@example.com'));

    const result = await store.dispatch(createBrunch());

    expect(result.payload).toEqual({
      id: 'brunch-1',
      invitesRefused: { policy: 'unknown', retryAfterSeconds: 30 },
    });
  });

  it('reports no refusal when the invite batch succeeds or fails some other way', async () => {
    for (const inviteStatus of [200, 500, 403]) {
      const fakeFetch = vi.fn<ThunkExtra['fetch']>(async (url) =>
        String(url).endsWith('/invites')
          ? jsonResponse(inviteStatus, {})
          : jsonResponse(201, { id: 'brunch-1' }),
      );
      const store = storeWith(fakeFetch);
      store.dispatch(emailAdded('a@example.com'));

      const result = await store.dispatch(createBrunch());

      expect(result.payload).toEqual({ id: 'brunch-1' });
    }
  });

  it("keeps every entry and shows the server's message when the create fails", async () => {
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(async () =>
      jsonResponse(500, { error: 'The database is unavailable' }),
    );
    const store = storeWith(fakeFetch);
    store.dispatch(emailAdded('a@example.com'));
    const before = store.getState().wizard;

    const result = await store.dispatch(createBrunch());

    expect(result.type).toBe(createBrunch.rejected.type);
    expect(store.getState().wizard).toEqual({
      ...before,
      submitting: false,
      submitError: 'The database is unavailable',
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('joins validation messages from an errors array', async () => {
    const store = storeWith(
      vi.fn<ThunkExtra['fetch']>(async () =>
        jsonResponse(400, { errors: [{ message: 'Title is required' }, { message: 'Bad time' }] }),
      ),
    );
    await store.dispatch(createBrunch());
    expect(store.getState().wizard.submitError).toBe('Title is required; Bad time');
  });

  it('falls back to the generic message for an unreadable error body', async () => {
    const store = storeWith(
      vi.fn<ThunkExtra['fetch']>(async () => new Response('oops', { status: 502 })),
    );
    await store.dispatch(createBrunch());
    expect(store.getState().wizard.submitError).toBe('Failed to create brunch');
  });

  it('uses the generic message on a network error and clears it on the next attempt', async () => {
    const fakeFetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'brunch-1' }));
    const store = storeWith(fakeFetch);

    await store.dispatch(createBrunch());
    expect(store.getState().wizard.submitError).toBe('Failed to create brunch');
    expect(store.getState().wizard.submitting).toBe(false);

    const retry = store.dispatch(createBrunch());
    expect(store.getState().wizard.submitError).toBeUndefined();
    expect(store.getState().wizard.submitting).toBe(true);
    expect((await retry).payload).toEqual({ id: 'brunch-1' });
  });

  it('drops a failure that arrives after the wizard was reset, so the next visit is clean', async () => {
    let fail: (error: Error) => void = () => undefined;
    const store = storeWith(
      vi.fn<ThunkExtra['fetch']>(
        () => new Promise<Response>((_resolve, reject) => (fail = reject)),
      ),
    );

    const pending = store.dispatch(createBrunch());
    store.dispatch(wizardReset());
    fail(new Error('offline'));
    await pending;

    expect(store.getState().wizard).toEqual(initialWizardState);
  });

  it('sends nothing for a second create while the first is still in flight', async () => {
    let finish: (response: Response) => void = () => undefined;
    const fakeFetch = vi.fn<ThunkExtra['fetch']>(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    const store = storeWith(fakeFetch);

    const first = store.dispatch(createBrunch());
    const second = await store.dispatch(createBrunch());

    expect(second.meta.requestStatus).toBe('rejected');
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    finish(jsonResponse(201, { id: 'brunch-1' }));
    expect((await first).payload).toEqual({ id: 'brunch-1' });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("ignores a failure from an earlier visit's request once a new submission is under way", async () => {
    let failOld: (error: Error) => void = () => undefined;
    let finishNew: (response: Response) => void = () => undefined;
    const fakeFetch = vi
      .fn<ThunkExtra['fetch']>()
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => (failOld = reject)))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (finishNew = resolve)));
    const store = storeWith(fakeFetch);

    const oldCreate = store.dispatch(createBrunch());
    store.dispatch(wizardReset());
    store.dispatch(titleChanged('Second try'));
    const newCreate = store.dispatch(createBrunch());

    failOld(new Error('offline'));
    await oldCreate;
    expect(store.getState().wizard).toMatchObject({ submitting: true, submitError: undefined });

    finishNew(jsonResponse(201, { id: 'brunch-2' }));
    expect((await newCreate).payload).toEqual({ id: 'brunch-2' });
  });
});
