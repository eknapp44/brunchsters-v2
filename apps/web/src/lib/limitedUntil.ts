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

export type LimitStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const KEY_PREFIXES = ['brunchsters:limit:', 'brunchsters:limit-handoff:'];

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

// Where the creation wizard leaves the wait when the server refused its invite batch (spec 0012):
// the wizard does not know who is signed in, and the brunch page does. The invite panel adopts it
// into its own per-person key and deletes this one. Keyed by the new brunch, which only its host
// has been sent to, and it expires like any other wait.
export function handoffStorageKey(brunchId: string): string {
  return `brunchsters:limit-handoff:invites-send:${brunchId}`;
}

// Another tab hears a change to storage by itself (the browser's `storage` event); a control on the
// same page does not, so a change is also announced on the window.
export const LIMIT_CHANGED_EVENT = 'brunchsters:limit-changed';

export function announceLimitChange(key: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LIMIT_CHANGED_EVENT, { detail: key }));
    }
  } catch {
    // Nothing else on the page learns of it until it is next read; the server still decides.
  }
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

// Deletes every wait this app has left in the browser that has run out or cannot be read. A wait
// is normally removed when its own control next reads it after it expired, but a control that is
// never shown again would leave its entry (which has a person's id and a brunch's id in its key)
// for good, so the hook sweeps on mount. Entries that are still running, and anything that is not
// ours, are left alone.
export function sweepExpiredLimits(params: {
  readonly storage: LimitStorage | undefined;
  readonly now: number;
}): void {
  const { storage, now } = params;
  if (storage === undefined) return;
  try {
    const ours: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) ours.push(key);
    }
    // Collected first: removing while walking by index would skip entries.
    for (const key of ours) readLimit({ storage, key, now });
  } catch {
    // Storage threw: nothing to sweep.
  }
}

// Whole seconds left, never less than 1, for the words ("Try again in …").
export function secondsLeft(params: { readonly until: number; readonly now: number }): number {
  return Math.max(1, Math.ceil((params.until - params.now) / 1000));
}
