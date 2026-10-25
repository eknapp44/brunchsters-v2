import type { BrunchEventName } from '@brunchsters/core';

// The events some function actually handles. Functions subscribe through these lists and the
// event bus sends only what is in QUEUED_EVENTS, so an event with no handler (votes, RSVPs,
// brunch created) costs no network round trip in the request and no queue usage. A spec that
// adds a handler for another event adds it here, and it starts flowing.
export const INVITE_EMAIL_EVENTS = [
  'invite/sent',
  'invite/resent',
] as const satisfies readonly BrunchEventName[];

export const CONFIRMED_EMAIL_EVENTS = [
  'brunch/confirmed',
] as const satisfies readonly BrunchEventName[];

// Spec 0013: the host called a brunch off, and brought one back. The first waits out a hold before
// it says anything (functions.ts); the second only speaks if the first did.
export const CANCELLED_EMAIL_EVENTS = [
  'brunch/cancelled',
] as const satisfies readonly BrunchEventName[];

export const BACK_ON_EMAIL_EVENTS = [
  'brunch/reinstated',
] as const satisfies readonly BrunchEventName[];

// Spec 0015 (ADR 0017): events that write in-app notification rows. Not email events (the guard in
// emailBudgets.test.ts reads only the *_EMAIL_EVENTS lists), and no email goes out from these. The
// called-off and back-on rows are written inside the two email functions above, after the same
// hold-and-recheck that decides whether anyone is told.
export const HOST_NOTIFICATION_EVENTS = [
  'attendee/rsvp.received',
  'attendee/rsvp.changed',
  'vote/cast',
  'vote/changed',
  'suggestion/invite',
  'suggestion/location',
  'suggestion/time',
] as const satisfies readonly BrunchEventName[];

export const CONFIRMED_NOTIFICATION_EVENTS = [
  'brunch/confirmed',
] as const satisfies readonly BrunchEventName[];

export const INVITED_NOTIFICATION_EVENTS = [
  'invite/sent',
] as const satisfies readonly BrunchEventName[];

// Not an event: a schedule (04:00 UTC daily) for the job that deletes expired rate-limit counters.
export const PRUNE_RATE_LIMITS_CRON = '0 4 * * *';

export const QUEUED_EVENTS: ReadonlySet<BrunchEventName> = new Set<BrunchEventName>([
  ...INVITE_EMAIL_EVENTS,
  ...CONFIRMED_EMAIL_EVENTS,
  ...CANCELLED_EMAIL_EVENTS,
  ...BACK_ON_EMAIL_EVENTS,
  ...HOST_NOTIFICATION_EVENTS,
  ...CONFIRMED_NOTIFICATION_EVENTS,
  ...INVITED_NOTIFICATION_EVENTS,
]);
