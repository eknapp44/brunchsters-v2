import type { DbClient } from '@brunchsters/database';
import type { Result } from 'neverthrow';
import type {
  ConfirmationRecipient,
  ConfirmedBrunchSummary,
  SendConfirmationEmailError,
  SendConfirmationEmailOutcome,
} from './confirmationTypes';
import type { EmailService } from './EmailService';
import { confirmedEmailKey } from './emailKeys';
import { sendToRecipient } from './sendToRecipient';
import { renderConfirmedEmail } from './templates/confirmedEmail';

// One recipient's confirmation. The shared sending rules (skips are outcomes, not errors) are in
// sendToRecipient.
export function sendConfirmationEmail(
  input: {
    readonly brunch: ConfirmedBrunchSummary;
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
      idempotencyKey: confirmedEmailKey({
        brunchId: brunch.brunchId,
        recipientKey: recipient.key,
      }),
      type: 'brunch.confirmed',
      render: ({ link, muteUrl, settingsUrl }) =>
        renderConfirmedEmail({
          recipientName: recipient.name,
          hostName: brunch.hostName,
          brunchTitle: brunch.title,
          placeName: brunch.placeName,
          placeAddress: brunch.placeAddress,
          placeUrl: brunch.placeUrl,
          scheduledAt: brunch.scheduledAt,
          timezone: brunch.timezone,
          link,
          muteUrl,
          settingsUrl,
        }),
    },
    ctx,
  );
}
