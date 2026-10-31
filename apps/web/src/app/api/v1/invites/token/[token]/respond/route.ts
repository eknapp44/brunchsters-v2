import { respondToInvite, respondToInviteRequestSchema } from '@brunchsters/core';
import { RATE_LIMIT_POLICIES, type InviteToken, type UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { db } from '@/lib/db';
import { enforceLimit, enforceWriteLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/rateLimitHttp';
import { eventBus } from '@/lib/services';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  // This route is public (middleware lets a signed-out visitor through), so the address budget
  // comes before the session check; the person's own write budget comes after it.
  const addressLimited = await enforceLimit({
    policy: RATE_LIMIT_POLICIES.inviteTokenPerIp,
    subject: clientIp(request.headers),
    route: 'invite response',
  });
  if (addressLimited !== undefined) return addressLimited;

  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  const { token } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse respond-to-invite request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = respondToInviteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await respondToInvite(
    {
      token: token as InviteToken,
      viewerId: session.user.id as UserId,
      response: parsed.data.response,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'invalid_token':
        return apiError({ code: 'not_found', status: 404, message: 'Invite not found or expired' });
      case 'brunch_called_off':
        return apiError({
          code: 'brunch_called_off',
          status: 409,
          message: 'This brunch was called off',
        });
      case 'brunch_over':
        return apiError({ code: 'brunch_over', status: 409, message: 'This brunch is over' });
      default:
        console.error('respondToInvite failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to respond to invite' });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
