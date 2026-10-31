'use client';

import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { LocalDateTime } from '@/components/ui/LocalDateTime';
import { UNREAD_PREFIX, type NotificationView } from '@/lib/notificationCopy';
import { useSignedOutRedirect } from '@/lib/useSignedOutRedirect';
import { useAppDispatch } from '@/store/hooks';
import { markNotificationsRead } from '@/store/notificationsSlice';
import styles from './notifications.module.css';

// One notification: a link to what it is about. Opening it marks it read, best effort: the request
// goes out as the page changes and never holds the navigation, and if the route says no the count
// comes back and a toast says why (`markNotificationsRead`). Whether it looks read is the server's
// word until the person opens it, then their own.
export function NotificationRow(props: {
  readonly id: string;
  readonly href: string;
  readonly view: NotificationView;
  readonly isRead: boolean;
  // "5 min ago" for a recent row; undefined from a week on, when the date itself is shown.
  readonly ago: string | undefined;
  readonly atIso: string;
}): ReactElement {
  const dispatch = useAppDispatch();
  const redirectIfSignedOut = useSignedOutRedirect();
  const [opened, setOpened] = useState(false);
  const unread = !props.isRead && !opened;
  const { view } = props;

  function onOpen(): void {
    if (!unread) return;
    setOpened(true);
    void dispatch(markNotificationsRead({ ids: [props.id], unreadAmong: 1 })).then((result) => {
      if (!markNotificationsRead.rejected.match(result)) return;
      // The route said no: the count is already back, and so is the row's dot.
      setOpened(false);
      redirectIfSignedOut(result.payload?.code);
    });
  }

  return (
    <li className={styles.item}>
      <Link
        href={props.href}
        className={unread ? `${styles.row} ${styles.unread}` : styles.row}
        onClick={onOpen}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.headline}>
            {unread && <span className={styles.visuallyHidden}>{UNREAD_PREFIX} </span>}
            {view.headline}
            {view.emoji !== undefined && (
              <>
                {' '}
                <span aria-hidden="true">{view.emoji}</span>
              </>
            )}
          </span>
          {(view.detail !== undefined || view.when !== undefined) && (
            <span className={styles.detail}>
              {view.detail}
              {view.detail !== undefined && view.when !== undefined && ' · '}
              {view.when !== undefined && (
                <>
                  {view.when.label} <LocalDateTime date={new Date(view.when.iso)} />
                </>
              )}
            </span>
          )}
          <span className={styles.when}>
            {props.ago ?? <LocalDateTime date={new Date(props.atIso)} />}
          </span>
        </span>
      </Link>
    </li>
  );
}
