import { describe, expect, it, vi } from 'vitest';
import { emailAdded, createBrunch } from './wizardSlice';
import { makeStore, type ThunkExtra } from './makeStore';
import { invitesNoticeCleared, selectInvitesDidNotGoOut } from './noticesSlice';

function created(invitesStatus: number): ThunkExtra['fetch'] {
  return vi.fn<ThunkExtra['fetch']>(async (url) =>
    String(url).endsWith('/invites')
      ? new Response('{}', { status: invitesStatus })
      : new Response(JSON.stringify({ id: 'brunch-1' }), { status: 201 }),
  );
}

describe('invites notice', () => {
  it('is noted for the new brunch when its invite batch did not go out', async () => {
    const store = makeStore({ fetch: created(500) });
    store.dispatch(emailAdded('a@example.com'));

    await store.dispatch(createBrunch());

    expect(selectInvitesDidNotGoOut(store.getState(), 'brunch-1')).toBe(true);
    expect(selectInvitesDidNotGoOut(store.getState(), 'another-brunch')).toBe(false);
  });

  it('is not noted when the batch went out, was refused for the day (429), or there was none', async () => {
    for (const status of [201, 429]) {
      const store = makeStore({ fetch: created(status) });
      store.dispatch(emailAdded('a@example.com'));
      await store.dispatch(createBrunch());
      expect(selectInvitesDidNotGoOut(store.getState(), 'brunch-1')).toBe(false);
    }
    const none = makeStore({ fetch: created(500) });
    await none.dispatch(createBrunch());
    expect(selectInvitesDidNotGoOut(none.getState(), 'brunch-1')).toBe(false);
  });

  it('outlives the wizard being reset, and ends when an invite goes out', async () => {
    const store = makeStore({ fetch: created(500) });
    store.dispatch(emailAdded('a@example.com'));
    await store.dispatch(createBrunch());
    store.dispatch({ type: 'wizard/wizardReset' });

    expect(selectInvitesDidNotGoOut(store.getState(), 'brunch-1')).toBe(true);

    store.dispatch(invitesNoticeCleared('brunch-1'));
    expect(selectInvitesDidNotGoOut(store.getState(), 'brunch-1')).toBe(false);
  });

  it('does not repeat itself for one brunch', async () => {
    const store = makeStore({ fetch: created(500) });
    store.dispatch(emailAdded('a@example.com'));
    await store.dispatch(createBrunch());
    store.dispatch({ type: 'wizard/wizardReset' });
    store.dispatch(emailAdded('a@example.com'));
    await store.dispatch(createBrunch());

    expect(store.getState().notices.invitesDidNotGoOut).toEqual(['brunch-1']);
  });
});
