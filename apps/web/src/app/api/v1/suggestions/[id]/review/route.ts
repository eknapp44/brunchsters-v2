import { reviewInviteSuggestion, reviewInviteSuggestionRequestSchema } from '@brunchsters/core';
import type { InviteSuggestionId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { rateLimitedResponse, rateLimiterUnavailableResponse } from '@/lib/rateLimitHttp';
import { eventBus, getRateLimiter } from '@/lib/services';

const suggestionIdSchema = z.uuid();

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
  const parsedSuggestionId = suggestionIdSchema.safeParse(id);
  if (!parsedSuggestionId.success) {
    return apiError({ code: 'not_found', status: 404, message: 'Suggestion not found' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse review-suggestion request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = reviewInviteSuggestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await reviewInviteSuggestion(
    {
      suggestionId: parsedSuggestionId.data as InviteSuggestionId,
      reviewedById: session.user.id as UserId,
      decision: parsed.data.decision,
    },
    { db, eventBus, rateLimiter: getRateLimiter() },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'suggestion_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Suggestion not found' });
      case 'not_host':
        return apiError({
          code: 'forbidden',
          status: 403,
          message: 'Only the host can review suggestions',
        });
      case 'already_reviewed':
        return apiError({
          code: 'already_reviewed',
          status: 409,
          message: 'This suggestion was already reviewed',
        });
      case 'rate_limited':
        return rateLimitedResponse(result.error);
      case 'rate_limiter_unavailable':
        return rateLimiterUnavailableResponse({
          route: 'reviewInviteSuggestion',
          cause: result.error.cause,
        });
      case 'brunch_called_off':
        return apiError({
          code: 'brunch_called_off',
          status: 409,
          message: 'This brunch was called off',
        });
      case 'brunch_over':
        return apiError({ code: 'brunch_over', status: 409, message: 'This brunch is over' });
      case 'invalid_transition':
        return apiError({
          code: 'brunch_changed',
          status: 409,
          message: 'The brunch changed. Try again.',
        });
      default:
        console.error('reviewInviteSuggestion failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to review suggestion' });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
