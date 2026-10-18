import type { ReactElement, ReactNode } from 'react';
import styles from './InlineAlert.module.css';

// A message set into the page, for something that went wrong or that the person should know.
// It adds no role of its own: callers keep exactly the role (or none) the message has today,
// because tests and screen readers find some of these messages by it.
export function InlineAlert(props: {
  readonly children: ReactNode;
  readonly tone?: 'info' | 'error';
  readonly role?: 'alert' | 'status';
}): ReactElement {
  return (
    <div
      className={props.tone === 'error' ? `${styles.alert} ${styles.error}` : styles.alert}
      role={props.role}
    >
      {props.children}
    </div>
  );
}
