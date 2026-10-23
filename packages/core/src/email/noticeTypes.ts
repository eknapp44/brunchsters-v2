import type { BrunchId } from '@brunchsters/shared';
import type { ConfirmationRecipient } from './confirmationTypes';

// What the called-off and back-on emails say about a brunch (spec 0013). `plan` is the confirmed
// place and time when the brunch had them; a brunch called off before it was confirmed has none.
export type NoticeBrunchSummary = {
  readonly brunchId: BrunchId;
  readonly title: string;
  readonly hostName: string;
  readonly plan:
    | {
        readonly placeName: string;
        readonly scheduledAt: Date;
        readonly timezone: string;
      }
    | undefined;
};

// Why a queued run ended without sending anything. These are answers, not failures: nothing is
// retried, because nothing is wrong. (A run that wakes after the host brought the brunch back, or
// after a second cancellation took over, has nothing true to say.)
export type NoticeStopReason =
  // the brunch is deleted or never existed
  | 'brunch_gone'
  // called-off notice: the brunch is no longer called off (the host brought it back inside the hold)
  | 'not_called_off'
  // called-off notice: the brunch was brought back and called off again; the newer cancellation
  // has its own run
  | 'superseded'
  // called-off notice: this cancellation was already announced (a replayed event)
  | 'already_sent'
  // back-on notice: the brunch is called off again, so there is nothing to be back on about
  | 'still_called_off'
  // back-on notice: the cancellation was never announced (it was brought back inside the hold), so
  // nobody needs correcting
  | 'no_notice_sent';

export type ResolvedNotice =
  | {
      readonly kind: 'send';
      readonly brunch: NoticeBrunchSummary;
      // identifies the cancellation; part of every idempotency key
      readonly cancelledAt: Date;
      readonly recipients: readonly ConfirmationRecipient[];
    }
  | { readonly kind: 'stop'; readonly reason: NoticeStopReason };

export type ResolveNoticeError = { readonly kind: 'db_error'; readonly cause: unknown };
