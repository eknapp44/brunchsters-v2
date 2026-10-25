import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { makeStore, type ThunkExtra } from './makeStore';
import { runMutation, type RunMutationArg } from './mutationsSlice';
import { MAX_TOASTS, selectToasts, toastDismissed, toastShown } from './toastsSlice';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function arg(overrides: Partial<RunMutationArg> = {}): RunMutationArg {
  return {
    key: 'rsvp:brunch-1',
    request: { url: '/x', method: 'POST' },
    failure: 'toast',
    ...overrides,
  };
}

function storeAnswering(...responses: Response[]) {
  const fetch = vi.fn<ThunkExtra['fetch']>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return makeStore({ fetch });
}

describe('toasts fed by runMutation', () => {
  it('shows the success words when the route says yes', async () => {
    const store = storeAnswering(json({}, 200));

    await store.dispatch(runMutation(arg({ success: "You're in." })));

    expect(selectToasts(store.getState())).toMatchObject([{ tone: 'success', text: "You're in." }]);
  });

  it('shows nothing for a success that has no words', async () => {
    const store = storeAnswering(json({}, 200));

    await store.dispatch(runMutation(arg()));

    expect(selectToasts(store.getState())).toEqual([]);
  });

  it('words a failure from its code, never from the route’s message', async () => {
    const store = storeAnswering(
      json({ error: { code: 'brunch_called_off', message: 'SECRET server words' } }, 409),
    );

    await store.dispatch(runMutation(arg()));

    const [toast] = selectToasts(store.getState());
    expect(toast).toMatchObject({
      tone: 'error',
      text: "This one's been called off, so it can't change.",
    });
    expect(JSON.stringify(store.getState().toasts)).not.toContain('SECRET');
  });

  it('says "offline" when the request never got an answer', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>().mockRejectedValue(new TypeError('Failed to fetch'));
    const store = makeStore({ fetch });

    await store.dispatch(runMutation(arg()));

    expect(selectToasts(store.getState())).toMatchObject([
      { tone: 'error', text: "Looks like you're offline." },
    ]);
  });

  it('shows a 429 as news with its wait, not as an error', async () => {
    const store = storeAnswering(
      json(
        {
          error: 'Too many requests',
          policy: RATE_LIMIT_POLICIES.resendPerInvite.name,
          retryAfterSeconds: 120,
        },
        429,
      ),
    );

    await store.dispatch(runMutation(arg()));

    expect(selectToasts(store.getState())).toMatchObject([
      { tone: 'info', text: 'That one just went out. Give it 2 minutes.' },
    ]);
  });

  it('leaves a 429 to a control that shows its own wait, but still keeps the facts for it', async () => {
    const store = storeAnswering(
      json(
        { error: { code: 'rate_limited', message: 'x' }, policy: 'write', retryAfterSeconds: 30 },
        429,
      ),
    );

    await expect(store.dispatch(runMutation(arg({ ownsWait: true }))).unwrap()).rejects.toEqual({
      code: 'rate_limited',
      rateLimit: { policy: 'write', retryAfterSeconds: 30 },
    });

    expect(selectToasts(store.getState())).toEqual([]);
  });

  it('still toasts every other failure of a control that owns a wait', async () => {
    const store = storeAnswering(json({ error: { code: 'internal', message: 'x' } }, 500));

    await store.dispatch(runMutation(arg({ ownsWait: true })));

    expect(selectToasts(store.getState())).toHaveLength(1);
  });

  it('shows a toast that is not the answer to a request, de-duplicated by its key', () => {
    const store = storeAnswering();

    store.dispatch(
      toastShown({ id: 'a', key: 'copy:t:done', tone: 'success', text: 'Link copied.' }),
    );
    store.dispatch(
      toastShown({ id: 'b', key: 'copy:t:done', tone: 'success', text: 'Link copied.' }),
    );

    expect(selectToasts(store.getState())).toEqual([
      { id: 'b', key: 'copy:t:done', tone: 'success', text: 'Link copied.' },
    ]);
  });

  it('shows no toast for a failure the control shows inline', async () => {
    const store = storeAnswering(json({ error: { code: 'internal', message: 'x' } }, 500));

    await store.dispatch(runMutation(arg({ failure: 'inline' })));

    expect(selectToasts(store.getState())).toEqual([]);
  });

  it('replaces a repeat of the same result instead of stacking it', async () => {
    const store = storeAnswering(
      json({ error: { code: 'internal', message: 'x' } }, 500),
      json({ error: { code: 'internal', message: 'x' } }, 500),
    );

    await store.dispatch(runMutation(arg()));
    await store.dispatch(runMutation(arg()));

    expect(selectToasts(store.getState())).toHaveLength(1);
  });

  it('keeps different results from the same control apart', async () => {
    const store = storeAnswering(
      json({ error: { code: 'internal', message: 'x' } }, 500),
      json({ error: { code: 'brunch_called_off', message: 'x' } }, 409),
    );

    await store.dispatch(runMutation(arg()));
    await store.dispatch(runMutation(arg()));

    expect(selectToasts(store.getState())).toHaveLength(2);
  });

  it('keeps at most three, dropping the oldest', async () => {
    const store = storeAnswering(...Array.from({ length: MAX_TOASTS + 2 }, () => json({}, 200)));

    for (let index = 0; index < MAX_TOASTS + 2; index += 1) {
      await store.dispatch(runMutation(arg({ key: `k${index}`, success: `done ${index}` })));
    }

    expect(selectToasts(store.getState()).map((toast) => toast.text)).toEqual([
      'done 2',
      'done 3',
      'done 4',
    ]);
  });

  it('removes a toast when it is dismissed, and only that one', async () => {
    const store = storeAnswering(json({}, 200), json({}, 200));
    await store.dispatch(runMutation(arg({ key: 'a', success: 'one' })));
    await store.dispatch(runMutation(arg({ key: 'b', success: 'two' })));
    const [first] = selectToasts(store.getState());

    store.dispatch(toastDismissed(first?.id ?? ''));

    expect(selectToasts(store.getState()).map((toast) => toast.text)).toEqual(['two']);
  });

  it('still toasts a result that lands after the control that asked unmounted', async () => {
    const store = storeAnswering(json({}, 200));
    const done = store.dispatch(runMutation(arg({ success: "You're in." })));
    store.dispatch({ type: 'mutations/mutationReleased', payload: 'rsvp:brunch-1' });
    await done;

    expect(selectToasts(store.getState())).toMatchObject([{ text: "You're in." }]);
  });
});
