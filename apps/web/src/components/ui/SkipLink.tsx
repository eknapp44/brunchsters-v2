import type { ReactElement } from 'react';
import styles from './SkipLink.module.css';

export const MAIN_CONTENT_ID = 'main-content';

// The first thing a keyboard user reaches: jump past the top bar to the page.
export function SkipLink(): ReactElement {
  return (
    <a className={styles.skip} href={`#${MAIN_CONTENT_ID}`}>
      Skip to main content
    </a>
  );
}
