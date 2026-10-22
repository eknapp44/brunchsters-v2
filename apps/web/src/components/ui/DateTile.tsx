import type { ReactElement } from 'react';
import styles from './DateTile.module.css';

// A brunch's day as a small tile ("NOV 8"), or "TBD" when it has none. The day is read in the
// brunch's own time zone, so a brunch at 11 PM Pacific is not shown a day late to a viewer in
// New York. Past brunches use `muted`.
export function DateTile(props: {
  readonly date: Date | undefined;
  readonly timeZone: string | undefined;
  readonly muted?: boolean;
}): ReactElement {
  const className =
    props.muted === true || props.date === undefined
      ? `${styles.tile} ${styles.muted}`
      : styles.tile;

  if (props.date === undefined) {
    return (
      <span className={className} role="img" aria-label="Date to be decided">
        <span className={styles.day} aria-hidden="true">
          TBD
        </span>
      </span>
    );
  }

  const zone = props.timeZone === undefined ? {} : { timeZone: props.timeZone };
  const month = props.date.toLocaleString('en-US', { month: 'short', ...zone });
  const day = props.date.toLocaleString('en-US', { day: 'numeric', ...zone });
  const spoken = props.date.toLocaleString('en-US', { month: 'long', day: 'numeric', ...zone });
  return (
    <span className={className} role="img" aria-label={spoken}>
      <span className={styles.month} aria-hidden="true">
        {month}
      </span>
      <span className={styles.day} aria-hidden="true">
        {day}
      </span>
    </span>
  );
}
