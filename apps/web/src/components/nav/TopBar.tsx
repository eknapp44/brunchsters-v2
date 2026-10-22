import { avatarColorIndex } from '@brunchsters/shared';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Wordmark } from '../art/Wordmark';
import { InitialsAvatar } from '../ui/InitialsAvatar';
import { Button } from '../ui/Button';
import styles from './TopBar.module.css';

export type TopBarUser = {
  readonly name: string | undefined;
  readonly email: string | undefined;
};

// The bar across the top of every page: the wordmark (home), and for a signed-in person their
// initials, name and Sign out. There is no menu or tab bar yet; those arrive with the features
// they would point to (spec 0009 parity table).
export function TopBar(props: {
  readonly user: TopBarUser | undefined;
  readonly signOutAction: () => Promise<void>;
}): ReactElement {
  const { user } = props;
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link className={styles.home} href={user === undefined ? '/' : '/dashboard'}>
          <Wordmark />
        </Link>
        {user !== undefined && (
          <nav className={styles.account} aria-label="Account">
            <InitialsAvatar
              name={user.name ?? 'Your account'}
              colorIndex={avatarColorIndex(user.email ?? user.name ?? '')}
            />
            <span className={styles.name}>{user.name ?? user.email}</span>
            <form action={props.signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
