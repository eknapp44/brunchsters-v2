import { reinstateBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

const brunchIdSchema = z.uuid();

// "Bring it back" (spec 0013, ADR 0015). Host only. Free of any budget beyond the write limit: it
// can only follow a cancel, which paid for the notice.
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

  const result = await reinstateBrunch(
    { brunchId: parsedBrunchId.data as BrunchId, requestedById: session.user.id as UserId },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can bring it back' }, { status: 403 });
      case 'not_called_off':
        return NextResponse.json({ error: 'This brunch is not called off' }, { status: 409 });
      case 'nothing_to_restore':
        return NextResponse.json(
          { error: 'There is no earlier state to bring this brunch back to' },
          { status: 409 },
        );
      case 'invalid_transition':
        return NextResponse.json({ error: 'The brunch changed. Try again.' }, { status: 409 });
      default:
        console.error('reinstateBrunch failed', result.error);
        return NextResponse.json({ error: 'Failed to bring the brunch back' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
