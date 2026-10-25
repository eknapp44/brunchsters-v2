import { cancelBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { rateLimitedResponse, rateLimiterUnavailableResponse } from '@/lib/rateLimitHttp';
import { eventBus, getRateLimiter } from '@/lib/services';

const brunchIdSchema = z.uuid();

// "Call it off" (spec 0013, ADR 0015). Host only; the notice that goes to the guests waits out a
// hold in the queue, so this answers as soon as the status is changed.
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

  const result = await cancelBrunch(
    { brunchId: parsedBrunchId.data as BrunchId, requestedById: session.user.id as UserId },
    { db, eventBus, rateLimiter: getRateLimiter() },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      case 'not_host':
        return apiError({
          code: 'forbidden',
          status: 403,
          message: 'Only the host can call it off',
        });
      case 'brunch_called_off':
        return apiError({
          code: 'brunch_called_off',
          status: 409,
          message: 'This brunch was already called off',
        });
      case 'invalid_transition':
        return result.error.from === 'draft'
          ? apiError({
              code: 'brunch_not_active',
              status: 409,
              message: 'A draft cannot be called off. Delete it instead',
            })
          : apiError({
              code: 'brunch_changed',
              status: 409,
              message: 'The brunch changed. Try again.',
            });
      case 'brunch_over':
        return apiError({
          code: 'brunch_over',
          status: 409,
          message: 'That brunch has already happened',
        });
      case 'rate_limited':
        return rateLimitedResponse(result.error);
      case 'rate_limiter_unavailable':
        return rateLimiterUnavailableResponse({ route: 'cancelBrunch', cause: result.error.cause });
      default:
        console.error('cancelBrunch failed', result.error);
        return apiError({
          code: 'internal',
          status: 500,
          message: 'Failed to call off the brunch',
        });
    }
  }

  return NextResponse.json(
    { brunchId: result.value.brunchId, cancelledAt: result.value.cancelledAt.toISOString() },
    { status: 200 },
  );
}
