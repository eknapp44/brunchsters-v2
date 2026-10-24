'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { errorCopy } from '@/lib/errorCopy';
import {
  type BallotKind,
  ballotKey,
  ballotReleased,
  effectiveSelection,
  selectBallotEntry,
  toggleBallotOption,
} from '@/store/ballotsSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

// Failures that mean the page is out of date, not that the voter did something wrong.
const PAGE_IS_STALE: readonly string[] = [
  'option_gone',
  'voting_closed',
  'brunch_called_off',
  'brunch_not_active',
];

type BallotOption = {
  readonly id: string;
  readonly viewerVoted: boolean;
};

type BallotView = {
  readonly selected: ReadonlySet<string>;
  readonly submitting: boolean;
  readonly error: string | undefined;
  readonly emptyWarning: boolean;
  readonly readOnly: boolean;
  readonly toggle: (optionId: string) => void;
};

// The voter's ticks for one ballot, kept in the store (ballotsSlice) so the place and time
// checklists share one implementation. The rules (optimistic update, rollback, no empty
// ballot) live in the slice; this only reads it and refreshes the page after a save.
export function useBallot(params: {
  readonly brunchId: string;
  readonly kind: BallotKind;
  readonly options: readonly BallotOption[];
  readonly canVote: boolean;
  readonly closed: boolean;
}): BallotView {
  const { brunchId, kind, options } = params;
  const router = useRouter();
  const dispatch = useAppDispatch();
  const key = ballotKey({ brunchId, kind });
  const entry = useAppSelector((state) => selectBallotEntry(state, key));

  // Release on unmount so the next visit starts from what the server says, not from an
  // unsaved selection left behind.
  useEffect(() => () => void dispatch(ballotReleased(key)), [dispatch, key]);

  const selection = effectiveSelection({
    entry,
    seeded: options.filter((option) => option.viewerVoted).map((option) => option.id),
    optionIds: options.map((option) => option.id),
  });
  const readOnly = params.closed || !params.canVote;

  function toggle(optionId: string): void {
    void dispatch(toggleBallotOption({ brunchId, kind, optionId, current: selection, readOnly }))
      .unwrap()
      .then(({ saved }) => {
        if (saved) router.refresh();
      })
      // The slice already rolled back and kept the code. When the failure means the brunch is not
      // what this page showed (an option was removed, voting closed, it was called off), the page
      // is asked again, so what is on screen is what is true while the line says why.
      .catch((code: unknown) => {
        if (typeof code === 'string' && PAGE_IS_STALE.includes(code)) router.refresh();
      });
  }

  return {
    selected: new Set(selection),
    submitting: entry?.submitting ?? false,
    error: entry?.error === undefined ? undefined : errorCopy({ code: entry.error }),
    emptyWarning: entry?.emptyWarning ?? false,
    readOnly,
    toggle,
  };
}
