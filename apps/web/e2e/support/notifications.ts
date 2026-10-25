import { writeNotification } from '@brunchsters/core';
import type { NotificationId } from '@brunchsters/shared';
import { getDb } from './db';
import { uniqueSuffix, type TestUser } from './factories';

// Gives someone an unread notification the way the app writes one: through the real core service
// (spec 0015), never a row inserted by hand. It is a called-off notice about no brunch in
// particular, so a journey that only needs "a notification this person has" has one.
export async function giveNotification(params: {
  readonly user: TestUser;
}): Promise<NotificationId> {
  const result = await writeNotification(
    {
      userId: params.user.id,
      type: 'brunch.cancelled',
      title: 'Called off',
      body: 'A brunch was called off.',
      data: { kind: 'brunch.cancelled', hostName: 'Sam K.' },
      dedupeKey: `e2e:${uniqueSuffix()}`,
    },
    { db: getDb() },
  );
  if (result.isErr()) throw new Error(`writeNotification failed: ${JSON.stringify(result.error)}`);
  return result.value.id;
}

export async function isUnread(id: NotificationId): Promise<boolean> {
  const row = await getDb().notification.findFirstOrThrow({ where: { id } });
  return row.readAt === null;
}
