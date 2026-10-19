'use client';

import { type ReactNode, useRef } from 'react';
import { Provider } from 'react-redux';
import { type AppStore, makeStore } from './makeStore';

// One store per mount, never a module-level singleton (ADR 0011). The ref keeps it across
// re-renders; each server request and each browser session gets its own.
export function StoreProvider({ children }: { readonly children: ReactNode }) {
  const storeRef = useRef<AppStore | undefined>(undefined);
  // Wrapped so `fetch` keeps its browser binding when a thunk calls it as a property.
  storeRef.current ??= makeStore({ fetch: (input, init) => fetch(input, init) });
  return <Provider store={storeRef.current}>{children}</Provider>;
}
