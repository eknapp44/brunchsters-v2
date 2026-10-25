import type { DbClient } from '@brunchsters/database';
import {
  formatPersonName,
  type BrunchId,
  type NotificationData,
  type NotificationTypeCode,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { coalesceNotification } from './coalesceNotification';
import { deliverInApp, type NotifyError } from './deliverInApp';
import { recipientsFor } from './recipientsFor';
import { shouldDeliver } from './shouldDeliver';
import type { CoalescedType } from './notificationTypes';

// What the host hears about their brunch (spec 0015, ADR 0017). Each function runs from a queued
// event, reads what it needs from the database, and writes in-app rows only: the host's activity
// has no email. The person who did the thing is never told about it.

type ActivityInput = {
  readonly brunchId: BrunchId;
  // The person who replied or voted.
  readonly actorId: UserId;
  readonly now?: Date;
};

// One row per brunch for replies and one for votes, counted by person (coalesceNotification).
async function notifyHostOfActivity(
  input: ActivityInput & { readonly type: CoalescedType; readonly title: string },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  try {
    const brunch = await ctx.db.brunch.findFirst({
      where: { id: input.brunchId },
      select: { hostId: true, title: true },
    });
    if (brunch === null) return ok({ written: 0 });

    const recipients = recipientsFor({
      type: input.type,
      hostId: brunch.hostId as UserId,
      members: [],
      actorId: input.actorId,
    });

    let written = 0;
    for (const userId of recipients) {
      const wanted = await shouldDeliver(
        { userId, type: input.type, channel: 'in_app', brunchId: input.brunchId },
        ctx,
      );
      if (wanted.isErr()) return err(wanted.error);
      if (!wanted.value) continue;

      const result = await coalesceNotification(
        {
          userId,
          type: input.type,
          brunchId: input.brunchId,
          actorId: input.actorId,
          title: input.title,
          // No count in the fallback: the count moves after the row is written.
          body: brunch.title,
          ...(input.now === undefined ? {} : { now: input.now }),
        },
        ctx,
      );
      if (result.isErr()) return err(result.error);
      written += 1;
    }
    return ok({ written });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

export function notifyHostOfReply(input: ActivityInput, ctx: { readonly db: DbClient }) {
  return notifyHostOfActivity({ ...input, type: 'rsvp.received', title: 'New replies' }, ctx);
}

export function notifyHostOfVote(input: ActivityInput, ctx: { readonly db: DbClient }) {
  return notifyHostOfActivity({ ...input, type: 'vote.cast', title: 'New votes' }, ctx);
}

export type SuggestionKind = 'invite' | 'location' | 'time';

const SUGGESTION_TYPES: Readonly<Record<SuggestionKind, NotificationTypeCode>> = {
  invite: 'invite.suggestion',
  location: 'location.suggested',
  time: 'time.suggested',
};

// One row per suggestion, while it is still waiting for the host: a host who reviewed it before
// this ran, or a brunch since deleted, gets nothing. The host sees the full name (ADR 0012), like
// the "suggested by" line on the manage page.
export async function notifyHostOfSuggestion(
  input: {
    readonly kind: SuggestionKind;
    readonly suggestionId: string;
    readonly now?: Date;
  },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  try {
    const suggestion = await loadPendingSuggestion(input, ctx);
    if (suggestion === undefined) return ok({ written: 0 });

    const brunch = await ctx.db.brunch.findFirst({
      where: { id: suggestion.brunchId },
      select: { hostId: true, title: true },
    });
    if (brunch === null) return ok({ written: 0 });

    const type = SUGGESTION_TYPES[input.kind];
    const recipients = recipientsFor({
      type,
      hostId: brunch.hostId as UserId,
      members: [],
      actorId: suggestion.suggestedById,
    });

    const suggesterName = formatPersonName({
      fullName: suggestion.suggesterName,
      audience: 'host',
    });
    const data: NotificationData =
      input.kind === 'location'
        ? { kind: 'location.suggested', suggesterName, placeName: suggestion.placeName ?? '' }
        : input.kind === 'time'
          ? { kind: 'time.suggested', suggesterName }
          : { kind: 'invite.suggestion', suggesterName };

    return await deliverInApp(
      {
        userIds: recipients,
        type,
        brunchId: suggestion.brunchId,
        row: {
          title: 'Something to look at',
          body: `${suggesterName} made a suggestion for ${brunch.title}.`,
          data,
          dedupeKey: `suggestion:${input.kind}:${input.suggestionId}`,
        },
        ...(input.now === undefined ? {} : { now: input.now }),
      },
      ctx,
    );
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

type PendingSuggestion = {
  readonly brunchId: BrunchId;
  readonly suggestedById: UserId;
  readonly suggesterName: string;
  readonly placeName?: string;
};

// The suggestion, if it exists and is still pending. These tables have no soft delete, and a
// nested include is not filtered, so the suggester's name is read as it is.
async function loadPendingSuggestion(
  input: { readonly kind: SuggestionKind; readonly suggestionId: string },
  ctx: { readonly db: DbClient },
): Promise<PendingSuggestion | undefined> {
  const { db } = ctx;
  switch (input.kind) {
    case 'invite': {
      const row = await db.brunchInviteSuggestion.findUnique({
        where: { id: input.suggestionId },
        include: { suggestedBy: true, status: true },
      });
      if (row === null || row.status.code !== 'pending') return undefined;
      return {
        brunchId: row.brunchId as BrunchId,
        suggestedById: row.suggestedById as UserId,
        suggesterName: row.suggestedBy.name,
      };
    }
    case 'location': {
      const row = await db.brunchLocationSuggestion.findUnique({
        where: { id: input.suggestionId },
        include: { suggestedBy: true, status: true },
      });
      if (row === null || row.status.code !== 'pending') return undefined;
      return {
        brunchId: row.brunchId as BrunchId,
        suggestedById: row.suggestedById as UserId,
        suggesterName: row.suggestedBy.name,
        placeName: row.placeName,
      };
    }
    case 'time': {
      const row = await db.brunchTimeSuggestion.findUnique({
        where: { id: input.suggestionId },
        include: { suggestedBy: true, status: true },
      });
      if (row === null || row.status.code !== 'pending') return undefined;
      return {
        brunchId: row.brunchId as BrunchId,
        suggestedById: row.suggestedById as UserId,
        suggesterName: row.suggestedBy.name,
      };
    }
  }
}
