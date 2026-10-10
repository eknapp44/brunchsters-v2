import { err, ok, type Result } from 'neverthrow';
import type { HostBrunch } from './assertHostOf';

export type ClosableBrunch = HostBrunch & {
  readonly votingClosedAt: Date | null;
  readonly votingDeadline: Date | null;
};

export type AssertVotingOpenError = { readonly kind: 'voting_closed' };

// The single source of "is voting closed": an early manual close
// (votingClosedAt), a past votingDeadline, or the brunch already being
// confirmed. Pure and synchronous so it can run on a freshly re-fetched row
// inside a transaction — the whole point is to check the latest committed
// state right before a write, not a value read earlier in the request.
export function isVotingClosed(brunch: ClosableBrunch): boolean {
  if (brunch.votingClosedAt !== null) return true;
  if (brunch.status.code === 'confirmed') return true;
  return brunch.votingDeadline !== null && new Date() > brunch.votingDeadline;
}

export function assertVotingOpen(brunch: ClosableBrunch): Result<void, AssertVotingOpenError> {
  if (isVotingClosed(brunch)) return err({ kind: 'voting_closed' });

  return ok(undefined);
}
