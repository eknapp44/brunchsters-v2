import type { ReactElement } from 'react';
import { OVER_HEADING, overLine } from '@/lib/lifecycleCopy';
import styles from './detail.module.css';

// What the brunch page says once the brunch has happened (spec 0015): in place of the celebration. The
// page below it is read-only (the server refuses every change with `brunch_over`), so the banner has
// nothing to ask. It reuses the called-off banner's frame; the words are what differ.
export function OverBanner(props: { readonly isHost: boolean }): ReactElement {
  return (
    <div className={styles.banner}>
      <div>
        <h2>{OVER_HEADING}</h2>
        <p>{overLine({ isHost: props.isHost })}</p>
      </div>
    </div>
  );
}
