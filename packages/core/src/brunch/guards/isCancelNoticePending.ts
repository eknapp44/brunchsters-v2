import { CANCEL_NOTICE_GRACE_SECONDS, CANCEL_NOTICE_HOLD_SECONDS } from '@brunchsters/shared';

// Whether a called-off brunch's guests may still be waiting to be told (spec 0013, ADR 0015). The
// notice waits out a hold in the queue and then marks itself sent, so until it has, deleting the
// brunch would leave the guests never knowing it was off. If the notice never goes out (the queue
// was down) the wait ends by itself a grace period after the hold, so a host is never trapped. A
// brunch called off without a recorded moment (not through cancelBrunch) has no notice to wait
// for. One rule, shared by `deleteBrunch` and by the screen that offers Delete, so they cannot
// disagree. Pure: `now` is a parameter.
export function isCancelNoticePending(params: {
  readonly statusCode: string;
  readonly cancelledAt: Date | null;
  readonly cancelNoticeSentAt: Date | null;
  readonly now: Date;
}): boolean {
  if (params.statusCode !== 'cancelled') return false;
  if (params.cancelNoticeSentAt !== null) return false;
  if (params.cancelledAt === null) return false;

  const giveUpAt =
    params.cancelledAt.getTime() +
    (CANCEL_NOTICE_HOLD_SECONDS + CANCEL_NOTICE_GRACE_SECONDS) * 1000;
  return params.now.getTime() < giveUpAt;
}
