import { NoopEventBus, updateRsvp, updateRsvpRequestSchema } from '@brunchsters/core';
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
    console.error('Failed to parse update-rsvp request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateRsvpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await updateRsvp(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      viewerId: session.user.id as UserId,
      response: parsed.data.response,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'not_attendee':
        return NextResponse.json({ error: 'Only attendees can RSVP' }, { status: 403 });
      default:
        console.error('updateRsvp failed', result.error);
        return NextResponse.json({ error: 'Failed to update RSVP' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
