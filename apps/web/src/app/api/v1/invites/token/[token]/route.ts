import { getInviteByToken } from '@brunchsters/core';
import { RATE_LIMIT_POLICIES, type InviteToken } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enforceLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/rateLimitHttp';

// Public — no auth() check. Deliberately minimal preview (see getInviteByToken). Every request
// spends the caller's address budget first, valid token or not: a limited address is refused
// before anything is looked up, so it cannot keep probing for tokens (ADR 0013).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const limited = await enforceLimit({
    policy: RATE_LIMIT_POLICIES.inviteTokenPerIp,
    subject: clientIp(request.headers),
    route: 'invite preview',
  });
  if (limited !== undefined) return limited;

  const { token } = await params;

  const preview = await getInviteByToken(token as InviteToken, { db });
  if (preview === undefined) {
    return NextResponse.json({ error: 'Invite not found or expired' }, { status: 404 });
  }

  return NextResponse.json(preview, { status: 200 });
}
