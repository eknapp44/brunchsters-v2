import type { ReactElement } from 'react';
import styles from './Switch.module.css';

// An on/off choice that takes effect at once (not a form field that waits for a button): a native
// checkbox with the `switch` role, drawn as a track and thumb, with its caption beside it. The whole
// label is the target (44px tall). `aria-disabled` rather than `disabled` while a request is out, so
// the keyboard focus stays on the switch that was pressed.
export function Switch(props: {
  // The accessible name. It must contain the caption (WCAG 2.5.3), and say which choice it is.
  readonly name: string;
  readonly caption: string;
  readonly checked: boolean;
  readonly busy?: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        aria-label={props.name}
        checked={props.checked}
        {...(props.busy === true ? { 'aria-disabled': true } : {})}
        onChange={(event) => {
          if (props.busy === true) return;
          props.onChange(event.target.checked);
        }}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={styles.caption}>{props.caption}</span>
    </label>
  );
}
