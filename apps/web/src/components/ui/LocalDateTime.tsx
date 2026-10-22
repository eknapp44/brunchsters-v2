'use client';

import { useSyncExternalStore, type ReactElement } from 'react';

const subscribe = (): (() => void) => () => undefined;

const FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

// A moment as the person looking at it reads it ("Nov 1, 2026, 10:30 AM"), in their own zone and
// locale. Those are known only in the browser: the server renders in its own zone (UTC on Vercel)
// and default locale, so text formatted with `undefined` there differs from what the browser
// produces. React treats that as a hydration mismatch and rebuilds the page on the client,
// which discards anything a person typed before it finished loading (journey H8).
//
// So the server (and the first client render) say it in UTC and label it, which is true for
// everyone, and the browser's own reading replaces it straight after hydration. A place's time in
// the place's own zone does not need this: pass `timeZone` to `toLocaleString` where it is drawn.
export function LocalDateTime(props: { readonly date: Date }): ReactElement {
  const text = useSyncExternalStore(
    subscribe,
    () => props.date.toLocaleString(undefined, FORMAT),
    () => `${props.date.toLocaleString('en-US', { ...FORMAT, timeZone: 'UTC' })} UTC`,
  );
  return <>{text}</>;
}
