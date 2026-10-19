import type { ReactElement, ReactNode } from 'react';
import styles from './Container.module.css';

// The page's width and side gutters: the wide app width by default, or `narrow` for one column of
// form content. `as` picks the element so a page can keep its
// own <main> landmark.
export function Container(props: {
  readonly children: ReactNode;
  readonly as?: 'div' | 'main' | 'section';
  readonly size?: 'wide' | 'narrow';
}): ReactElement {
  const Tag = props.as ?? 'div';
  const className =
    props.size === 'narrow' ? `${styles.container} ${styles.narrow}` : styles.container;
  return <Tag className={className}>{props.children}</Tag>;
}
