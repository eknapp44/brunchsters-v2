// The vocabulary of notifications (spec 0015, ADR 0017): which types exist, who may be told what,
// what a person gets without choosing, and the timing constants the scheduler uses. Pure and
// framework-free, so the server, the handlers and the browser read the same lists.

// Every seeded NotificationType code. The first twelve were seeded with the schema; the last two
// were added by spec 0015. A database test compares this list with the seeded rows.
export const NOTIFICATION_TYPE_CODES = [
  'rsvp.received',
  'vote.cast',
  'invite.suggestion',
  'location.suggested',
  'time.suggested',
  'brunch.confirmed',
  'vote.deadline.approaching',
  'invite.received',
  'brunch.cancelled',
  'vote.autoclose.prompted',
  'running.late',
  'host.transferred',
  'brunch.reinstated',
  'invite.email.failed',
] as const;

export type NotificationTypeCode = (typeof NOTIFICATION_TYPE_CODES)[number];

export function isNotificationTypeCode(value: string): value is NotificationTypeCode {
  return (NOTIFICATION_TYPE_CODES as readonly string[]).includes(value);
}

// The types something produces today. The rest are seeded but have no feature behind them, so no
// row is ever written for them and the preferences page does not list them.
export const PRODUCED_NOTIFICATION_TYPES = [
  'rsvp.received',
  'vote.cast',
  'invite.suggestion',
  'location.suggested',
  'time.suggested',
  'brunch.confirmed',
  'vote.deadline.approaching',
  'invite.received',
  'brunch.cancelled',
  'brunch.reinstated',
  'invite.email.failed',
] as const satisfies readonly NotificationTypeCode[];

export const NOTIFICATION_CHANNEL_CODES = ['in_app', 'email'] as const;
export type NotificationChannelCode = (typeof NOTIFICATION_CHANNEL_CODES)[number];

export const NOTIFICATION_LEVEL_CODES = ['all', 'big_stuff', 'muted'] as const;
export type NotificationLevelCode = (typeof NOTIFICATION_LEVEL_CODES)[number];

export function isNotificationLevelCode(value: string): value is NotificationLevelCode {
  return (NOTIFICATION_LEVEL_CODES as readonly string[]).includes(value);
}

// What "just big stuff" keeps: the brunch itself changing, and a deadline about to pass. The
// host's activity (replies, votes, suggestions) is the chatter it drops.
export const BIG_STUFF_TYPES: readonly NotificationTypeCode[] = [
  'brunch.confirmed',
  'brunch.cancelled',
  'brunch.reinstated',
  'vote.deadline.approaching',
];

// Types that ignore a person's mute: the host asked for the invitation to go out, and a muted
// brunch must not hide that it did not.
export const MUTE_PROOF_TYPES: readonly NotificationTypeCode[] = ['invite.email.failed'];

// Types an email exists for (the four emails specs 0008 and 0013 send, and the deadline reminder).
// Only these get an email switch on the preferences page.
export const EMAIL_NOTIFICATION_TYPES: readonly NotificationTypeCode[] = [
  'invite.received',
  'brunch.confirmed',
  'brunch.cancelled',
  'brunch.reinstated',
  'vote.deadline.approaching',
];

export type NotificationDefault = Readonly<Record<NotificationChannelCode, boolean>>;

// What a person gets before they have chosen anything: a missing UserNotificationPreference row
// means this. A type nothing produces is off on both channels. An email is on only where one exists.
export const NOTIFICATION_DEFAULTS: Readonly<Record<NotificationTypeCode, NotificationDefault>> = {
  'rsvp.received': { in_app: true, email: false },
  'vote.cast': { in_app: true, email: false },
  'invite.suggestion': { in_app: true, email: false },
  'location.suggested': { in_app: true, email: false },
  'time.suggested': { in_app: true, email: false },
  'brunch.confirmed': { in_app: true, email: true },
  'vote.deadline.approaching': { in_app: true, email: true },
  'invite.received': { in_app: true, email: true },
  'brunch.cancelled': { in_app: true, email: true },
  'vote.autoclose.prompted': { in_app: false, email: false },
  'running.late': { in_app: false, email: false },
  'host.transferred': { in_app: false, email: false },
  'brunch.reinstated': { in_app: true, email: true },
  'invite.email.failed': { in_app: true, email: false },
};

// A confirmed brunch becomes "completed" this long after its time (a brunch has no end time).
export const COMPLETED_AFTER_HOURS = 6;

// A voting deadline reminder goes out this long before the deadline, and not at all for a deadline
// that was set inside the window.
export const DEADLINE_REMINDER_HOURS = 24;

// Read notifications are deleted after 60 days (PLANNING §9.9); unread ones after 90 (ADR 0017).
export const NOTIFICATION_READ_RETENTION_DAYS = 60;
export const NOTIFICATION_UNREAD_RETENTION_DAYS = 90;

// The facts a row holds, by kind (the row's type code). Ids and facts only, never a token. The
// inbox words these at read time; the title and body columns are only a plain-text fallback.
export type NotificationData =
  | { readonly kind: 'rsvp.received'; readonly count: number; readonly actors: readonly string[] }
  | { readonly kind: 'vote.cast'; readonly count: number; readonly actors: readonly string[] }
  | { readonly kind: 'invite.suggestion'; readonly suggesterName: string }
  | {
      readonly kind: 'location.suggested';
      readonly suggesterName: string;
      readonly placeName: string;
    }
  | { readonly kind: 'time.suggested'; readonly suggesterName: string }
  | {
      readonly kind: 'brunch.confirmed';
      readonly hostName: string;
      readonly placeName: string;
      readonly scheduledAt: string;
      readonly timezone: string;
    }
  | { readonly kind: 'brunch.cancelled'; readonly hostName: string }
  | { readonly kind: 'brunch.reinstated'; readonly hostName: string }
  | { readonly kind: 'vote.deadline.approaching'; readonly deadline: string }
  // `inviteId` lets the inbox find the invite page for a person who has not joined yet; it is an id,
  // never the token (the page reads the token itself, for the signed-in invitee only).
  | { readonly kind: 'invite.received'; readonly hostName: string; readonly inviteId: string }
  | { readonly kind: 'invite.email.failed'; readonly email: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The named fields of a record when every one is a string.
function stringFields(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string') return undefined;
    out[key] = value;
  }
  return out;
}

// Reads the JSON a row stores, by hand (no Zod in code the browser runs). Returns undefined for
// anything that is not the shape its type says, so a bad row is skipped, not drawn half-empty.
export function readNotificationData(params: {
  readonly type: string;
  readonly data: unknown;
}): NotificationData | undefined {
  const { type, data } = params;
  if (!isRecord(data) || !isNotificationTypeCode(type)) return undefined;
  if (data['kind'] !== type) return undefined;

  switch (type) {
    case 'rsvp.received':
    case 'vote.cast': {
      const count = data['count'];
      const actors = data['actors'];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return undefined;
      if (!Array.isArray(actors) || !actors.every((actor) => typeof actor === 'string')) {
        return undefined;
      }
      return { kind: type, count, actors: actors as readonly string[] };
    }
    case 'invite.suggestion':
    case 'time.suggested': {
      const found = stringFields(data, ['suggesterName']);
      if (found === undefined) return undefined;
      return { kind: type, suggesterName: found['suggesterName'] ?? '' };
    }
    case 'location.suggested': {
      const found = stringFields(data, ['suggesterName', 'placeName']);
      if (found === undefined) return undefined;
      return {
        kind: type,
        suggesterName: found['suggesterName'] ?? '',
        placeName: found['placeName'] ?? '',
      };
    }
    case 'brunch.confirmed': {
      const found = stringFields(data, ['hostName', 'placeName', 'scheduledAt', 'timezone']);
      if (found === undefined) return undefined;
      return {
        kind: type,
        hostName: found['hostName'] ?? '',
        placeName: found['placeName'] ?? '',
        scheduledAt: found['scheduledAt'] ?? '',
        timezone: found['timezone'] ?? '',
      };
    }
    case 'brunch.cancelled':
    case 'brunch.reinstated': {
      const found = stringFields(data, ['hostName']);
      if (found === undefined) return undefined;
      return { kind: type, hostName: found['hostName'] ?? '' };
    }
    case 'invite.received': {
      const found = stringFields(data, ['hostName', 'inviteId']);
      if (found === undefined) return undefined;
      return { kind: type, hostName: found['hostName'] ?? '', inviteId: found['inviteId'] ?? '' };
    }
    case 'vote.deadline.approaching': {
      const found = stringFields(data, ['deadline']);
      if (found === undefined) return undefined;
      return { kind: type, deadline: found['deadline'] ?? '' };
    }
    case 'invite.email.failed': {
      const found = stringFields(data, ['email']);
      if (found === undefined) return undefined;
      return { kind: type, email: found['email'] ?? '' };
    }
    case 'vote.autoclose.prompted':
    case 'running.late':
    case 'host.transferred':
      return undefined;
  }
}
