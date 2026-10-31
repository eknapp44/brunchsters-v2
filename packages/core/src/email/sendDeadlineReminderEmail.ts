import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import type { Result } from 'neverthrow';
import type {
  ConfirmationRecipient,
  SendConfirmationEmailError,
  SendConfirmationEmailOutcome,
} from './confirmationTypes';
import type { EmailService } from './EmailService';
import { deadlineReminderEmailKey } from './emailKeys';
import { sendToRecipient } from './sendToRecipient';
import { renderDeadlineReminderEmail } from './templates/deadlineReminderEmail';

// "About 5 hours", "about an hour", "less than an hour": how long until voting closes, in words.
export function describeTimeLeft(params: { readonly now: Date; readonly deadline: Date }): string {
  const minutes = Math.max(
    0,
    Math.round((params.deadline.getTime() - params.now.getTime()) / 60_000),
  );
  if (minutes < 60) return 'less than an hour';
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

// One person's "last call to vote". Keyed by the deadline it is about, so it goes out once per
// deadline however many times a run is retried, and again if the host moves the deadline.
export function sendDeadlineReminderEmail(
  input: {
    readonly brunchId: BrunchId;
    readonly brunchTitle: string;
    readonly deadline: Date;
    readonly now: Date;
    readonly recipient: ConfirmationRecipient;
  },
  ctx: { readonly db: DbClient; readonly emailService: EmailService; readonly appUrl: string },
): Promise<Result<SendConfirmationEmailOutcome, SendConfirmationEmailError>> {
  const { recipient } = input;

  return sendToRecipient(
    {
      brunchId: input.brunchId,
      recipient,
      idempotencyKey: deadlineReminderEmailKey({
        brunchId: input.brunchId,
        deadline: input.deadline,
        recipientKey: recipient.key,
      }),
      type: 'vote.deadline.approaching',
      render: ({ link, muteUrl, settingsUrl }) =>
        renderDeadlineReminderEmail({
          recipientName: recipient.name,
          brunchTitle: input.brunchTitle,
          closesIn: describeTimeLeft({ now: input.now, deadline: input.deadline }),
          link,
          muteUrl,
          settingsUrl,
        }),
    },
    ctx,
  );
}
