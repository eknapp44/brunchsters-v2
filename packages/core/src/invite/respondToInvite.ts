import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { LookupNotFoundError } from '../errors/LookupNotFoundError';
import type { EventBus } from '../events/EventBus';

export const respondToInviteRequestSchema = z.object({
  response: z.enum(['yes', 'no', 'maybe']),
});

export type RespondToInviteRequest = z.infer<typeof respondToInviteRequestSchema>;

export type RespondToInviteInput = RespondToInviteRequest & {
  readonly token: string;
  readonly viewerId: UserId;
};

export type RespondToInviteError =
  | { readonly kind: 'invalid_token' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type RespondToInviteContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

export async function respondToInvite(
  input: RespondToInviteInput,
  ctx: RespondToInviteContext,
): Promise<Result<{ brunchId: BrunchId }, RespondToInviteError>> {
  const { db, eventBus } = ctx;

  // findFirst is soft-delete-filtered — a revoked invite correctly looks
  // the same as a nonexistent one here.
  const invite = await db.brunchInvite.findFirst({
    where: { token: input.token, tokenExpiresAt: { gt: new Date() } },
  });
  if (invite === null) return err({ kind: 'invalid_token' });

  let isFirstResponse: boolean;
  try {
    isFirstResponse = await db.$transaction(async (tx) => {
      const rsvpStatus = await tx.rsvpStatus.findFirst({ where: { code: input.response } });
      if (rsvpStatus === null) throw new LookupNotFoundError(`RsvpStatus:${input.response}`);

      const existingAttendee = await tx.brunchAttendee.findFirst({
        where: { inviteId: invite.id },
      });

      if (existingAttendee !== null) {
        await tx.brunchAttendee.update({
          where: { id: existingAttendee.id },
          data: { rsvpStatusId: rsvpStatus.id, respondedAt: new Date() },
        });
        return false;
      }

      await tx.brunchAttendee.create({
        data: {
          brunchId: invite.brunchId,
          userId: input.viewerId,
          inviteId: invite.id,
          rsvpStatusId: rsvpStatus.id,
          respondedAt: new Date(),
        },
      });

      // "User signs up via token → invitedUserId populated" (PLANNING §9.5).
      if (invite.invitedUserId === null) {
        await tx.brunchInvite.update({
          where: { id: invite.id },
          data: { invitedUserId: input.viewerId },
        });
      }

      return true;
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit(isFirstResponse ? 'attendee/rsvp.received' : 'attendee/rsvp.changed', {
      brunchId: invite.brunchId,
      inviteId: invite.id,
      viewerId: input.viewerId,
      response: input.response,
    });
  } catch {
    // Side effects must never fail the response (Constitution 12).
  }

  return ok({ brunchId: invite.brunchId as BrunchId });
}
