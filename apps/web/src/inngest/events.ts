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

// Not an event: a schedule (04:00 UTC daily) for the job that deletes expired rate-limit counters.
export const PRUNE_RATE_LIMITS_CRON = '0 4 * * *';

export const QUEUED_EVENTS: ReadonlySet<BrunchEventName> = new Set<BrunchEventName>([
  ...INVITE_EMAIL_EVENTS,
  ...CONFIRMED_EMAIL_EVENTS,
]);
