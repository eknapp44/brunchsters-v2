import type { DbClient } from '@brunchsters/database';
import type { Result } from 'neverthrow';
import type {
  ConfirmationRecipient,
  SendConfirmationEmailError,
  SendConfirmationEmailOutcome,
} from './confirmationTypes';
import type { EmailService } from './EmailService';
import { backOnEmailKey } from './emailKeys';
import type { NoticeBrunchSummary } from './noticeTypes';
import { sendToRecipient } from './sendToRecipient';
import { renderBackOnEmail } from './templates/backOnEmail';

// One recipient's "it's back on". Keyed by the cancellation it corrects, so it goes out once per
// cancellation however many times the event is replayed (spec 0013).
export function sendBackOnEmail(
  input: {
    readonly brunch: NoticeBrunchSummary;
    readonly cancelledAt: Date;
    readonly recipient: ConfirmationRecipient;
  },
  ctx: {
    readonly db: DbClient;
    readonly emailService: EmailService;
    // Absolute base URL of the web app, used to build the link.
    readonly appUrl: string;
  },
): Promise<Result<SendConfirmationEmailOutcome, SendConfirmationEmailError>> {
  const { brunch, recipient } = input;

  return sendToRecipient(
    {
      brunchId: brunch.brunchId,
      recipient,
      idempotencyKey: backOnEmailKey({
        brunchId: brunch.brunchId,
        cancelledAt: input.cancelledAt,
        recipientKey: recipient.key,
      }),
      render: (link) =>
        renderBackOnEmail({
          recipientName: recipient.name,
          hostName: brunch.hostName,
          brunchTitle: brunch.title,
          plan: brunch.plan,
          link,
        }),
    },
    ctx,
  );
}
