import type { DbClient } from '@brunchsters/database';
import type { Result } from 'neverthrow';
import type {
  ConfirmationRecipient,
  SendConfirmationEmailError,
  SendConfirmationEmailOutcome,
} from './confirmationTypes';
import type { EmailService } from './EmailService';
import { cancelledEmailKey } from './emailKeys';
import type { NoticeBrunchSummary } from './noticeTypes';
import { sendToRecipient } from './sendToRecipient';
import { renderCancelledEmail } from './templates/cancelledEmail';

// One recipient's called-off notice. The key carries the cancellation's moment, so a retry sends
// nothing new and a second cancellation of the same brunch does tell people (spec 0013).
export function sendCancelledEmail(
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
      idempotencyKey: cancelledEmailKey({
        brunchId: brunch.brunchId,
        cancelledAt: input.cancelledAt,
        recipientKey: recipient.key,
      }),
      type: 'brunch.cancelled',
      render: ({ link, muteUrl, settingsUrl }) =>
        renderCancelledEmail({
          recipientName: recipient.name,
          hostName: brunch.hostName,
          brunchTitle: brunch.title,
          plan: brunch.plan,
          link,
          muteUrl,
          settingsUrl,
        }),
    },
    ctx,
  );
}
