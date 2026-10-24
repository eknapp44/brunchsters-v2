import { err, ok, type Result } from 'neverthrow';

export type AssertBrunchOpenError = { readonly kind: 'brunch_called_off' };

// Statuses after which a brunch takes no more changes. `cancelled` is the one a host can reach
// today; `completed` and `archived` have nothing producing them yet (ADR 0015), and share the
// answer so the day something does, a finished brunch is already closed to writes.
const CLOSED_STATUS_CODES: ReadonlySet<string> = new Set(['cancelled', 'completed', 'archived']);

// The guard every member-write service calls (spec 0013, ADR 0015): a called-off brunch keeps its
// votes, invites and attendees (so Bring it back restores them), but accepts no new RSVP, vote,
// suggestion, invite or email. Run it AFTER the membership check, so a non-member never learns a
// brunch is called off (an outsider gets the same 404 as for a made-up id). A draft is open: it has
// not started, but its host is still building it.
//
// Takes only the status, so it works on a row a caller already loaded (`HostBrunch`, a suggestion's
// brunch, an invite's brunch) without another query. `lifecycleGuards.test.ts` fails when a service
// that changes a brunch's data neither calls this nor is exempt with a reason.
export function assertBrunchOpen(brunch: {
  readonly status: { readonly code: string };
}): Result<void, AssertBrunchOpenError> {
  if (CLOSED_STATUS_CODES.has(brunch.status.code)) return err({ kind: 'brunch_called_off' });

  return ok(undefined);
}
