import type { ReactElement } from 'react';
import styles from './art.module.css';
import { LogoMark } from './LogoMark';

const MARK_SIZES = { md: 28, lg: 40, xl: 56 } as const;

// The mark and the name in the display face. Deliberately not a heading: pages have their own
// h1, and tests find the landing heading by role.
export function Wordmark(props: { readonly size?: keyof typeof MARK_SIZES }): ReactElement {
  const size = props.size ?? 'md';
  return (
    <span className={size === 'md' ? styles.wordmark : `${styles.wordmark} ${styles[size]}`}>
      <LogoMark size={MARK_SIZES[size]} />
      <span>brunchsters</span>
    </span>
  );
}
