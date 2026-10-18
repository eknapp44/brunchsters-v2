import type { ReactElement, ReactNode } from 'react';
import styles from './Hero.module.css';

// The page's <main>, with its content in one centered column on the warm gradient. Used where a
// single message and one action are the whole page (Constitution 24: one primary action).
export function Hero(props: { readonly children: ReactNode }): ReactElement {
  return (
    <main className={styles.hero}>
      <div className={styles.column}>{props.children}</div>
    </main>
  );
}
