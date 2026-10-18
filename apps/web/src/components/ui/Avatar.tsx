import type { ReactElement } from 'react';
import styles from './Avatar.module.css';

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase());
  return letters.join('') || '?';
}

// A person's picture, or their initials when they have none. `name` is the accessible name
// (the image's alt text), so the same person is always announced the same way.
export function Avatar(props: {
  readonly name: string;
  readonly imageUrl: string | undefined;
}): ReactElement {
  if (props.imageUrl !== undefined) {
    return (
      <span className={styles.avatar}>
        <img
          className={styles.image}
          src={props.imageUrl}
          alt={props.name}
          width={32}
          height={32}
        />
      </span>
    );
  }
  return (
    <span className={styles.avatar} role="img" aria-label={props.name}>
      {initialsOf(props.name)}
    </span>
  );
}
