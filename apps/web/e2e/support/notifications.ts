import { markRead, writeNotification } from '@brunchsters/core';
import type {
  BrunchId,
  NotificationData,
  NotificationId,
  NotificationTypeCode,
} from '@brunchsters/shared';
import { getDb } from './db';
import { uniqueSuffix, type TestUser } from './factories';

// Gives someone an unread notification the way the app writes one: through the real core service
// (spec 0015), never a row inserted by hand. It is a called-off notice about no brunch in
// particular, so a journey that only needs "a notification this person has" has one.
export async function giveNotification(params: {
  readonly user: TestUser;
  // Who called it off, as the row names them (a long one tests that the row wraps).
  readonly hostName?: string;
  // When it happened (the service takes the moment), for a journey that needs an order.
  readonly at?: Date;
}): Promise<NotificationId> {
  const result = await writeNotification(
    {
      userId: params.user.id,
      type: 'brunch.cancelled',
      title: 'Called off',
      body: 'A brunch was called off.',
      data: { kind: 'brunch.cancelled', hostName: params.hostName ?? 'Sam K.' },
      dedupeKey: `e2e:${uniqueSuffix()}`,
      ...(params.at === undefined ? {} : { now: params.at }),
    },
    { db: getDb() },
  );
  if (result.isErr()) throw new Error(`writeNotification failed: ${JSON.stringify(result.error)}`);
  return result.value.id;
}

// Marks one read the way the app does, through the real service.
export async function readNotification(params: {
  readonly user: TestUser;
  readonly id: NotificationId;
}): Promise<void> {
  const result = await markRead({ userId: params.user.id, ids: [params.id] }, { db: getDb() });
  if (result.isErr()) throw new Error(`markRead failed: ${JSON.stringify(result.error)}`);
}

export async function isUnread(id: NotificationId): Promise<boolean> {
  const row = await getDb().notification.findFirstOrThrow({ where: { id } });
  return row.readAt === null;
}

// A realistic inbox for the review pictures: a few kinds of row about one real brunch, a couple
// already read, newest last given. All through the real service.
export async function giveShowcaseNotifications(params: {
  readonly user: TestUser;
  readonly brunchId: BrunchId;
}): Promise<void> {
  const minutes = (n: number) => new Date(Date.now() - n * 60_000);
  const rows: readonly {
    readonly type: NotificationTypeCode;
    readonly data: NotificationData;
    readonly at: Date;
    readonly read: boolean;
  }[] = [
    {
      type: 'vote.cast',
      data: { kind: 'vote.cast', count: 3, actors: ['a', 'b', 'c'] },
      at: minutes(4),
      read: false,
    },
    {
      type: 'location.suggested',
      data: { kind: 'location.suggested', suggesterName: 'Maya Reyes', placeName: 'Zuni Cafe' },
      at: minutes(95),
      read: false,
    },
    {
      type: 'rsvp.received',
      data: { kind: 'rsvp.received', count: 2, actors: ['a', 'b'] },
      at: minutes(60 * 20),
      read: true,
    },
    {
      type: 'brunch.confirmed',
      data: {
        kind: 'brunch.confirmed',
        hostName: 'Sam K.',
        placeName: 'Tartine',
        scheduledAt: new Date(Date.now() + 9 * 24 * 3600_000).toISOString(),
        timezone: 'America/Los_Angeles',
      },
      at: minutes(60 * 24 * 3),
      read: true,
    },
  ];
  for (const [index, row] of rows.entries()) {
    const result = await writeNotification(
      {
        userId: params.user.id,
        type: row.type,
        brunchId: params.brunchId,
        title: 'Showcase',
        body: 'Showcase',
        data: row.data,
        dedupeKey: `e2e-showcase:${index}:${uniqueSuffix()}`,
        now: row.at,
      },
      { db: getDb() },
    );
    if (result.isErr())
      throw new Error(`writeNotification failed: ${JSON.stringify(result.error)}`);
    if (row.read) await readNotification({ user: params.user, id: result.value.id });
  }
}
