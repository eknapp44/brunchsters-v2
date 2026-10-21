import { avatarColorIndex, initialsOf } from '@brunchsters/shared';
import type { ReactElement } from 'react';
import styles from './InitialsAvatar.module.css';

const COLOR_CLASSES = [
  styles.color0,
  styles.color1,
  styles.color2,
  styles.color3,
  styles.color4,
  styles.color5,
] as const;

// A person is always initials on a color, never a photo (ADR 0012: a photo needs a consent
// setting that does not exist yet). `seed` picks the color and should be stable for the person
// (their id, or an email for someone who has not signed in). The picture is announced as the
// person's name, unless `decorative` says the name is already written beside it.
export function InitialsAvatar(props: {
  readonly name: string;
  readonly seed: string;
  readonly size?: 'md' | 'lg';
  readonly decorative?: boolean;
}): ReactElement {
  const color = COLOR_CLASSES[avatarColorIndex(props.seed)] ?? styles.color0;
  const className = [styles.avatar, color, props.size === 'lg' ? styles.lg : undefined]
    .filter((name): name is string => name !== undefined)
    .join(' ');
  const initials = initialsOf(props.name);
  if (props.decorative === true) {
    return (
      <span className={className} aria-hidden="true">
        {initials}
      </span>
    );
  }
  return (
    <span className={className} role="img" aria-label={props.name}>
      {initials}
    </span>
  );
}
