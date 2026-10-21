import type { ReactElement } from 'react';
import { whosInLine } from '@/lib/brunchPageFormat';
import styles from './detail.module.css';

// The celebration on a confirmed brunch (Brand Voice: "Brunch on. 💕 Maya & Devon are in."). It
// never says "Confirmed": the status badge is the one place that exact word appears. The emoji
// are decoration, so the heading reads "Brunch on."
export function ConfirmedBanner(props: { readonly goingNames: readonly string[] }): ReactElement {
  const line = whosInLine(props.goingNames);
  return (
    <div className={styles.banner}>
      <span className={styles.bannerEmoji} aria-hidden="true">
        🥂
      </span>
      <div>
        <h2>
          Brunch on.{' '}
          <span aria-hidden="true" className={styles.emoji}>
            💕
          </span>
        </h2>
        {line !== undefined && <p>{line}</p>}
      </div>
    </div>
  );
}
