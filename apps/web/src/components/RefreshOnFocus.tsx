'use client';

import { useRefreshOnFocus } from '@/store/useRefreshOnFocus';

// Mounts the refresh on focus (spec 0015 M8) on a Server Component page, which cannot call a hook.
// Draws nothing.
export function RefreshOnFocus(): null {
  useRefreshOnFocus();
  return null;
}
