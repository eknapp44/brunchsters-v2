// Event names from PLANNING.md §10 — payloads will be typed when Inngest is wired
export type BrunchEventName =
  | 'brunch/created'
  | 'brunch/confirmed'
  | 'brunch/cancelled'
  | 'invite/sent'
  | 'invite/resent'
  | 'invite/expired'
  | 'attendee/rsvp.received'
  | 'attendee/rsvp.changed'
  | 'vote/cast'
  | 'vote/changed'
  | 'vote/deadline.approaching'
  | 'vote/deadline.reached'
  | 'notification/email.send';

export interface EventBus {
  emit(eventName: BrunchEventName, data: Record<string, unknown>): Promise<void>;
}
