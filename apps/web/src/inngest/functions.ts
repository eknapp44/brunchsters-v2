import {
  resolveConfirmationRecipients,
  sendConfirmationEmail,
  sendInviteEmail,
} from '@brunchsters/core';
import type { BrunchId, Email, InviteId } from '@brunchsters/shared';
import { NonRetriableError } from 'inngest';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAppUrl, getEmailService } from '@/lib/services';
import { inngest } from './client';
import { unwrapForQueue } from './unwrapForQueue';

const MAX_CONCURRENT_INVITE_EMAILS = 5;

// Event payloads carry ids only. Validating them here means a malformed event fails once,
// permanently, instead of being retried against a handler that can never succeed.
const inviteEventSchema = z.object({ inviteId: z.uuid() });
const brunchEventSchema = z.object({ brunchId: z.uuid() });

function parseEventData<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new NonRetriableError(`Malformed event payload: ${parsed.error.message}`);
  }
  return parsed.data;
}

// The invite email, on first send and on resend. The handler re-reads the invite, so a
// revoked, expired or re-tokened invite is handled there, not here.
export const sendInviteEmailFunction = inngest.createFunction(
  {
    id: 'send-invite-email',
    triggers: [{ event: 'invite/sent' }, { event: 'invite/resent' }],
    // A host can invite 50 people in one request, which queues 50 runs at once. Without a
    // limit they all call back into the app together, each opening a database connection
    // and a request to the email provider; a few at a time is plenty for an email.
    concurrency: MAX_CONCURRENT_INVITE_EMAILS,
  },
  async ({ event, step }) => {
    const { inviteId } = parseEventData(inviteEventSchema, event.data);

    return step.run('send-invite-email', async () =>
      unwrapForQueue(
        await sendInviteEmail(
          { inviteId: inviteId as InviteId },
          { db, emailService: getEmailService(), appUrl: getAppUrl() },
        ),
        'send-invite-email',
      ),
    );
  },
);

// One email per recipient, each its own step: when the provider fails for one person,
// only that email is retried, and the people already emailed are not emailed again.
export const sendBrunchConfirmedEmailsFunction = inngest.createFunction(
  {
    id: 'send-brunch-confirmed-emails',
    triggers: [{ event: 'brunch/confirmed' }],
  },
  async ({ event, step }) => {
    const { brunchId } = parseEventData(brunchEventSchema, event.data);

    // Step output is stored as JSON, so the time travels as an ISO string.
    const plan = await step.run('resolve-recipients', async () => {
      const { brunch, recipients } = unwrapForQueue(
        await resolveConfirmationRecipients(
          { brunchId: brunchId as BrunchId },
          { db, appUrl: getAppUrl() },
        ),
        'resolve-recipients',
      );
      return { brunch: { ...brunch, scheduledAt: brunch.scheduledAt.toISOString() }, recipients };
    });

    const brunch = {
      ...plan.brunch,
      brunchId: brunchId as BrunchId,
      scheduledAt: new Date(plan.brunch.scheduledAt),
    };
    for (const recipient of plan.recipients) {
      await step.run(`email-${recipient.key}`, async () =>
        unwrapForQueue(
          await sendConfirmationEmail(
            {
              brunch,
              recipient: {
                key: recipient.key,
                email: recipient.email as Email,
                name: recipient.name,
                link: recipient.link,
              },
            },
            { emailService: getEmailService() },
          ),
          `email-${recipient.key}`,
        ),
      );
    }

    return { emailed: plan.recipients.length };
  },
);

export const functions = [sendInviteEmailFunction, sendBrunchConfirmedEmailsFunction];
