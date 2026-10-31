import { sendInvites, sendInvitesRequestSchema } from '@brunchsters/core';
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
    console.error('Failed to parse send-invites request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = sendInvitesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await sendInvites(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      invitedById: session.user.id as UserId,
      emails: parsed.data.emails,
    },
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
          message: 'Only the host can send invites',
        });
      case 'rate_limited':
        return rateLimitedResponse(result.error);
      case 'rate_limiter_unavailable':
        return rateLimiterUnavailableResponse({ route: 'sendInvites', cause: result.error.cause });
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
        console.error('sendInvites failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to send invites' });
    }
  }

  return NextResponse.json({ invites: result.value }, { status: 201 });
}
