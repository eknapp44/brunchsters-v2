import { resendInvite } from '@brunchsters/core';
import type { InviteId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { rateLimitedResponse, rateLimiterUnavailableResponse } from '@/lib/rateLimitHttp';
import { eventBus, getRateLimiter } from '@/lib/services';

const inviteIdSchema = z.uuid();

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
  const parsedInviteId = inviteIdSchema.safeParse(id);
  if (!parsedInviteId.success) {
    return apiError({ code: 'not_found', status: 404, message: 'Invite not found' });
  }

  const result = await resendInvite(
    { inviteId: parsedInviteId.data as InviteId, requestedById: session.user.id as UserId },
    { db, eventBus, rateLimiter: getRateLimiter() },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'invite_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Invite not found' });
      case 'not_host':
        return apiError({
          code: 'forbidden',
          status: 403,
          message: 'Only the host can resend invites',
        });
      case 'rate_limited':
        return rateLimitedResponse(result.error);
      case 'rate_limiter_unavailable':
        return rateLimiterUnavailableResponse({ route: 'resendInvite', cause: result.error.cause });
      case 'brunch_called_off':
        return apiError({
          code: 'brunch_called_off',
          status: 409,
          message: 'This brunch was called off',
        });
      case 'brunch_over':
        return apiError({ code: 'brunch_over', status: 409, message: 'This brunch is over' });
      default:
        console.error('resendInvite failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to resend invite' });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
