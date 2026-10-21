import type { ReactElement, ReactNode } from 'react';
import styles from './Badge.module.css';

// A small status pill. The text carries the meaning; the tone is only emphasis, and an icon is
// decoration (always hidden from screen readers), never the only sign of the status.
export function Badge(props: {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'accent' | 'mint';
  readonly icon?: ReactNode;
}): ReactElement {
  const tone = props.tone ?? 'neutral';
  return (
    <span className={tone === 'neutral' ? styles.badge : `${styles.badge} ${styles[tone]}`}>
      {props.icon !== undefined && (
        <span className={styles.icon} aria-hidden="true">
          {props.icon}
        </span>
      )}
      {props.children}
    </span>
  );
}
