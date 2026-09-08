import { NoopEventBus, respondToInvite, respondToInviteRequestSchema } from '@brunchsters/core';
import type { InviteToken, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const eventBus = new NoopEventBus();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
      default:
        console.error('respondToInvite failed', result.error);
        return NextResponse.json({ error: 'Failed to respond to invite' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
