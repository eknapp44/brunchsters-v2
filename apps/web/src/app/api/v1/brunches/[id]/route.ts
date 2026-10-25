import { deleteBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';

const brunchIdSchema = z.uuid();

// Delete a draft or a called-off brunch (spec 0013, ADR 0015). Host only. A soft delete: afterwards
// the brunch is a 404 for everyone, a second delete included.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  const { id } = await params;
  const parsedBrunchId = brunchIdSchema.safeParse(id);
  if (!parsedBrunchId.success) {
    return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
  }

  const result = await deleteBrunch(
    { brunchId: parsedBrunchId.data as BrunchId, requestedById: session.user.id as UserId },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      case 'not_host':
        return apiError({
          code: 'forbidden',
          status: 403,
          message: 'Only the host can delete a brunch',
        });
      case 'not_deletable':
        return apiError({
          code: 'not_deletable',
          status: 409,
          message: 'Call this brunch off before deleting it',
        });
      case 'notice_pending':
        return apiError({
          code: 'notice_pending',
          status: 409,
          message: 'People are still being told it was called off. Give it a few minutes',
        });
      default:
        console.error('deleteBrunch failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to delete the brunch' });
    }
  }

  return new NextResponse(null, { status: 204 });
}
