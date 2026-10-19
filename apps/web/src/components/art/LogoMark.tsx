import type { ReactElement } from 'react';
import styles from './art.module.css';

// The Brunchsters mark (the prototype's "A5"): a fried-egg outline with two yolks and a spine
// that together read as a capital B. Decorative; the wordmark next to it carries the name.
export function LogoMark(props: { readonly size?: number }): ReactElement {
  const size = props.size ?? 28;
  return (
    <svg
      className={styles.mark}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className={styles.ring} cx="20" cy="20" rx="15" ry="18" />
      <rect className={styles.yolk} x="13.6" y="9" width="2" height="22" rx="1" />
      <circle className={styles.yolk} cx="22" cy="14.5" r="4.4" />
      <circle className={styles.yolk} cx="22.5" cy="25" r="5.1" />
    </svg>
  );
}
