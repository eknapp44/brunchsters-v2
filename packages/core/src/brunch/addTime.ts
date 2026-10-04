import type { DbClient } from '@brunchsters/database';
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
  | { readonly kind: 'db_error'; readonly cause: unknown };

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
    const time = await ctx.db.brunchTime.create({
      data: {
        brunchId: input.brunchId,
        scheduledAt: new Date(input.scheduledAt),
        proposedById: input.requestedById,
      },
    });
    return ok({ id: time.id as BrunchTimeId });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
