import { cancelBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { rateLimitedResponse, rateLimiterUnavailableResponse } from '@/lib/rateLimitHttp';
import { eventBus, getRateLimiter } from '@/lib/services';

const brunchIdSchema = z.uuid();

// "Call it off" (spec 0013, ADR 0015). Host only; the notice that goes to the guests waits out a
// hold in the queue, so this answers as soon as the status is changed.
export async function POST(
  _request: Request,
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

  const result = await cancelBrunch(
    { brunchId: parsedBrunchId.data as BrunchId, requestedById: session.user.id as UserId },
    { db, eventBus, rateLimiter: getRateLimiter() },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can call it off' }, { status: 403 });
      case 'brunch_called_off':
        return NextResponse.json({ error: 'This brunch was already called off' }, { status: 409 });
      case 'invalid_transition':
        return NextResponse.json(
          {
            error:
              result.error.from === 'draft'
                ? 'A draft cannot be called off. Delete it instead'
                : 'The brunch changed. Try again.',
          },
          { status: 409 },
        );
      case 'brunch_over':
        return NextResponse.json({ error: 'That brunch has already happened' }, { status: 409 });
      case 'rate_limited':
        return rateLimitedResponse(result.error);
      case 'rate_limiter_unavailable':
        return rateLimiterUnavailableResponse({ route: 'cancelBrunch', cause: result.error.cause });
      default:
        console.error('cancelBrunch failed', result.error);
        return NextResponse.json({ error: 'Failed to call off the brunch' }, { status: 500 });
    }
  }

  return NextResponse.json(
    { brunchId: result.value.brunchId, cancelledAt: result.value.cancelledAt.toISOString() },
    { status: 200 },
  );
}
