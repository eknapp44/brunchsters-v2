import type { DbClient } from '@brunchsters/database';
import {
  COMPLETED_AFTER_HOURS,
  DEADLINE_REMINDER_HOURS,
  NOTIFICATION_READ_RETENTION_DAYS,
  NOTIFICATION_UNREAD_RETENTION_DAYS,
  type BrunchId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { assertCanTransition } from '../brunch/guards/brunchTransitions';

// An optional `brunchId` narrows a run to one brunch: a manual tick for one brunch (and the journeys
// that drive it) must not complete or remind anyone else's.
//
// The three jobs a clock runs (spec 0015 M7, ADR 0017). Each takes `now`, so a test says what time it
// is instead of waiting for it, and each is safe to run twice: the second run finds nothing to do.

export type SchedulerError = { readonly kind: 'db_error'; readonly cause: unknown };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// A confirmed brunch is over `COMPLETED_AFTER_HOURS` after its time (a brunch has no end time), and
// from then on it is read-only. One conditional update, inside the transition table: a host calling
// it off at the same moment either moves it first (and it is no longer `confirmed`, so this skips
// it) or loses cleanly (`cancelBrunch`'s own update is conditional on the status it read). Nobody is
// told: the person saw the brunch happen.
export async function completePastBrunches(
  input: { readonly now: Date; readonly brunchId?: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<Result<{ readonly completed: number }, SchedulerError>> {
  // The table is the one place that says confirmed may become completed; fail loudly if it stops.
  const allowed = assertCanTransition({ from: 'confirmed', to: 'completed' });
  if (allowed.isErr())
    throw new Error('BRUNCH_TRANSITIONS no longer lets confirmed become completed');

  const cutoff = new Date(input.now.getTime() - COMPLETED_AFTER_HOURS * HOUR_MS);
  try {
    const [confirmed, completed] = await Promise.all([
      ctx.db.brunchStatus.findFirst({ where: { code: 'confirmed' } }),
      ctx.db.brunchStatus.findFirst({ where: { code: 'completed' } }),
    ]);
    if (confirmed === null || completed === null) {
      throw new Error('The confirmed and completed statuses are not seeded');
    }

    const moved = await ctx.db.brunch.updateMany({
      where: {
        ...(input.brunchId === undefined ? {} : { id: input.brunchId }),
        statusId: confirmed.id,
        times: { some: { isConfirmed: true, scheduledAt: { lte: cutoff } } },
      },
      data: { statusId: completed.id },
    });
    return ok({ completed: moved.count });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

export type DueReminder = { readonly brunchId: BrunchId; readonly deadline: Date };

// Brunches whose voting closes within the next `DEADLINE_REMINDER_HOURS`, claimed so that each
// deadline is handed out exactly once. A brunch is due when it is still open for voting, its
// deadline is ahead and inside the window, and the deadline was set more than a window ago (a host who
// sets one for tomorrow morning at nine tonight does not nag anyone an hour later). The claim is a
// conditional update on `deadlineReminderSentFor`: a second cron run, or two at once, gets nothing,
// and a moved deadline is a different value and is due again. The reminders go out after the claim,
// so a crash in between loses one reminder rather than sending two (the queue retries the sending
// steps of a run that is still alive).
export async function claimDeadlineReminders(
  input: { readonly now: Date; readonly brunchId?: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<Result<readonly DueReminder[], SchedulerError>> {
  const windowMs = DEADLINE_REMINDER_HOURS * HOUR_MS;
  try {
    const candidates = await ctx.db.brunch.findMany({
      where: {
        ...(input.brunchId === undefined ? {} : { id: input.brunchId }),
        status: { code: 'active' },
        votingClosedAt: null,
        votingDeadline: { gt: input.now, lte: new Date(input.now.getTime() + windowMs) },
      },
      select: {
        id: true,
        votingDeadline: true,
        votingDeadlineSetAt: true,
        deadlineReminderSentFor: true,
      },
    });

    const due: DueReminder[] = [];
    for (const brunch of candidates) {
      const deadline = brunch.votingDeadline;
      if (deadline === null) continue;
      // Set long ago (or before the column existed, when it is null): the deadline is old news.
      const setInsideWindow =
        brunch.votingDeadlineSetAt !== null &&
        deadline.getTime() - brunch.votingDeadlineSetAt.getTime() < windowMs;
      if (setInsideWindow) continue;
      if (brunch.deadlineReminderSentFor?.getTime() === deadline.getTime()) continue;

      const claimed = await ctx.db.brunch.updateMany({
        where: {
          id: brunch.id,
          votingDeadline: deadline,
          OR: [{ deadlineReminderSentFor: null }, { deadlineReminderSentFor: { not: deadline } }],
        },
        data: { deadlineReminderSentFor: deadline },
      });
      if (claimed.count === 1) due.push({ brunchId: brunch.id as BrunchId, deadline });
    }
    return ok(due);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

// Notifications are an ephemeral view of events that live elsewhere (ADR 0017): a hard delete. A
// read row goes 60 days after it was read, an unread one 90 days after its last event (not its
// first: a row that keeps coalescing new activity is alive). Both cut-offs are exclusive, so a row
// exactly on the line stays one more day.
export async function pruneNotifications(
  input: { readonly now: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<{ readonly deleted: number }, SchedulerError>> {
  const readCutoff = new Date(input.now.getTime() - NOTIFICATION_READ_RETENTION_DAYS * DAY_MS);
  const unreadCutoff = new Date(input.now.getTime() - NOTIFICATION_UNREAD_RETENTION_DAYS * DAY_MS);
  try {
    const { count } = await ctx.db.notification.deleteMany({
      where: {
        OR: [{ readAt: { lt: readCutoff } }, { readAt: null, lastEventAt: { lt: unreadCutoff } }],
      },
    });
    return ok({ deleted: count });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
