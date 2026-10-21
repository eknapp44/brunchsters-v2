import type { ReactElement, ReactNode } from 'react';
import styles from './Eyebrow.module.css';

// The small uppercase line above a headline ("Tuesday, October 21", "Step 1 of 4"). It uses the
// muted text color, not the subtle one: at this size the subtle color does not reach AA.
export function Eyebrow(props: {
  readonly children: ReactNode;
  readonly as?: 'p' | 'span';
}): ReactElement {
  const Tag = props.as ?? 'p';
  return <Tag className={styles.eyebrow}>{props.children}</Tag>;
}
