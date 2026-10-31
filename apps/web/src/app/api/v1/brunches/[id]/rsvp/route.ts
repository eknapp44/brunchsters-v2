import { updateRsvp, updateRsvpRequestSchema } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

const brunchIdSchema = z.uuid();

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
    console.error('Failed to parse update-rsvp request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = updateRsvpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await updateRsvp(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      viewerId: session.user.id as UserId,
      response: parsed.data.response,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      case 'brunch_called_off':
        return apiError({
          code: 'brunch_called_off',
          status: 409,
          message: 'This brunch was called off',
        });
      case 'brunch_over':
        return apiError({ code: 'brunch_over', status: 409, message: 'This brunch is over' });
      default:
        console.error('updateRsvp failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to update RSVP' });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
