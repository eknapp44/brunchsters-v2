import { NoopEventBus, suggestInvitee, suggestInviteeRequestSchema } from '@brunchsters/core';
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
    console.error('Failed to parse suggest-invitee request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = suggestInviteeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await suggestInvitee(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      suggestedById: session.user.id as UserId,
      email: parsed.data.email,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'suggestions_disabled':
        return NextResponse.json(
          { error: 'Suggestions are disabled for this brunch' },
          { status: 403 },
        );
      case 'not_attendee':
        return NextResponse.json({ error: 'Only attendees can suggest invitees' }, { status: 403 });
      case 'already_suggested':
        return NextResponse.json({ error: 'This email was already suggested' }, { status: 409 });
      default:
        console.error('suggestInvitee failed', result.error);
        return NextResponse.json({ error: 'Failed to suggest invitee' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 201 });
}
