import {
  NoopEventBus,
  reviewInviteSuggestion,
  reviewInviteSuggestionRequestSchema,
} from '@brunchsters/core';
import type { InviteSuggestionId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const eventBus = new NoopEventBus();
const suggestionIdSchema = z.uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const parsedSuggestionId = suggestionIdSchema.safeParse(id);
  if (!parsedSuggestionId.success) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse review-suggestion request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = reviewInviteSuggestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await reviewInviteSuggestion(
    {
      suggestionId: parsedSuggestionId.data as InviteSuggestionId,
      reviewedById: session.user.id as UserId,
      decision: parsed.data.decision,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'suggestion_not_found':
        return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json(
          { error: 'Only the host can review suggestions' },
          { status: 403 },
        );
      case 'already_reviewed':
        return NextResponse.json(
          { error: 'This suggestion was already reviewed' },
          { status: 409 },
        );
      default:
        console.error('reviewInviteSuggestion failed', result.error);
        return NextResponse.json({ error: 'Failed to review suggestion' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
