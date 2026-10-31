// When a page may ask the server for itself again after the person comes back to it (spec 0015 M8,
// ADR 0017). Pure, so every exclusion is unit tested; `useRefreshOnFocus` only wires it to the page.
//
// The point is that what others did (a vote, an answer, a change by the host) appears without a manual
// reload. The rules exist so a refresh never lands on someone mid-action: not while the tab cannot be
// seen, not twice in quick succession, not while a request is on its way, not over a ballot that has not
// finished saving, not behind an open dialog, and not just after a form was submitted (the page is
// about to change by itself; and a refresh in flight when someone signs out could bring the session
// back, see `useBadgePoll`).

export const REFRESH_MIN_GAP_MS = 15_000;

// How long after a form is submitted nothing is refreshed.
export const REFRESH_SUBMIT_HOLD_MS = 10_000;

export function shouldRefreshOnFocus(params: {
  readonly visible: boolean;
  // Milliseconds since this page last loaded or refreshed.
  readonly msSinceLastRefresh: number;
  readonly requestPending: boolean;
  readonly ballotUnsaved: boolean;
  readonly dialogOpen: boolean;
  // Milliseconds since a form was last submitted, or undefined if none has been.
  readonly msSinceSubmit: number | undefined;
}): boolean {
  if (!params.visible) return false;
  if (params.msSinceLastRefresh < REFRESH_MIN_GAP_MS) return false;
  if (params.requestPending || params.ballotUnsaved || params.dialogOpen) return false;
  if (params.msSinceSubmit !== undefined && params.msSinceSubmit < REFRESH_SUBMIT_HOLD_MS) {
    return false;
  }
  return true;
}
