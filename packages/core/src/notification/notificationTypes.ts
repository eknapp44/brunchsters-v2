import type {
  BrunchId,
  NotificationData,
  NotificationId,
  NotificationTypeCode,
} from '@brunchsters/shared';

export type NotificationDbError = { readonly kind: 'db_error'; readonly cause: unknown };

// A row as the inbox reads it (spec 0015): the facts, never the words. The page words `data` from
// its copy module at read time; `title` and `body` are the plain-text fallback stored with the row.
export type NotificationItem = {
  readonly id: NotificationId;
  readonly type: NotificationTypeCode;
  readonly brunchId: BrunchId | undefined;
  // Read through the live brunch, so a deleted brunch never shows its title.
  readonly brunchTitle: string | undefined;
  readonly data: NotificationData;
  readonly title: string;
  readonly body: string;
  readonly isRead: boolean;
  // When the row was last changed. A coalesced row moves up the list when it changes.
  readonly lastEventAt: Date;
};

// The types whose rows coalesce into one per brunch (a count of new replies, of new votes).
export const COALESCED_TYPES = ['rsvp.received', 'vote.cast'] as const;
export type CoalescedType = (typeof COALESCED_TYPES)[number];

// Ids come from a request body; one that is not a UUID cannot name a row, and must be answered
// like one that names nobody else's (the database would refuse it for the uuid column).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
