import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { LookupNotFoundError } from '../errors/LookupNotFoundError';
import type { EventBus } from '../events/EventBus';

export const updateRsvpRequestSchema = z.object({
  response: z.enum(['yes', 'no', 'maybe']),
});

export type UpdateRsvpRequest = z.infer<typeof updateRsvpRequestSchema>;

export type UpdateRsvpInput = UpdateRsvpRequest & {
  readonly brunchId: BrunchId;
  readonly viewerId: UserId;
};

export type UpdateRsvpError =
  | { readonly kind: 'not_attendee' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type UpdateRsvpContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

// For an attendee changing their mind from the brunch detail page — distinct
// from respondToInvite, which is token-based for the initial join. A host's
// synthetic invite is born-expired (Constitution 28), so routing this through
// the token-based flow would break the RSVP control for hosts specifically;
// this works directly off an existing BrunchAttendee row instead, which the
// caller is guaranteed to have (getBrunchById's own access rule requires it).
export async function updateRsvp(
  input: UpdateRsvpInput,
  ctx: UpdateRsvpContext,
): Promise<Result<{ brunchId: BrunchId }, UpdateRsvpError>> {
  const { db, eventBus } = ctx;

  const attendee = await db.brunchAttendee.findFirst({
    where: { brunchId: input.brunchId, userId: input.viewerId },
  });
  if (attendee === null) return err({ kind: 'not_attendee' });

  try {
    const rsvpStatus = await db.rsvpStatus.findFirst({ where: { code: input.response } });
    if (rsvpStatus === null) throw new LookupNotFoundError(`RsvpStatus:${input.response}`);

    await db.brunchAttendee.update({
      where: { id: attendee.id },
      data: { rsvpStatusId: rsvpStatus.id, respondedAt: new Date() },
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit('attendee/rsvp.changed', {
      brunchId: input.brunchId,
      viewerId: input.viewerId,
      response: input.response,
    });
  } catch {
    // Side effects must never fail the update (Constitution 12).
  }

  return ok({ brunchId: input.brunchId });
}
