// The pure half of a control's "limited until" memory (spec 0012, ADR 0013): what is kept, under
// what key, and how it is read back. The hook (`useLimitedUntil`) is the thin React half.
//
// The end of the wait is stored as an absolute time, not a countdown, so it survives a refresh, a
// closed tab, and signing out and back in as the same person. The windows are fixed, so that time
// is exactly when the server's counter starts again. It lives in the browser only: another
// device, or cleared site data, learns on its first click (the server answers 429 again).

export type StoredLimit = {
  // Milliseconds since the epoch.
  readonly until: number;
  // The policy that refused, so the right words are shown after a reload.
  readonly policy: string;
};

export type LimitStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// One key per person and per control (and per thing it acts on: the Resend button adds its invite),
// so two people in one browser never see each other's wait.
export function limitStorageKey(params: {
  readonly control: string;
  readonly viewerId: string;
  readonly id?: string;
}): string {
  const tail = params.id === undefined ? '' : `:${params.id}`;
  return `brunchsters:limit:${params.control}:${params.viewerId}${tail}`;
}

// Storage can be missing or throw (a private window, blocked site data, a quota error), so every
// access is guarded and the page works without it.
export function browserStorage(): LimitStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isStoredLimit(value: unknown): value is StoredLimit {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.until === 'number' &&
    Number.isFinite(candidate.until) &&
    typeof candidate.policy === 'string'
  );
}

// The wait still running, or undefined. An expired or unreadable entry is removed on the way.
export function readLimit(params: {
  readonly storage: LimitStorage | undefined;
  readonly key: string;
  readonly now: number;
}): StoredLimit | undefined {
  const { storage, key, now } = params;
  if (storage === undefined) return undefined;

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (isStoredLimit(parsed) && parsed.until > now) return parsed;

  clearLimit({ storage, key });
  return undefined;
}

export function writeLimit(params: {
  readonly storage: LimitStorage | undefined;
  readonly key: string;
  readonly limit: StoredLimit;
}): void {
  try {
    params.storage?.setItem(params.key, JSON.stringify(params.limit));
  } catch {
    // The wait still holds in memory for this visit.
  }
}

export function clearLimit(params: {
  readonly storage: LimitStorage | undefined;
  readonly key: string;
}): void {
  try {
    params.storage?.removeItem(params.key);
  } catch {
    // Nothing to do: an expired entry is ignored when it is next read.
  }
}

// Whole seconds left, never less than 1, for the words ("Try again in …").
export function secondsLeft(params: { readonly until: number; readonly now: number }): number {
  return Math.max(1, Math.ceil((params.until - params.now) / 1000));
}
