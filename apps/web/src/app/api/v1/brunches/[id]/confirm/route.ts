import { confirmBrunch } from '@brunchsters/core';
import type { BrunchId, BrunchLocationId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

const brunchIdSchema = z.uuid();
const confirmRequestSchema = z.object({
  locationId: z.uuid(),
  timeId: z.uuid(),
});

export async function POST(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse confirm-brunch request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await confirmBrunch(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      requestedById: session.user.id as UserId,
      locationId: parsed.data.locationId as BrunchLocationId,
      timeId: parsed.data.timeId as BrunchTimeId,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      case 'not_host':
        return apiError({ code: 'forbidden', status: 403, message: 'Only the host can confirm' });
      case 'brunch_not_active':
        return apiError({
          code: 'already_confirmed',
          status: 409,
          message: 'Brunch is already confirmed',
        });
      case 'no_locations':
        return apiError({
          code: 'nothing_to_confirm',
          status: 409,
          message: 'No locations to confirm',
        });
      case 'no_times':
        return apiError({
          code: 'nothing_to_confirm',
          status: 409,
          message: 'No times to confirm',
        });
      case 'unknown_option':
        return apiError({ code: 'option_gone', status: 404, message: 'Unknown location or time' });
      case 'invalid_transition':
        return apiError({
          code: 'brunch_changed',
          status: 409,
          message: 'The brunch changed. Try again.',
        });
      default:
        console.error('confirmBrunch failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to confirm brunch' });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
