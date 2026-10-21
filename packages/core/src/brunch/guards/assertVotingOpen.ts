import { err, ok, type Result } from 'neverthrow';
import type { HostBrunch } from './assertHostOf';

export type ClosableBrunch = HostBrunch & {
  readonly votingClosedAt: Date | null;
  readonly votingDeadline: Date | null;
};

// The three facts "is voting closed" depends on, so a caller that only has those (a dashboard
// row, not a whole brunch row) can ask the same question and cannot disagree with the rules.
export type VotingClosureFields = {
  readonly votingClosedAt: Date | null;
  readonly votingDeadline: Date | null;
  readonly status: { readonly code: string };
};

export type AssertVotingOpenError = { readonly kind: 'voting_closed' };

// The single source of "is voting closed": an early manual close
// (votingClosedAt), a past votingDeadline, or the brunch already being
// confirmed. Pure and synchronous so it can run on a freshly re-fetched row
// inside a transaction — the whole point is to check the latest committed
// state right before a write, not a value read earlier in the request.
// `now` defaults to the clock; a caller that wants a fixed moment passes one.
export function isVotingClosed(brunch: VotingClosureFields, now: Date = new Date()): boolean {
  if (brunch.votingClosedAt !== null) return true;
  if (brunch.status.code === 'confirmed') return true;
  return brunch.votingDeadline !== null && now > brunch.votingDeadline;
}

export function assertVotingOpen(brunch: ClosableBrunch): Result<void, AssertVotingOpenError> {
  if (isVotingClosed(brunch)) return err({ kind: 'voting_closed' });

  return ok(undefined);
}
