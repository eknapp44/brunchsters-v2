import { err, ok, type Result } from 'neverthrow';
import type { HostBrunch } from './assertHostOf';

export type AssertBrunchActiveError = { readonly kind: 'brunch_not_active' };

// Rejects anything that isn't active — covers draft (nothing to vote or
// confirm yet), confirmed (already locked), and cancelled.
export function assertBrunchActive(brunch: HostBrunch): Result<void, AssertBrunchActiveError> {
  if (brunch.status.code !== 'active') return err({ kind: 'brunch_not_active' });

  return ok(undefined);
}
