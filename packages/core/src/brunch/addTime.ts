import { isUniqueConstraintError, type DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { AssertBrunchActiveError } from './guards/assertBrunchActive';
import { assertBrunchActive } from './guards/assertBrunchActive';
import type { AssertHostOfError } from './guards/assertHostOf';
import { assertHostOf } from './guards/assertHostOf';

export const addTimeRequestSchema = z.object({
  scheduledAt: z.iso.datetime().refine((iso) => new Date(iso) > new Date(), {
    message: 'scheduledAt must be in the future',
  }),
});

export type AddTimeRequest = z.infer<typeof addTimeRequestSchema>;

export type AddTimeInput = AddTimeRequest & {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
};

export type AddTimeError =
  | AssertHostOfError
  | AssertBrunchActiveError
  | { readonly kind: 'already_added' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

// The interactive-transaction client Prisma passes into db.$transaction's
// callback, derived from DbClient itself so it stays correct for the
// soft-delete extension DbClient applies.
export type AddTimeTxClient = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

export type AddTimeTxInput = {
  readonly brunchId: BrunchId;
  readonly proposedById: UserId;
  readonly scheduledAt: string;
};

// Raw create, no guards — callable with either a plain DbClient (addTime
// itself; a single insert needs no transaction) or a transaction client
// (reviewTimeSuggestion, which needs this write and the suggestion's status
// update to commit atomically together).
export async function addTimeInTransaction(
  db: AddTimeTxClient,
  input: AddTimeTxInput,
): Promise<{ id: BrunchTimeId }> {
  const time = await db.brunchTime.create({
    data: {
      brunchId: input.brunchId,
      scheduledAt: new Date(input.scheduledAt),
      proposedById: input.proposedById,
    },
  });
  return { id: time.id as BrunchTimeId };
}

export async function addTime(
  input: AddTimeInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ id: BrunchTimeId }, AddTimeError>> {
  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);

  const activeResult = assertBrunchActive(hostResult.value);
  if (activeResult.isErr()) return err(activeResult.error);

  try {
    const created = await addTimeInTransaction(ctx.db, {
      brunchId: input.brunchId,
      proposedById: input.requestedById,
      scheduledAt: input.scheduledAt,
    });
    return ok(created);
  } catch (cause) {
    // Partial unique index: one live row per brunchId+scheduledAt (architect
    // review) — see addLocation.ts's identical check.
    if (isUniqueConstraintError(cause)) return err({ kind: 'already_added' });
    return err({ kind: 'db_error', cause });
  }
}
