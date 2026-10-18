import type { ReactElement, ReactNode } from 'react';
import styles from './Container.module.css';

// The page's reading width and side gutters. `as` picks the element so a page can keep its
// own <main> landmark.
export function Container(props: {
  readonly children: ReactNode;
  readonly as?: 'div' | 'main' | 'section';
}): ReactElement {
  const Tag = props.as ?? 'div';
  return <Tag className={styles.container}>{props.children}</Tag>;
}
