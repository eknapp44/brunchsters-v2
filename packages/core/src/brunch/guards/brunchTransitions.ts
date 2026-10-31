import type { BrunchStatusCode } from '@brunchsters/database';
import { err, ok, type Result } from 'neverthrow';

// The moves a brunch's stored status can make (spec 0013, ADR 0015), written down once. Keyed by
// every seeded status code, so a new status is a type error here until someone decides its moves.
//
//   draft -> active                 the first invites go out (sendInvites)
//   active -> confirmed             the host confirms (confirmBrunch)
//   active, confirmed -> cancelled  the host calls it off (not for a brunch that is already over:
//                                   that rule needs the confirmed time, so cancelBrunch checks it)
//   confirmed -> completed          the scheduler, six hours after the brunch's time (spec 0015)
//   cancelled -> active, confirmed  the host brings it back, to the status it had before (the
//                                   service restores `statusBeforeCancelId`; a draft is never
//                                   cancelled)
//
// completed is final. brunching, paying and the legacy archived have no moves: nothing produces
// them yet.
export const BRUNCH_TRANSITIONS: Readonly<Record<BrunchStatusCode, readonly BrunchStatusCode[]>> = {
  draft: ['active'],
  active: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'completed'],
  cancelled: ['active', 'confirmed'],
  completed: [],
  brunching: [],
  paying: [],
  archived: [],
};

export type InvalidTransitionError = {
  readonly kind: 'invalid_transition';
  readonly from: string;
  readonly to: string;
};

// Pure. Codes come from database rows, so they are strings here; one that is not in the table is
// refused rather than trusted. Callers still re-check the status inside their transaction with a
// conditional update (`where: { id, statusId }`), because this only judges the status they read.
export function assertCanTransition(input: {
  readonly from: string;
  readonly to: string;
}): Result<void, InvalidTransitionError> {
  const allowed: readonly string[] | undefined = BRUNCH_TRANSITIONS[input.from as BrunchStatusCode];
  if (allowed === undefined || !allowed.includes(input.to)) {
    return err({ kind: 'invalid_transition', from: input.from, to: input.to });
  }

  return ok(undefined);
}
