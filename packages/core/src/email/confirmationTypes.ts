import type { BrunchId, Email, InviteId } from '@brunchsters/shared';
import type { EmailSendFailure } from './EmailService';

// Where a recipient's link points. An invite-page link carries the invite's bearer token, and
// recipients are stored as queue step output, so only the invite's id travels and the token is
// read from the database when the email is sent (ADR 0009: queue state holds ids, never secrets).
export type ConfirmationDestination =
  | { readonly kind: 'brunch' }
  | { readonly kind: 'invite'; readonly inviteId: InviteId };

export type ConfirmationRecipient = {
  // Stable per person for this brunch: part of the idempotency key and the queue step name.
  readonly key: string;
  readonly email: Email;
  readonly name: string | undefined;
  readonly destination: ConfirmationDestination;
};

export type ConfirmedBrunchSummary = {
  readonly brunchId: BrunchId;
  readonly title: string;
  readonly hostName: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly placeUrl: string;
  readonly timezone: string;
  readonly scheduledAt: Date;
};

export type ResolveConfirmationRecipientsError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'not_confirmed' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

// A permanently rejected address (`skipped_invalid_address`) is an outcome, not an error: it must
// not end the run and strand everyone after that person in the list.
export type SendConfirmationEmailOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'skipped_invite_gone'
  | 'skipped_invalid_address'
  // The person's own choice (a switched-off email, a muted brunch). Silent on purpose: it is never
  // reported to the host, who must not learn who opted out (spec 0015, ADR 0017).
  | 'skipped_by_preference';

export type SendConfirmationEmailError =
  | Exclude<EmailSendFailure, { readonly kind: 'invalid_address' }>
  | { readonly kind: 'db_error'; readonly cause: unknown };
