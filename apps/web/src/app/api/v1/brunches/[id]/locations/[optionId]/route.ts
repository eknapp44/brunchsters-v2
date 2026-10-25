import { removeLocation } from '@brunchsters/core';
import type { BrunchId, BrunchLocationId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';

const idSchema = z.uuid();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; optionId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  const { id, optionId } = await params;
  const parsedBrunchId = idSchema.safeParse(id);
  const parsedLocationId = idSchema.safeParse(optionId);
  if (!parsedBrunchId.success || !parsedLocationId.success) {
    return apiError({ code: 'not_found', status: 404, message: 'Location not found' });
  }

  const result = await removeLocation(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      requestedById: session.user.id as UserId,
      locationId: parsedLocationId.data as BrunchLocationId,
    },
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
          message: 'Only the host can remove locations',
        });
      case 'brunch_not_active':
        return apiError({
          code: 'brunch_not_active',
          status: 409,
          message: 'Brunch is not open for changes',
        });
      case 'unknown_option':
        return apiError({ code: 'not_found', status: 404, message: 'Location not found' });
      case 'option_confirmed':
        return apiError({
          code: 'option_confirmed',
          status: 409,
          message: 'Cannot remove a confirmed location',
        });
      case 'last_option':
        return apiError({
          code: 'last_option',
          status: 409,
          message: 'Cannot remove the last remaining location',
        });
      default:
        console.error('removeLocation failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to remove location' });
    }
  }

  return new NextResponse(null, { status: 204 });
}
