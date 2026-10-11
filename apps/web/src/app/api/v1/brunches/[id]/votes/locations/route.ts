import { castBallotRequestSchema, castLocationBallot, NoopEventBus } from '@brunchsters/core';
import type { BrunchId, BrunchLocationId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const eventBus = new NoopEventBus();
const brunchIdSchema = z.uuid();

export async function PUT(
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
    console.error('Failed to parse cast-ballot request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = castBallotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await castLocationBallot(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      voterId: session.user.id as UserId,
      optionIds: parsed.data.optionIds as BrunchLocationId[],
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'brunch_not_active':
        return NextResponse.json({ error: 'Brunch is not open for voting' }, { status: 409 });
      case 'empty_ballot':
        return NextResponse.json({ error: 'Select at least one option' }, { status: 422 });
      case 'cannot_vote':
        return NextResponse.json({ error: 'Your RSVP does not allow voting' }, { status: 403 });
      case 'voting_closed':
        return NextResponse.json({ error: 'Voting is closed' }, { status: 409 });
      case 'not_a_vote':
        return NextResponse.json(
          { error: 'There is only one option — nothing to vote on' },
          { status: 409 },
        );
      case 'unknown_option':
        return NextResponse.json({ error: 'Unknown option' }, { status: 404 });
      default:
        console.error('castLocationBallot failed', result.error);
        return NextResponse.json({ error: 'Failed to cast ballot' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
