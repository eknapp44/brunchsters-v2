import {
  markCancelNoticeSent,
  pruneRateLimitBuckets,
  resolveBackOnNotice,
  resolveCancelNotice,
  resolveConfirmationRecipients,
  sendBackOnEmail,
  sendCancelledEmail,
  sendConfirmationEmail,
  sendInviteEmail,
  type ConfirmationRecipient,
  type NoticeBrunchSummary,
} from '@brunchsters/core';
import {
  CANCEL_NOTICE_HOLD_SECONDS,
  type BrunchId,
  type Email,
  type InviteId,
} from '@brunchsters/shared';
import { NonRetriableError } from 'inngest';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAppUrl, getEmailService } from '@/lib/services';
import { inngest } from './client';
import {
  BACK_ON_EMAIL_EVENTS,
  CANCELLED_EMAIL_EVENTS,
  CONFIRMED_EMAIL_EVENTS,
  INVITE_EMAIL_EVENTS,
  PRUNE_RATE_LIMITS_CRON,
} from './events';
import { unwrapForQueue } from './unwrapForQueue';

const MAX_CONCURRENT_INVITE_EMAILS = 5;

// Event payloads carry ids only. Validating them here means a malformed event fails once,
// permanently, instead of being retried against a handler that can never succeed.
const inviteEventSchema = z.object({ inviteId: z.uuid() });
const brunchEventSchema = z.object({ brunchId: z.uuid() });
const cancelledEventSchema = z.object({ brunchId: z.uuid(), cancelledAt: z.iso.datetime() });

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

// Step output is stored by Inngest as JSON, so a time travels as a string and a missing value is a
// missing key (the shapes below are what a step hands back, not what core returns).
type StepNoticeBrunch = {
  readonly brunchId: BrunchId;
  readonly title: string;
  readonly hostName: string;
  readonly plan?: {
    readonly placeName: string;
    readonly scheduledAt: string;
    readonly timezone: string;
  };
};

function toStepBrunch(brunch: NoticeBrunchSummary): StepNoticeBrunch {
  return {
    brunchId: brunch.brunchId,
    title: brunch.title,
    hostName: brunch.hostName,
    ...(brunch.plan === undefined
      ? {}
      : { plan: { ...brunch.plan, scheduledAt: brunch.plan.scheduledAt.toISOString() } }),
  };
}

function fromStepBrunch(brunch: StepNoticeBrunch): NoticeBrunchSummary {
  return {
    brunchId: brunch.brunchId,
    title: brunch.title,
    hostName: brunch.hostName,
    plan:
      brunch.plan === undefined
        ? undefined
        : { ...brunch.plan, scheduledAt: new Date(brunch.plan.scheduledAt) },
  };
}

type StepRecipient = {
  readonly key: string;
  readonly email: string;
  readonly name?: string;
  readonly destination:
    | { readonly kind: 'brunch' }
    | { readonly kind: 'invite'; readonly inviteId: string };
};

// A recipient as the queue stores it: only the invite's id, never a token (ADR 0009).
function toRecipient(recipient: StepRecipient): ConfirmationRecipient {
  return {
    key: recipient.key,
    email: recipient.email as Email,
    name: recipient.name,
    destination:
      recipient.destination.kind === 'invite'
        ? { kind: 'invite', inviteId: recipient.destination.inviteId as InviteId }
        : { kind: 'brunch' },
  };
}

// "Sam called it off" (spec 0013, ADR 0015). The host can change their mind, so nothing is said
// for a hold after the cancellation: the function sleeps until `cancelledAt` plus the hold (a
// moment fixed by the event, so a retry or replay never waits longer), then reads the brunch again
// and speaks only if THIS cancellation still stands. Bringing it back inside the hold, or calling
// it off a second time, ends this run without a word. It claims the notice before sending, so a
// bring-back that arrives while the emails go out still knows people were told. One email per
// recipient, each its own step: a failure retries only that person.
export const sendBrunchCancelledEmailsFunction = inngest.createFunction(
  {
    id: 'send-brunch-cancelled-emails',
    triggers: CANCELLED_EMAIL_EVENTS.map((event) => ({ event })),
  },
  async ({ event, step }) => {
    const data = parseEventData({ schema: cancelledEventSchema, data: event.data });
    const brunchId = data.brunchId as BrunchId;
    const cancelledAt = new Date(data.cancelledAt);

    await step.sleepUntil(
      'hold-for-bring-back',
      new Date(cancelledAt.getTime() + CANCEL_NOTICE_HOLD_SECONDS * 1000),
    );

    const plan = await step.run('resolve-recipients', async () => {
      const resolved = unwrapForQueue({
        result: await resolveCancelNotice({ brunchId, cancelledAt }, { db }),
        step: 'resolve-recipients',
      });
      if (resolved.kind === 'stop') return resolved;
      return {
        kind: 'send' as const,
        brunch: toStepBrunch(resolved.brunch),
        recipients: resolved.recipients,
      };
    });
    if (plan.kind === 'stop') return { recipients: 0, stopped: plan.reason };

    const claimed = await step.run('claim-notice', async () =>
      unwrapForQueue({
        result: await markCancelNoticeSent({ brunchId, cancelledAt }, { db }),
        step: 'claim-notice',
      }),
    );
    if (!claimed.marked) return { recipients: 0, stopped: 'superseded' };

    const brunch = fromStepBrunch(plan.brunch);
    const outcomes: Record<string, string> = {};
    for (const recipient of plan.recipients) {
      const stepName = `email-${recipient.key}`;
      outcomes[recipient.key] = await step.run(stepName, async () =>
        unwrapForQueue({
          result: await sendCancelledEmail(
            { brunch, cancelledAt, recipient: toRecipient(recipient) },
            { db, emailService: getEmailService(), appUrl: getAppUrl() },
          ),
          step: stepName,
        }),
      );
    }

    return { recipients: plan.recipients.length, outcomes };
  },
);

// "It's back on" (spec 0013): sent only to people who were told it was off. The decision is made by
// reading the brunch (`resolveBackOnNotice`), not carried by the event, so a bring-back inside the
// hold, a second cancellation, or a deleted brunch all end here quietly.
export const sendBrunchBackOnEmailsFunction = inngest.createFunction(
  {
    id: 'send-brunch-back-on-emails',
    triggers: BACK_ON_EMAIL_EVENTS.map((event) => ({ event })),
  },
  async ({ event, step }) => {
    const brunchId = parseEventData({ schema: brunchEventSchema, data: event.data })
      .brunchId as BrunchId;

    const plan = await step.run('resolve-recipients', async () => {
      const resolved = unwrapForQueue({
        result: await resolveBackOnNotice({ brunchId }, { db }),
        step: 'resolve-recipients',
      });
      if (resolved.kind === 'stop') return resolved;
      return {
        kind: 'send' as const,
        brunch: toStepBrunch(resolved.brunch),
        cancelledAt: resolved.cancelledAt.toISOString(),
        recipients: resolved.recipients,
      };
    });
    if (plan.kind === 'stop') return { recipients: 0, stopped: plan.reason };

    const brunch = fromStepBrunch(plan.brunch);
    const cancelledAt = new Date(plan.cancelledAt);
    const outcomes: Record<string, string> = {};
    for (const recipient of plan.recipients) {
      const stepName = `email-${recipient.key}`;
      outcomes[recipient.key] = await step.run(stepName, async () =>
        unwrapForQueue({
          result: await sendBackOnEmail(
            { brunch, cancelledAt, recipient: toRecipient(recipient) },
            { db, emailService: getEmailService(), appUrl: getAppUrl() },
          ),
          step: stepName,
        }),
      );
    }

    return { recipients: plan.recipients.length, outcomes };
  },
);

// Rate-limit counters are operational data with a two-day retention (ADR 0013). Daily, at an hour
// nobody is planning brunch. A failure throws so Inngest retries it; nothing depends on it running
// at an exact time, because a limiter only ever reads the current window.
export const pruneRateLimitsFunction = inngest.createFunction(
  { id: 'prune-rate-limits', triggers: [{ cron: PRUNE_RATE_LIMITS_CRON }] },
  async ({ step }) =>
    step.run('prune-rate-limit-buckets', async () => {
      const result = await pruneRateLimitBuckets({ now: new Date() }, { db });
      if (result.isErr()) {
        throw new Error('Pruning rate-limit counters failed', { cause: result.error.cause });
      }
      return result.value;
    }),
);

export const functions = [
  sendInviteEmailFunction,
  sendBrunchConfirmedEmailsFunction,
  sendBrunchCancelledEmailsFunction,
  sendBrunchBackOnEmailsFunction,
  pruneRateLimitsFunction,
];
