import { describe, expect, it, vi } from 'vitest';
import { makeStore, type ThunkExtra } from './makeStore';
import {
  markNotificationsRead,
  pollUnread,
  selectUnreadCount,
  unreadSeeded,
} from './notificationsSlice';
import { selectToasts } from './toastsSlice';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// A response the test releases when it chooses, to put two requests in flight at once.
function deferred() {
  let release: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function storeWith(fetch: ThunkExtra['fetch']) {
  return makeStore({ fetch });
}

describe('pollUnread', () => {
  it('takes the count the server gives', async () => {
    const store = storeWith(vi.fn(async () => json({ count: 4 })));

    await store.dispatch(pollUnread());

    expect(selectUnreadCount(store.getState())).toBe(4);
  });

  it('asks for the count fresh every time', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>(async () => json({ count: 1 }));
    await storeWith(fetch).dispatch(pollUnread());

    expect(fetch).toHaveBeenCalledWith('/api/v1/notifications/unread-count', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('keeps the number it had, and says nothing, when the poll fails any way it can', async () => {
    const failures: ThunkExtra['fetch'][] = [
      async () => json({ error: { code: 'internal' } }, 500),
      async () => json({ error: { code: 'signed_out' } }, 401),
      async () => json({ count: 'many' }),
      async () => json('not an object'),
      async () => Promise.reject(new Error('offline')),
    ];
    for (const failing of failures) {
      const store = storeWith(failing);
      store.dispatch(unreadSeeded(2));

      await store.dispatch(pollUnread());

      expect(selectUnreadCount(store.getState())).toBe(2);
      expect(selectToasts(store.getState())).toEqual([]);
      // A failed poll lets the next one start.
      expect(store.getState().notifications.polling).toBe(false);
    }
  });

  it('can be cancelled while it is on its way: the number stays, and the next poll may start', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const store = storeWith(fetch);
    store.dispatch(unreadSeeded(2));

    const polling = store.dispatch(pollUnread());
    expect(store.getState().notifications.polling).toBe(true);
    polling.abort();
    await polling;

    expect(selectUnreadCount(store.getState())).toBe(2);
    expect(store.getState().notifications.polling).toBe(false);
    expect(selectToasts(store.getState())).toEqual([]);
  });

  it('does not start a second poll while one is out', async () => {
    const first = deferred();
    const fetch = vi.fn<ThunkExtra['fetch']>(() => first.promise);
    const store = storeWith(fetch);

    const one = store.dispatch(pollUnread());
    await store.dispatch(pollUnread());
    first.release(json({ count: 3 }));
    await one;

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(selectUnreadCount(store.getState())).toBe(3);
  });
});

describe('markNotificationsRead', () => {
  it('takes all of the unread off the count at once for "mark all read"', async () => {
    const pending = deferred();
    const store = storeWith(vi.fn(() => pending.promise));
    store.dispatch(unreadSeeded(5));

    const done = store.dispatch(markNotificationsRead({ all: true }));
    expect(selectUnreadCount(store.getState())).toBe(0);
    pending.release(json({ marked: 5 }));
    await done;

    expect(selectUnreadCount(store.getState())).toBe(0);
    expect(store.getState().notifications.marks).toEqual({});
  });

  it('sends the right body for the ids and for all', async () => {
    const fetch = vi.fn<ThunkExtra['fetch']>(async () => json({ marked: 1 }));
    const store = storeWith(fetch);
    store.dispatch(unreadSeeded(3));

    await store.dispatch(markNotificationsRead({ ids: ['a', 'b'], unreadAmong: 1 }));
    await store.dispatch(markNotificationsRead({ all: true }));

    const [first, second] = fetch.mock.calls;
    expect(first?.[0]).toBe('/api/v1/notifications/read');
    expect(JSON.parse(String(first?.[1]?.body))).toEqual({ ids: ['a', 'b'] });
    expect(first?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(second?.[1]?.body))).toEqual({ all: true });
  });

  it('takes off only the rows that were unread, and never more than the count', async () => {
    const pending = deferred();
    const store = storeWith(vi.fn(() => pending.promise));
    store.dispatch(unreadSeeded(3));

    const done = store.dispatch(markNotificationsRead({ ids: ['a', 'b'], unreadAmong: 1 }));
    expect(selectUnreadCount(store.getState())).toBe(2);
    pending.release(json({ marked: 1 }));
    await done;

    const store2 = storeWith(vi.fn(async () => json({ marked: 0 })));
    store2.dispatch(unreadSeeded(1));
    await store2.dispatch(markNotificationsRead({ ids: ['a'], unreadAmong: 9 }));
    expect(selectUnreadCount(store2.getState())).toBe(0);
  });

  it('says "All caught up." for mark-all, and nothing for one row (the page change is plain there)', async () => {
    const all = storeWith(vi.fn(async () => json({ marked: 2 })));
    all.dispatch(unreadSeeded(2));
    await all.dispatch(markNotificationsRead({ all: true }));
    expect(selectToasts(all.getState()).map((toast) => [toast.tone, toast.text])).toEqual([
      ['success', 'All caught up.'],
    ]);

    const one = storeWith(vi.fn(async () => json({ marked: 1 })));
    one.dispatch(unreadSeeded(2));
    await one.dispatch(markNotificationsRead({ ids: ['a'], unreadAmong: 1 }));
    expect(selectToasts(one.getState())).toEqual([]);
  });

  it('puts the count back and says why, in a toast, when the route says no', async () => {
    const store = storeWith(vi.fn(async () => json({ error: { code: 'internal' } }, 500)));
    store.dispatch(unreadSeeded(5));

    await store.dispatch(markNotificationsRead({ all: true }));

    expect(selectUnreadCount(store.getState())).toBe(5);
    expect(store.getState().notifications.marks).toEqual({});
    const [toast] = selectToasts(store.getState());
    expect(toast?.tone).toBe('error');
    expect(toast?.text).toMatch(/our end/i);
  });

  it('puts the count back when the network is down, and when the person is held back', async () => {
    const offline = storeWith(vi.fn(() => Promise.reject(new Error('offline'))));
    offline.dispatch(unreadSeeded(2));
    await offline.dispatch(markNotificationsRead({ all: true }));
    expect(selectUnreadCount(offline.getState())).toBe(2);
    expect(selectToasts(offline.getState())[0]?.text).toMatch(/offline/i);

    const held = storeWith(
      vi.fn(async () => json({ error: { code: 'rate_limited' }, retryAfterSeconds: 30 }, 429)),
    );
    held.dispatch(unreadSeeded(2));
    await held.dispatch(markNotificationsRead({ all: true }));
    expect(selectUnreadCount(held.getState())).toBe(2);
    expect(selectToasts(held.getState())[0]?.tone).toBe('info');
  });

  it('does not let a poll that began before the read put its old count back', async () => {
    const poll = deferred();
    const read = deferred();
    const fetch = vi.fn<ThunkExtra['fetch']>((url) =>
      String(url).endsWith('/unread-count') ? poll.promise : read.promise,
    );
    const store = storeWith(fetch);
    store.dispatch(unreadSeeded(4));

    const polled = store.dispatch(pollUnread());
    const marked = store.dispatch(markNotificationsRead({ all: true }));
    read.release(json({ marked: 4 }));
    await marked;
    // The poll asked before the read was applied, so its answer is the old count.
    poll.release(json({ count: 4 }));
    await polled;

    expect(selectUnreadCount(store.getState())).toBe(0);
  });

  it('does not poll while a read is out, and the page cannot overwrite it either', async () => {
    const read = deferred();
    const fetch = vi.fn<ThunkExtra['fetch']>(() => read.promise);
    const store = storeWith(fetch);
    store.dispatch(unreadSeeded(4));

    const marked = store.dispatch(markNotificationsRead({ all: true }));
    await store.dispatch(pollUnread());
    store.dispatch(unreadSeeded(4));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(selectUnreadCount(store.getState())).toBe(0);
    read.release(json({ marked: 4 }));
    await marked;
  });

  it('rolls back only the read that failed when two are out', async () => {
    const first = deferred();
    const second = deferred();
    const responses = [first.promise, second.promise];
    const store = storeWith(vi.fn(() => responses.shift() ?? first.promise));
    store.dispatch(unreadSeeded(5));

    const one = store.dispatch(markNotificationsRead({ ids: ['a', 'b'], unreadAmong: 2 }));
    const two = store.dispatch(markNotificationsRead({ ids: ['c'], unreadAmong: 1 }));
    expect(selectUnreadCount(store.getState())).toBe(2);
    first.release(json({ error: { code: 'internal' } }, 500));
    second.release(json({ marked: 1 }));
    await Promise.all([one, two]);

    expect(selectUnreadCount(store.getState())).toBe(4);
  });
});

describe('unreadSeeded', () => {
  it('takes the count the page was rendered with, and not while a poll is out', async () => {
    const poll = deferred();
    const store = storeWith(vi.fn(() => poll.promise));

    store.dispatch(unreadSeeded(2));
    expect(selectUnreadCount(store.getState())).toBe(2);

    const polled = store.dispatch(pollUnread());
    store.dispatch(unreadSeeded(9));
    expect(selectUnreadCount(store.getState())).toBe(2);
    poll.release(json({ count: 3 }));
    await polled;
    expect(selectUnreadCount(store.getState())).toBe(3);
  });
});
