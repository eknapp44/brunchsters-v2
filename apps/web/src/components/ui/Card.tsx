import type { ReactElement, ReactNode } from 'react';
import styles from './Card.module.css';

// A surface for one thing (a brunch, an invite). Layout inside it belongs to the caller.
export function Card(props: {
  readonly children: ReactNode;
  readonly tone?: 'default' | 'accent';
  readonly raised?: boolean;
}): ReactElement {
  const classNames = [
    styles.card,
    props.tone === 'accent' ? styles.accent : undefined,
    props.raised === true ? styles.raised : undefined,
  ]
    .filter((name): name is string => name !== undefined)
    .join(' ');
  return <div className={classNames}>{props.children}</div>;
}
