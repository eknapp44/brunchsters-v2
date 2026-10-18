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
import { CONFIRMED_EMAIL_EVENTS, INVITE_EMAIL_EVENTS } from './events';
import { unwrapForQueue } from './unwrapForQueue';

const MAX_CONCURRENT_INVITE_EMAILS = 5;

// Event payloads carry ids only. Validating them here means a malformed event fails once,
// permanently, instead of being retried against a handler that can never succeed.
const inviteEventSchema = z.object({ inviteId: z.uuid() });
const brunchEventSchema = z.object({ brunchId: z.uuid() });

function parseEventData<T>(params: { readonly schema: z.ZodType<T>; readonly data: unknown }): T {
  const parsed = params.schema.safeParse(params.data);
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
    triggers: INVITE_EMAIL_EVENTS.map((event) => ({ event })),
    // A host can invite 50 people in one request, which queues 50 runs at once. Without a
    // limit they all call back into the app together, each opening a database connection
    // and a request to the email provider; a few at a time is plenty for an email.
    concurrency: MAX_CONCURRENT_INVITE_EMAILS,
  },
  async ({ event, step }) => {
    const { inviteId } = parseEventData({ schema: inviteEventSchema, data: event.data });

    return step.run('send-invite-email', async () =>
      unwrapForQueue({
        result: await sendInviteEmail(
          { inviteId: inviteId as InviteId },
          { db, emailService: getEmailService(), appUrl: getAppUrl() },
        ),
        step: 'send-invite-email',
      }),
    );
  },
);

// One email per recipient, each its own step: when the provider fails for one person,
// only that email is retried, and the people already emailed are not emailed again.
export const sendBrunchConfirmedEmailsFunction = inngest.createFunction(
  {
    id: 'send-brunch-confirmed-emails',
    triggers: CONFIRMED_EMAIL_EVENTS.map((event) => ({ event })),
  },
  async ({ event, step }) => {
    const { brunchId } = parseEventData({ schema: brunchEventSchema, data: event.data });

    // Step output is stored by Inngest as JSON, so the time travels as an ISO string, and it holds
    // ids, never an invite token: each recipient's step reads the token itself when it sends.
    const plan = await step.run('resolve-recipients', async () => {
      const { brunch, recipients } = unwrapForQueue({
        result: await resolveConfirmationRecipients({ brunchId: brunchId as BrunchId }, { db }),
        step: 'resolve-recipients',
      });
      return { brunch: { ...brunch, scheduledAt: brunch.scheduledAt.toISOString() }, recipients };
    });

    const brunch = {
      ...plan.brunch,
      brunchId: brunchId as BrunchId,
      scheduledAt: new Date(plan.brunch.scheduledAt),
    };
    const outcomes: Record<string, string> = {};
    for (const recipient of plan.recipients) {
      const stepName = `email-${recipient.key}`;
      outcomes[recipient.key] = await step.run(stepName, async () =>
        unwrapForQueue({
          result: await sendConfirmationEmail(
            {
              brunch,
              recipient: {
                key: recipient.key,
                email: recipient.email as Email,
                name: recipient.name,
                destination:
                  recipient.destination.kind === 'invite'
                    ? { kind: 'invite', inviteId: recipient.destination.inviteId as InviteId }
                    : { kind: 'brunch' },
              },
            },
            { db, emailService: getEmailService(), appUrl: getAppUrl() },
          ),
          step: stepName,
        }),
      );
    }

    return { recipients: plan.recipients.length, outcomes };
  },
);

export const functions = [sendInviteEmailFunction, sendBrunchConfirmedEmailsFunction];
