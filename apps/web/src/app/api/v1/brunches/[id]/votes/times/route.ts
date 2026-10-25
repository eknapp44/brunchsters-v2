import { castBallotRequestSchema, castTimeBallot } from '@brunchsters/core';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

const brunchIdSchema = z.uuid();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  const { id } = await params;
  const parsedBrunchId = brunchIdSchema.safeParse(id);
  if (!parsedBrunchId.success) {
    return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse cast-ballot request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = castBallotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await castTimeBallot(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      voterId: session.user.id as UserId,
      optionIds: parsed.data.optionIds as BrunchTimeId[],
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      case 'brunch_not_active':
        return apiError({
          code: 'brunch_not_active',
          status: 409,
          message: 'Brunch is not open for voting',
        });
      case 'empty_ballot':
        return apiError({ code: 'invalid', status: 422, message: 'Select at least one option' });
      case 'cannot_vote':
        return apiError({
          code: 'cannot_vote',
          status: 403,
          message: 'Your RSVP does not allow voting',
        });
      case 'voting_closed':
        return apiError({ code: 'voting_closed', status: 409, message: 'Voting is closed' });
      case 'not_a_vote':
        return apiError({
          code: 'not_a_vote',
          status: 409,
          message: 'There is only one option — nothing to vote on',
        });
      case 'unknown_option':
        return apiError({ code: 'option_gone', status: 404, message: 'Unknown option' });
      default:
        console.error('castTimeBallot failed', result.error);
        return apiError({ code: 'internal', status: 500, message: 'Failed to cast ballot' });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
