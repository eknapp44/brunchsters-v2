import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { LookupNotFoundError } from '../errors/LookupNotFoundError';
import type { EventBus } from '../events/EventBus';

const INVITE_EXPIRY_DAYS = 30;

export const sendInvitesRequestSchema = z.object({
  emails: z.array(z.email()).min(1),
});

export type SendInvitesRequest = z.infer<typeof sendInvitesRequestSchema>;

export type SendInvitesInput = SendInvitesRequest & {
  readonly brunchId: BrunchId;
  readonly invitedById: UserId; // from the session, never from the request body
};

export type InviteSummary = {
  readonly id: InviteId;
  readonly invitedEmail: string;
};

export type SendInvitesError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'not_host' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type SendInvitesContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

function expiresIn30Days(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

export async function sendInvites(
  input: SendInvitesInput,
  ctx: SendInvitesContext,
): Promise<Result<readonly InviteSummary[], SendInvitesError>> {
  const { db, eventBus } = ctx;

  const brunch = await db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { status: true, host: true },
  });
  if (brunch === null) return err({ kind: 'brunch_not_found' });
  if (brunch.hostId !== input.invitedById) return err({ kind: 'not_host' });

  // Inviting yourself is a no-op, not an error — the host already has the
  // synthetic invite. Filtering it out (rather than rejecting the whole
  // batch) means the rest of a multi-email submission still goes through
  // even if the host absent-mindedly included their own address.
  //
  // Also de-duplicate: the same email appearing twice in one batch would
  // otherwise create the invite on the first pass and then "revive" that
  // same just-created row on the second (findUnique sees uncommitted writes
  // within the same transaction), producing a duplicate entry in the
  // returned summaries for a single underlying row.
  const emails = [...new Set(input.emails.filter((email) => email !== brunch.host.email))];
  if (emails.length === 0) return ok([]);

  let summaries: readonly InviteSummary[];
  try {
    summaries = await db.$transaction(async (tx) => {
      const invitedStatus = await tx.rsvpStatus.findFirst({ where: { code: 'invited' } });
      if (invitedStatus === null) throw new LookupNotFoundError('RsvpStatus:invited');

      const results: InviteSummary[] = [];

      for (const email of emails) {
        // findUnique bypasses the soft-delete extension (only findMany/findFirst
        // are intercepted) — we need to see revoked invites here to revive them.
        const existing = await tx.brunchInvite.findUnique({
          where: { brunchId_invitedEmail: { brunchId: input.brunchId, invitedEmail: email } },
        });

        if (existing !== null) {
          const revived = await tx.brunchInvite.update({
            where: { id: existing.id },
            data: {
              token: crypto.randomUUID(),
              tokenExpiresAt: expiresIn30Days(),
              lastResentAt: new Date(),
              deletedAt: null,
              deletedBy: null,
            },
          });
          results.push({ id: revived.id as InviteId, invitedEmail: revived.invitedEmail });
          continue;
        }

        const existingUser = await tx.user.findFirst({ where: { email } });

        const newInvite = await tx.brunchInvite.create({
          data: {
            brunchId: input.brunchId,
            invitedUserId: existingUser?.id ?? null,
            invitedEmail: email,
            invitedById: input.invitedById,
            token: crypto.randomUUID(),
            tokenExpiresAt: expiresIn30Days(),
          },
        });

        if (existingUser !== null) {
          await tx.brunchAttendee.create({
            data: {
              brunchId: input.brunchId,
              userId: existingUser.id,
              inviteId: newInvite.id,
              rsvpStatusId: invitedStatus.id,
            },
          });
        }

        results.push({ id: newInvite.id as InviteId, invitedEmail: newInvite.invitedEmail });
      }

      if (brunch.status.code === 'draft') {
        const activeStatus = await tx.brunchStatus.findFirst({ where: { code: 'active' } });
        if (activeStatus === null) throw new LookupNotFoundError('BrunchStatus:active');
        await tx.brunch.update({
          where: { id: input.brunchId },
          data: { statusId: activeStatus.id },
        });
      }

      return results;
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    return err({ kind: 'db_error', cause });
  }

  for (const invite of summaries) {
    try {
      await eventBus.emit('invite/sent', {
        brunchId: input.brunchId,
        inviteId: invite.id,
        invitedEmail: invite.invitedEmail,
      });
    } catch {
      // Side effects must never fail the send (Constitution 12).
    }
  }

  return ok(summaries);
}
