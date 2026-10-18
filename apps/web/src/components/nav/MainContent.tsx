import type { ReactElement, ReactNode } from 'react';
import { MAIN_CONTENT_ID } from '../ui/SkipLink';
import styles from './MainContent.module.css';

// Wraps the page under the top bar so the skip link has somewhere to jump to. Each page keeps
// its own <main> landmark inside.
export function MainContent(props: { readonly children: ReactNode }): ReactElement {
  return (
    <div id={MAIN_CONTENT_ID} tabIndex={-1} className={styles.main}>
      {props.children}
    </div>
  );
}
