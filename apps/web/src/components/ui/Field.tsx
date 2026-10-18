import type { ReactElement, ReactNode } from 'react';
import styles from './Field.module.css';

// A text label with its control. The control stays inside a real <label>, exactly as the plain
// markup had it, so the control's accessible name is the label text and nothing else changes.
export function Field(props: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{props.label}</span>
      {props.children}
    </label>
  );
}
