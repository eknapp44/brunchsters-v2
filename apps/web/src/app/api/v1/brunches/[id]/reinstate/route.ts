import { reinstateBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

const brunchIdSchema = z.uuid();

// "Bring it back" (spec 0013, ADR 0015). Host only. Free of any budget beyond the write limit: it
// can only follow a cancel, which paid for the notice.
export async function POST(
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

  const result = await reinstateBrunch(
    { brunchId: parsedBrunchId.data as BrunchId, requestedById: session.user.id as UserId },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      case 'not_host':
        return apiError({
          code: 'forbidden',
          status: 403,
          message: 'Only the host can bring it back',
        });
      case 'not_called_off':
        return apiError({
          code: 'not_called_off',
          status: 409,
          message: 'This brunch is not called off',
        });
      case 'nothing_to_restore':
        return apiError({
          code: 'brunch_changed',
          status: 409,
          message: 'There is no earlier state to bring this brunch back to',
        });
      case 'invalid_transition':
        return apiError({
          code: 'brunch_changed',
          status: 409,
          message: 'The brunch changed. Try again.',
        });
      default:
        console.error('reinstateBrunch failed', result.error);
        return apiError({
          code: 'internal',
          status: 500,
          message: 'Failed to bring the brunch back',
        });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
