'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactElement } from 'react';
import { bellBadgeText, bellLabel } from '@/lib/notificationCopy';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUnreadCount, unreadSeeded } from '@/store/notificationsSlice';
import { useBadgePoll } from '@/store/useBadgePoll';
import { Icon } from '../icons/Icon';
import styles from './NotificationBell.module.css';

// The bell in the top bar (spec 0015, ADR 0017): a link to the inbox with the unread count. The
// number is drawn from the store, which the server seeds with the count it rendered the page with
// (so it never flashes empty) and `useBadgePoll` keeps fresh. The visible number repeats the link's
// name, so it is hidden from screen readers; the name is what they hear ("Notifications, 3 unread").
export function NotificationBell(props: {
  readonly initialCount: number | undefined;
}): ReactElement {
  const dispatch = useAppDispatch();
  const live = useAppSelector(selectUnreadCount);
  const pathname = usePathname();
  useBadgePoll();

  // Each time the server renders with a new number (a navigation, a refresh), take it.
  useEffect(() => {
    if (props.initialCount !== undefined) dispatch(unreadSeeded(props.initialCount));
  }, [dispatch, props.initialCount]);

  const count = live ?? props.initialCount ?? 0;
  const badge = bellBadgeText(count);

  return (
    <Link
      href="/notifications"
      className={styles.bell}
      aria-label={bellLabel(count)}
      {...(pathname === '/notifications' ? { 'aria-current': 'page' as const } : {})}
    >
      <Icon name="bell" size={20} />
      {badge !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {badge}
        </span>
      )}
    </Link>
  );
}
