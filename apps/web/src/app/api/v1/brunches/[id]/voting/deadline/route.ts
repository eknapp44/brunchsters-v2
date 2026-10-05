import { updateVotingDeadline, updateVotingDeadlineRequestSchema } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const brunchIdSchema = z.uuid();

export async function PATCH(
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
    console.error('Failed to parse update-voting-deadline request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateVotingDeadlineRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await updateVotingDeadline(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      requestedById: session.user.id as UserId,
      votingDeadline: parsed.data.votingDeadline ?? undefined,
    },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json(
          { error: 'Only the host can change the voting deadline' },
          { status: 403 },
        );
      case 'already_closed':
        return NextResponse.json({ error: 'Voting is already closed' }, { status: 409 });
      default:
        console.error('updateVotingDeadline failed', result.error);
        return NextResponse.json(
          { error: 'Failed to update the voting deadline' },
          { status: 500 },
        );
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
