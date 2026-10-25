// When the bell asks the server for its number again (spec 0015, ADR 0017). Pure, so every rule is
// unit tested; `useBadgePoll` only wires it to the clock and the page's visibility.
//
// The count is one indexed query, so asking about once a minute is cheap; the rules exist so it is
// never asked for nothing: not while the tab cannot be seen, and not twice in quick succession when
// someone flips between windows.

export const BADGE_POLL_INTERVAL_MS = 60_000;

// Coming back to the tab asks again, but not if it was asked just now.
export const BADGE_FOCUS_MIN_GAP_MS = 15_000;

export type BadgePollReason =
  // The bell first appeared.
  | 'mount'
  // The interval ticked.
  | 'tick'
  // The tab became visible again, or the window got focus.
  | 'focus';

export function shouldPollBadge(params: {
  readonly reason: BadgePollReason;
  readonly visible: boolean;
  // Milliseconds since the last time it asked, or undefined if it never has.
  readonly msSinceLastPoll: number | undefined;
}): boolean {
  if (!params.visible) return false;
  switch (params.reason) {
    case 'mount':
      return true;
    case 'focus':
      return (
        params.msSinceLastPoll === undefined || params.msSinceLastPoll >= BADGE_FOCUS_MIN_GAP_MS
      );
    case 'tick':
      // A tick that comes right after a focus poll is skipped; the next one is a minute away.
      return (
        params.msSinceLastPoll === undefined || params.msSinceLastPoll >= BADGE_POLL_INTERVAL_MS / 2
      );
  }
}
