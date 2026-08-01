import { NoopEventBus, sendInvites, sendInvitesRequestSchema } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const eventBus = new NoopEventBus();
const brunchIdSchema = z.uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const parsedBrunchId = brunchIdSchema.safeParse(id);
  if (!parsedBrunchId.success) {
    return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse send-invites request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = sendInvitesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await sendInvites(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      invitedById: session.user.id as UserId,
      emails: parsed.data.emails,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can send invites' }, { status: 403 });
      default:
        console.error('sendInvites failed', result.error);
        return NextResponse.json({ error: 'Failed to send invites' }, { status: 500 });
    }
  }

  return NextResponse.json({ invites: result.value }, { status: 201 });
}
