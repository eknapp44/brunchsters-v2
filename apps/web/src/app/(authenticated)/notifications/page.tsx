import { listNotifications } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BreakfastScene } from '@/components/art/BreakfastScene';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Container } from '@/components/ui/Container';
import { db } from '@/lib/db';
import {
  describeNotification,
  EMPTY_INBOX_ACTION,
  EMPTY_INBOX_BODY,
  EMPTY_INBOX_HEADLINE,
  INBOX_HEADING,
  notificationHref,
  relativeAgo,
  SETTINGS_LINK,
  SHOW_OLDER,
} from '@/lib/notificationCopy';
import { MarkAllRead } from './MarkAllRead';
import { NotificationRow } from './NotificationRow';
import styles from './notifications.module.css';

const PAGE_SIZE = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A page starts after the last row of the one before: its moment and its id, as "<moment>~<id>" (the
// id keeps two rows changed in the same millisecond from being skipped; a link with only a moment
// still works). Anything that is not a moment is the first page, so a mangled address shows the inbox
// rather than an error.
function parseBefore(
  value: string | undefined,
): { readonly lastEventAt: Date; readonly id?: string } | undefined {
  if (value === undefined) return undefined;
  const [moment, id] = value.split('~');
  const lastEventAt = new Date(moment ?? '');
  if (Number.isNaN(lastEventAt.getTime())) return undefined;
  return id !== undefined && UUID.test(id) ? { lastEventAt, id } : { lastEventAt };
}

// The inbox (spec 0015, ADR 0017): what happened on the signed-in person's brunches, newest change
// first. It is keyed by the session and takes no id, so there is nothing to look up or leak. Viewing
// it marks nothing read (a GET changes no data): a row is read when it is opened, or with
// "Mark all read".
export default async function NotificationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly before?: string }>;
}) {
  const query = await searchParams;
  const session = await auth();
  if (session === null) redirect('/sign-in');

  const before = parseBefore(query.before);
  const now = new Date();
  // One more than a page, to know whether there is an older one.
  const result = await listNotifications(
    { userId: session.user.id as UserId, limit: PAGE_SIZE + 1, ...(before ? { before } : {}) },
    { db },
  );
  if (result.isErr()) throw new Error('Could not read notifications', { cause: result.error });

  const items = result.value.slice(0, PAGE_SIZE);
  const older = result.value.length > PAGE_SIZE ? items[items.length - 1] : undefined;
  // An older page that no longer has anything on it is just the inbox.
  if (items.length === 0 && before !== undefined) redirect('/notifications');

  return (
    <Container as="main" size="narrow">
      <div className={styles.header}>
        <h1>{INBOX_HEADING}</h1>
        <div className={styles.actions}>
          {items.length > 0 && <MarkAllRead hasUnread={items.some((item) => !item.isRead)} />}
          <ButtonLink href="/settings/notifications" variant="ghost" size="sm">
            {SETTINGS_LINK}
          </ButtonLink>
        </div>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <BreakfastScene />
          <h2>{EMPTY_INBOX_HEADLINE}</h2>
          <p>{EMPTY_INBOX_BODY}</p>
          <ButtonLink href="/brunch/new" variant="primary">
            {EMPTY_INBOX_ACTION}
          </ButtonLink>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const view = describeNotification({ data: item.data, brunchTitle: item.brunchTitle });
            const ago = relativeAgo({ then: item.lastEventAt, now });
            return (
              <NotificationRow
                key={item.id}
                id={item.id}
                href={notificationHref({ data: item.data, brunchId: item.brunchId })}
                view={view}
                isRead={item.isRead}
                ago={ago}
                atIso={item.lastEventAt.toISOString()}
              />
            );
          })}
        </ul>
      )}

      {older !== undefined && (
        <div className={styles.more}>
          <ButtonLink
            href={`/notifications?before=${encodeURIComponent(`${older.lastEventAt.toISOString()}~${older.id}`)}`}
            variant="ghost"
            size="sm"
          >
            {SHOW_OLDER}
          </ButtonLink>
        </div>
      )}
    </Container>
  );
}
