import { getInviteByToken } from '@brunchsters/core';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Public — no auth() check. Deliberately minimal preview (see getInviteByToken).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const preview = await getInviteByToken(token, { db });
  if (preview === undefined) {
    return NextResponse.json({ error: 'Invite not found or expired' }, { status: 404 });
  }

  return NextResponse.json(preview, { status: 200 });
}
