import { locationInputSchema, suggestLocation } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';

const brunchIdSchema = z.uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  const { id } = await params;
  const parsedBrunchId = brunchIdSchema.safeParse(id);
  if (!parsedBrunchId.success) {
    return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse suggest-location request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = locationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await suggestLocation(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      suggestedById: session.user.id as UserId,
      location: parsed.data,
    },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'suggestions_disabled':
        return NextResponse.json(
          { error: 'Location suggestions are disabled for this brunch' },
          { status: 403 },
        );
      case 'brunch_not_active':
        return NextResponse.json({ error: 'Brunch is not open for suggestions' }, { status: 409 });
      case 'already_suggested':
        return NextResponse.json({ error: 'This place was already suggested' }, { status: 409 });
      default:
        console.error('suggestLocation failed', result.error);
        return NextResponse.json({ error: 'Failed to suggest location' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 201 });
}
