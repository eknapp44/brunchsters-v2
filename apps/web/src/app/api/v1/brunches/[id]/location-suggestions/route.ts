import { locationInputSchema, suggestLocation } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';

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
    console.error('Failed to parse suggest-location request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = locationInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await suggestLocation(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      suggestedById: session.user.id as UserId,
      location: parsed.data,
    },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      case 'suggestions_disabled':
        return apiError({
          code: 'suggestions_off',
          status: 403,
          message: 'Location suggestions are disabled for this brunch',
        });
      case 'brunch_not_active':
        return apiError({
          code: 'brunch_not_active',
          status: 409,
          message: 'Brunch is not open for suggestions',
        });
      case 'already_suggested':
        return apiError({
          code: 'already_there',
          status: 409,
          message: 'This place was already suggested',
        });
      default:
        console.error('suggestLocation failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to suggest location' });
    }
  }

  return NextResponse.json(result.value, { status: 201 });
}
