import { describe, expect, it } from 'vitest';
import {
  clearLimit,
  handoffStorageKey,
  limitStorageKey,
  readLimit,
  secondsLeft,
  sweepExpiredLimits,
  writeLimit,
  type LimitStorage,
} from './limitedUntil';

function fakeStorage(initial: Record<string, string> = {}): LimitStorage & {
  readonly data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const throwingStorage: LimitStorage = {
  length: 1,
  key: () => {
    throw new Error('blocked');
  },
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const NOW = 1_800_000_000_000;

describe('limitStorageKey', () => {
  it('is different for each person, control and thing acted on', () => {
    const keys = [
      limitStorageKey({ control: 'resend', viewerId: 'u1', id: 'i1' }),
      limitStorageKey({ control: 'resend', viewerId: 'u2', id: 'i1' }),
      limitStorageKey({ control: 'resend', viewerId: 'u1', id: 'i2' }),
      limitStorageKey({ control: 'invites-send', viewerId: 'u1', id: 'i1' }),
      limitStorageKey({ control: 'invites-send', viewerId: 'u1' }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('writeLimit and readLimit', () => {
  it('give back a wait that is still running, as an absolute time', () => {
    const storage = fakeStorage();
    const limit = { until: NOW + 600_000, policy: 'resend-invite' };

    writeLimit({ storage, key: 'k', limit });

    expect(readLimit({ storage, key: 'k', now: NOW + 1000 })).toEqual(limit);
  });

  it('is the same later, as after a reload: only the clock moves, not the stored end', () => {
    const storage = fakeStorage();
    writeLimit({ storage, key: 'k', limit: { until: NOW + 600_000, policy: 'p' } });

    const first = readLimit({ storage, key: 'k', now: NOW });
    const afterReload = readLimit({ storage, key: 'k', now: NOW + 300_000 });

    expect(afterReload?.until).toBe(first?.until);
  });

  it('forgets a wait that has run out, and removes it', () => {
    const storage = fakeStorage();
    writeLimit({ storage, key: 'k', limit: { until: NOW + 1000, policy: 'p' } });

    expect(readLimit({ storage, key: 'k', now: NOW + 1000 })).toBeUndefined();
    expect(storage.data.has('k')).toBe(false);
  });

  it.each([
    ['not JSON', 'not json'],
    ['not an object', '"soon"'],
    ['no end time', JSON.stringify({ policy: 'p' })],
    ['an end time that is not a number', JSON.stringify({ until: 'tomorrow', policy: 'p' })],
    ['no policy', JSON.stringify({ until: NOW + 1000 })],
  ])('ignores and removes an entry that is %s', (_what, raw) => {
    const storage = fakeStorage({ k: raw });

    expect(readLimit({ storage, key: 'k', now: NOW })).toBeUndefined();
    expect(storage.data.has('k')).toBe(false);
  });

  it('finds nothing for another person or another control', () => {
    const storage = fakeStorage();
    writeLimit({
      storage,
      key: limitStorageKey({ control: 'resend', viewerId: 'u1', id: 'i1' }),
      limit: { until: NOW + 1000, policy: 'p' },
    });

    expect(
      readLimit({
        storage,
        key: limitStorageKey({ control: 'resend', viewerId: 'u2', id: 'i1' }),
        now: NOW,
      }),
    ).toBeUndefined();
  });
});

describe('when storage is missing or blocked', () => {
  it('reads nothing and writes nothing, without throwing', () => {
    const limit = { until: NOW + 1000, policy: 'p' };

    expect(readLimit({ storage: undefined, key: 'k', now: NOW })).toBeUndefined();
    expect(() => writeLimit({ storage: undefined, key: 'k', limit })).not.toThrow();
    expect(() => clearLimit({ storage: undefined, key: 'k' })).not.toThrow();

    expect(readLimit({ storage: throwingStorage, key: 'k', now: NOW })).toBeUndefined();
    expect(() => writeLimit({ storage: throwingStorage, key: 'k', limit })).not.toThrow();
    expect(() => clearLimit({ storage: throwingStorage, key: 'k' })).not.toThrow();
  });
});

describe('clearLimit', () => {
  it('removes the entry', () => {
    const storage = fakeStorage();
    writeLimit({ storage, key: 'k', limit: { until: NOW + 1000, policy: 'p' } });

    clearLimit({ storage, key: 'k' });

    expect(storage.data.has('k')).toBe(false);
  });
});

describe('secondsLeft', () => {
  it('rounds up and is never less than one second', () => {
    expect(secondsLeft({ until: NOW + 90_000, now: NOW })).toBe(90);
    expect(secondsLeft({ until: NOW + 1_001, now: NOW })).toBe(2);
    expect(secondsLeft({ until: NOW + 1, now: NOW })).toBe(1);
    expect(secondsLeft({ until: NOW - 5, now: NOW })).toBe(1);
  });
});

describe('sweepExpiredLimits', () => {
  const running = JSON.stringify({ until: NOW + 60_000, policy: 'p' });
  const expired = JSON.stringify({ until: NOW - 1, policy: 'p' });

  it('removes waits that ran out or cannot be read, and keeps the ones still running', () => {
    const storage = fakeStorage({
      [limitStorageKey({ control: 'resend', viewerId: 'u1', id: 'i1' })]: expired,
      [limitStorageKey({ control: 'resend', viewerId: 'u1', id: 'i2' })]: running,
      [limitStorageKey({ control: 'invites-send', viewerId: 'u2', id: 'b1' })]: 'not json',
      [handoffStorageKey('b2')]: expired,
      [handoffStorageKey('b3')]: running,
    });

    sweepExpiredLimits({ storage, now: NOW });

    expect([...storage.data.keys()].sort()).toEqual(
      [
        limitStorageKey({ control: 'resend', viewerId: 'u1', id: 'i2' }),
        handoffStorageKey('b3'),
      ].sort(),
    );
  });

  it("never touches an entry that is not this app's, even a broken one", () => {
    const storage = fakeStorage({
      theme: 'dark',
      'other:limit:x': 'not json',
      [limitStorageKey({ control: 'resend', viewerId: 'u1', id: 'i1' })]: expired,
    });

    sweepExpiredLimits({ storage, now: NOW });

    expect([...storage.data.keys()].sort()).toEqual(['other:limit:x', 'theme']);
  });

  it('removes every expired entry, however many there are (no skipping while it walks)', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        limitStorageKey({ control: 'resend', viewerId: 'u1', id: `i${index}` }),
        expired,
      ]),
    );
    const storage = fakeStorage(entries);

    sweepExpiredLimits({ storage, now: NOW });

    expect(storage.data.size).toBe(0);
  });

  it('does nothing, without throwing, when storage is missing or blocked', () => {
    expect(() => sweepExpiredLimits({ storage: undefined, now: NOW })).not.toThrow();
    expect(() => sweepExpiredLimits({ storage: throwingStorage, now: NOW })).not.toThrow();
  });
});
