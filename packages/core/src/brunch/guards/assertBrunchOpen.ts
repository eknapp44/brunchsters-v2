import { err, ok, type Result } from 'neverthrow';

// `brunch_over` is a brunch that happened (`completed`, and the legacy `archived`): a different
// thing to tell a person than "called off", and it has no way back (spec 0015 M7).
export type AssertBrunchOpenError =
  | { readonly kind: 'brunch_called_off' }
  | { readonly kind: 'brunch_over' };

// Statuses after which a brunch takes no more changes: called off by its host, or over. `completed`
// is reached by the scheduler six hours after the brunch's time (spec 0015, ADR 0017); `archived`
// is legacy and answers the same way.
const OVER_STATUS_CODES: ReadonlySet<string> = new Set(['completed', 'archived']);

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
  if (brunch.status.code === 'cancelled') return err({ kind: 'brunch_called_off' });
  if (OVER_STATUS_CODES.has(brunch.status.code)) return err({ kind: 'brunch_over' });

  return ok(undefined);
}
