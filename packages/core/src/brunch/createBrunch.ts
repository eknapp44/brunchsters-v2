import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { EventBus } from '../events/EventBus';

// Validates the string is a real IANA zone the runtime knows about,
// not just a plausible-looking one.
const ianaTimezoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid IANA timezone' },
);

export const locationInputSchema = z.object({
  placeId: z.string().min(1),
  placeName: z.string().min(1),
  placeAddress: z.string().min(1),
  // May be empty when the place provider has no Maps URI for the result.
  placeUrl: z.string(),
  timezone: ianaTimezoneSchema,
});

export const createBrunchRequestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  locations: z.array(locationInputSchema).default([]),
  times: z.array(z.object({ scheduledAt: z.iso.datetime() })).default([]),
  votingDeadline: z.iso
    .datetime()
    .refine((iso) => new Date(iso) > new Date(), {
      message: 'votingDeadline must be in the future',
    })
    .optional(),
});

export type LocationInput = z.infer<typeof locationInputSchema>;
export type CreateBrunchRequest = z.infer<typeof createBrunchRequestSchema>;

export type CreateBrunchInput = CreateBrunchRequest & {
  readonly hostId: UserId; // from the session, never from the request body
};

export type CreateBrunchError =
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type CreateBrunchContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

// Thrown inside the transaction to abort it; mapped to a typed Err in the catch.
class LookupNotFoundError extends Error {
  constructor(readonly code: string) {
    super(`Lookup row not found: ${code}`);
  }
}

export async function createBrunch(
  input: CreateBrunchInput,
  ctx: CreateBrunchContext,
): Promise<Result<{ id: BrunchId }, CreateBrunchError>> {
  const { db, eventBus } = ctx;

  let brunchId: BrunchId;
  try {
    brunchId = await db.$transaction(async (tx) => {
      const draftStatus = await tx.brunchStatus.findFirst({ where: { code: 'draft' } });
      if (draftStatus === null) throw new LookupNotFoundError('BrunchStatus:draft');

      const yesRsvp = await tx.rsvpStatus.findFirst({ where: { code: 'yes' } });
      if (yesRsvp === null) throw new LookupNotFoundError('RsvpStatus:yes');

      const hostDecides = await tx.brunchDecisionType.findFirst({
        where: { code: 'host_decides' },
      });
      if (hostDecides === null) throw new LookupNotFoundError('BrunchDecisionType:host_decides');

      const groupVote = await tx.brunchDecisionType.findFirst({ where: { code: 'group_vote' } });
      if (groupVote === null) throw new LookupNotFoundError('BrunchDecisionType:group_vote');

      const host = await tx.user.findFirst({ where: { id: input.hostId } });
      if (host === null) throw new LookupNotFoundError(`User:${input.hostId}`);

      const now = new Date();

      const brunch = await tx.brunch.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          hostId: input.hostId,
          statusId: draftStatus.id,
          votingDeadline:
            input.votingDeadline !== undefined ? new Date(input.votingDeadline) : null,
        },
      });

      // Synthetic invite for the host (PLANNING.md §9.6) — keeps BrunchAttendee.inviteId
      // uniform. Born expired: the host never redeems it (Constitution 28).
      const invite = await tx.brunchInvite.create({
        data: {
          brunchId: brunch.id,
          invitedUserId: input.hostId,
          invitedEmail: host.email,
          invitedById: input.hostId,
          token: crypto.randomUUID(),
          tokenExpiresAt: now,
        },
      });

      await tx.brunchAttendee.create({
        data: {
          brunchId: brunch.id,
          userId: input.hostId,
          inviteId: invite.id,
          rsvpStatusId: yesRsvp.id,
          respondedAt: now,
        },
      });

      // Mode emerges from behavior (Constitution 4): one option means the host
      // decided; two or more puts it to a vote. Locations and times independently.
      if (input.locations.length > 0) {
        const decisionTypeId = input.locations.length === 1 ? hostDecides.id : groupVote.id;
        await tx.brunchLocation.createMany({
          data: input.locations.map((location) => ({
            brunchId: brunch.id,
            decisionTypeId,
            placeId: location.placeId,
            placeName: location.placeName,
            placeAddress: location.placeAddress,
            placeUrl: location.placeUrl,
            timezone: location.timezone,
            proposedById: input.hostId,
          })),
        });
      }

      if (input.times.length > 0) {
        const decisionTypeId = input.times.length === 1 ? hostDecides.id : groupVote.id;
        await tx.brunchTime.createMany({
          data: input.times.map((time) => ({
            brunchId: brunch.id,
            decisionTypeId,
            scheduledAt: new Date(time.scheduledAt),
            proposedById: input.hostId,
          })),
        });
      }

      return brunch.id as BrunchId;
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit('brunch/created', { brunchId, hostId: input.hostId });
  } catch {
    // Side effects must never fail the create (Constitution 12). A real
    // EventBus implementation owns its retry/logging; nothing to do here.
  }

  return ok({ id: brunchId });
}
