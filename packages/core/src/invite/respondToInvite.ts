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

  type ResponseOutcome = 'created' | 'updated' | 'already_member';

  let outcome: ResponseOutcome;
  try {
    outcome = await db.$transaction(async (tx) => {
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
        return 'updated';
      }

      // The viewer may already belong to this brunch through a different
      // relationship — most commonly, they're the host (or another attendee)
      // clicking an invite link that wasn't sent to them while already signed
      // in. BrunchAttendee has a unique (brunchId, userId) constraint, so a
      // second row can't be created for them. Treat it as a no-op: they
      // already have access to the brunch, just let them through.
      const existingMembership = await tx.brunchAttendee.findFirst({
        where: { brunchId: invite.brunchId, userId: input.viewerId },
      });
      if (existingMembership !== null) {
        return 'already_member';
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

      return 'created';
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    return err({ kind: 'db_error', cause });
  }

  if (outcome !== 'already_member') {
    try {
      await eventBus.emit(
        outcome === 'created' ? 'attendee/rsvp.received' : 'attendee/rsvp.changed',
        {
          brunchId: invite.brunchId,
          inviteId: invite.id,
          viewerId: input.viewerId,
          response: input.response,
        },
      );
    } catch {
      // Side effects must never fail the response (Constitution 12).
    }
  }

  return ok({ brunchId: invite.brunchId as BrunchId });
}
