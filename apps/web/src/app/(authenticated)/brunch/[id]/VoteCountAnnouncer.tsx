'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { describeVoteChanges, type CountedOption } from '@/lib/voteAnnouncements';
import { selectOwnSaves } from '@/store/ballotsSlice';
import { useAppSelector } from '@/store/hooks';
import styles from './detail.module.css';

// How long after the person's own vote was saved a change in the counts is taken to be theirs: the
// page asks the server again after a save, and the new counts arrive a moment later.
const OWN_TAP_WINDOW_MS = 8_000;

// The polite live region for vote counts (spec 0015 M8): when the counts on the page change because
// someone else voted (the page was refreshed on focus, or after the person's own tap and a vote by
// someone else came with it), it says which options changed. The person's own tap is silent: their
// saved-vote counter (`ownSaves`) went up just before, so the next change in the counts is theirs.
// (An outside vote that lands in those few seconds is absorbed with it; the page still shows it.)
// The region is in the page from the first paint, so a screen reader is already listening when its
// text changes. It is a live region without `role="status"` on purpose: the toast region is the page's
// one status region (journey T2), and this one is polite on its own.
export function VoteCountAnnouncer(props: {
  readonly options: readonly CountedOption[];
}): ReactElement {
  const ownSaves = useAppSelector(selectOwnSaves);
  const [message, setMessage] = useState('');
  const seen = useRef(props.options);
  const own = useRef({ saves: ownSaves, at: 0 });

  useEffect(() => {
    if (ownSaves !== own.current.saves) own.current = { saves: ownSaves, at: Date.now() };

    const text = describeVoteChanges({ before: seen.current, after: props.options });
    seen.current = props.options;
    if (text === undefined) return;

    if (Date.now() - own.current.at < OWN_TAP_WINDOW_MS) {
      // Theirs: said by the page already. One change is absorbed per save.
      own.current = { saves: own.current.saves, at: 0 };
      return;
    }
    setMessage(text);
  }, [props.options, ownSaves]);

  return (
    <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
