import { expect, type Locator, type Page } from '@playwright/test';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { getDb } from './db';

// The words of the bell and the inbox (spec 0015 M4), in one place so a journey says what it means
// and a wording change is one edit. They mirror `lib/notificationCopy.ts` on purpose: a journey
// that imported the app's own copy would pass whatever the copy said.

export const INBOX_HEADING = 'Notifications';
export const MARK_ALL_READ = 'Mark all read';
export const EMPTY_INBOX_HEADLINE = 'Nothing yet.';
export const OLDER = 'Show older';
export const UNREAD = 'Unread.';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The bell in the top bar. Its name is "Notifications" with nothing unread, and "Notifications, 3
// unread" with three.
export function bell(page: Page): Locator {
  return page.getByRole('link', { name: /^Notifications/ });
}

export async function expectBell(page: Page, unread: number): Promise<void> {
  const name = unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`;
  await expect(bell(page)).toHaveAccessibleName(name);
}

// One row of the inbox, found by its words.
export function inboxRow(page: Page, words: string): Locator {
  return page.getByRole('link', { name: new RegExp(escapeRegExp(words)) });
}

export function inboxRows(page: Page): Locator {
  return page.getByRole('main').getByRole('listitem');
}

// A row is unread when a screen reader is told so; a read row has no such word.
export async function expectUnread(row: Locator, unread: boolean): Promise<void> {
  if (unread) await expect(row).toContainText(UNREAD);
  else await expect(row).not.toContainText(UNREAD);
}

export async function unreadCountInDb(userId: UserId): Promise<number> {
  return getDb().notification.count({ where: { userId, readAt: null } });
}

// Waits until the queue has written `count` rows for this person (about the brunch, when given).
// A journey waits for the row to exist before it looks at the page, so what it then sees is the
// page's doing, not a race with the queue.
export async function waitForNotifications(params: {
  readonly userId: UserId;
  readonly brunchId?: BrunchId;
  readonly count: number;
}): Promise<void> {
  await expect
    .poll(async () =>
      getDb().notification.count({
        where: {
          userId: params.userId,
          ...(params.brunchId === undefined ? {} : { brunchId: params.brunchId }),
        },
      }),
    )
    .toBe(params.count);
}
