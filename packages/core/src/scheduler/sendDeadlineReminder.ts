import type { DbClient } from '@brunchsters/database';
import { normalizeEmail, type BrunchId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EmailService } from '../email/EmailService';
import type { SendConfirmationEmailError } from '../email/confirmationTypes';
import { sendDeadlineReminderEmail } from '../email/sendDeadlineReminderEmail';
import { deliverInApp, type NotifyError } from '../notification/deliverInApp';
import { loadBrunchMembers } from '../notification/loadBrunchMembers';
import { recipientsFor } from '../notification/recipientsFor';

export type SendDeadlineReminderError =
  | NotifyError
  | SendConfirmationEmailError
  | { readonly kind: 'db_error'; readonly cause: unknown };

// One brunch's "last call to vote" for one deadline (spec 0015 M7), after the scheduler claimed it:
// an inbox row and an email for each member who can vote and has not. Each person's own choices
// apply (`shouldDeliver` for the row, `emailAllowed` inside the sender), and a voter, a person who
// answered no and a brunch that is no longer open for voting get nothing. Rows are keyed by the
// deadline and so are the emails, so a retried run sends nothing twice.
export async function sendDeadlineReminder(
  input: { readonly brunchId: BrunchId; readonly deadline: Date; readonly now: Date },
  ctx: { readonly db: DbClient; readonly emailService: EmailService; readonly appUrl: string },
): Promise<Result<{ readonly rows: number; readonly emails: number }, SendDeadlineReminderError>> {
  try {
    const loaded = await loadBrunchMembers({ brunchId: input.brunchId }, ctx);
    if (loaded === undefined || loaded.statusCode !== 'active') return ok({ rows: 0, emails: 0 });

    // A voter, or someone who answered no, is not "waiting to vote": `recipientsFor` is the table.
    const userIds = recipientsFor({
      type: 'vote.deadline.approaching',
      hostId: loaded.host.id,
      members: loaded.members.filter((member) => !member.hasDeclined),
    });
    if (userIds.length === 0) return ok({ rows: 0, emails: 0 });

    const rows = await deliverInApp(
      {
        userIds,
        type: 'vote.deadline.approaching',
        brunchId: input.brunchId,
        row: {
          title: 'Last call to vote',
          body: `${loaded.title} closes soon, and you haven't voted yet.`,
          data: { kind: 'vote.deadline.approaching', deadline: input.deadline.toISOString() },
          dedupeKey: `deadline:${input.brunchId}:${input.deadline.getTime()}`,
        },
        now: input.now,
      },
      ctx,
    );
    if (rows.isErr()) return err(rows.error);

    const users = await ctx.db.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, email: true },
    });

    let emails = 0;
    // Everyone is tried even when one send fails: the deadline was claimed before this ran, so a
    // person after a failing one must not wait on a retry that may never come. The first failure is
    // returned at the end (the queue retries the step; the emails already sent carry the same key, so
    // the provider drops a repeat).
    let firstFailure: SendConfirmationEmailError | undefined;
    for (const user of users) {
      const sent = await sendDeadlineReminderEmail(
        {
          brunchId: input.brunchId,
          brunchTitle: loaded.title,
          deadline: input.deadline,
          now: input.now,
          recipient: {
            key: user.id,
            email: normalizeEmail(user.email),
            name: user.name,
            destination: { kind: 'brunch' },
          },
        },
        ctx,
      );
      if (sent.isErr()) {
        firstFailure ??= sent.error;
        continue;
      }
      if (sent.value === 'sent') emails += 1;
    }
    if (firstFailure !== undefined) return err(firstFailure);

    return ok({ rows: rows.value.written, emails });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
