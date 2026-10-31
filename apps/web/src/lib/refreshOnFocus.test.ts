import { describe, expect, it } from 'vitest';
import { REFRESH_MIN_GAP_MS, REFRESH_SUBMIT_HOLD_MS, shouldRefreshOnFocus } from './refreshOnFocus';

const calm = {
  visible: true,
  msSinceLastRefresh: REFRESH_MIN_GAP_MS,
  requestPending: false,
  ballotUnsaved: false,
  dialogOpen: false,
  msSinceSubmit: undefined,
} as const;

describe('shouldRefreshOnFocus', () => {
  it('refreshes a visible page that has been quiet for the minimum gap', () => {
    expect(shouldRefreshOnFocus(calm)).toBe(true);
  });

  it('does not refresh a tab that cannot be seen', () => {
    expect(shouldRefreshOnFocus({ ...calm, visible: false })).toBe(false);
  });

  it('does not refresh twice in quick succession', () => {
    expect(shouldRefreshOnFocus({ ...calm, msSinceLastRefresh: REFRESH_MIN_GAP_MS - 1 })).toBe(
      false,
    );
  });

  it('does not refresh while a request is on its way', () => {
    expect(shouldRefreshOnFocus({ ...calm, requestPending: true })).toBe(false);
  });

  it('does not refresh over a ballot that has not finished saving', () => {
    expect(shouldRefreshOnFocus({ ...calm, ballotUnsaved: true })).toBe(false);
  });

  it('does not refresh behind an open dialog', () => {
    expect(shouldRefreshOnFocus({ ...calm, dialogOpen: true })).toBe(false);
  });

  it('does not refresh just after a form was submitted, and does once the hold is over', () => {
    expect(shouldRefreshOnFocus({ ...calm, msSinceSubmit: REFRESH_SUBMIT_HOLD_MS - 1 })).toBe(
      false,
    );
    expect(shouldRefreshOnFocus({ ...calm, msSinceSubmit: REFRESH_SUBMIT_HOLD_MS })).toBe(true);
  });
});
