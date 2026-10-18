import type { ReactElement, ReactNode } from 'react';
import styles from './Badge.module.css';

// A small status pill. The text carries the meaning; the tone is only emphasis.
export function Badge(props: {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'accent' | 'mint';
}): ReactElement {
  const tone = props.tone ?? 'neutral';
  return (
    <span className={tone === 'neutral' ? styles.badge : `${styles.badge} ${styles[tone]}`}>
      {props.children}
    </span>
  );
}
