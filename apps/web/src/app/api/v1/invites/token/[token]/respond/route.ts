import { respondToInvite, respondToInviteRequestSchema } from '@brunchsters/core';
import { RATE_LIMIT_POLICIES, type InviteToken, type UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  const { token } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse respond-to-invite request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = respondToInviteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
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
        return NextResponse.json({ error: 'Invite not found or expired' }, { status: 404 });
      case 'brunch_called_off':
        return NextResponse.json({ error: 'This brunch was called off' }, { status: 409 });
      default:
        console.error('respondToInvite failed', result.error);
        return NextResponse.json({ error: 'Failed to respond to invite' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
