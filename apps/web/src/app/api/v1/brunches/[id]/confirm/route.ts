import { confirmBrunch } from '@brunchsters/core';
import type { BrunchId, BrunchLocationId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

const brunchIdSchema = z.uuid();
const confirmRequestSchema = z.object({
  locationId: z.uuid(),
  timeId: z.uuid(),
});

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
    console.error('Failed to parse confirm-brunch request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await confirmBrunch(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      requestedById: session.user.id as UserId,
      locationId: parsed.data.locationId as BrunchLocationId,
      timeId: parsed.data.timeId as BrunchTimeId,
    },
    { db, eventBus },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can confirm' }, { status: 403 });
      case 'brunch_not_active':
        return NextResponse.json({ error: 'Brunch is already confirmed' }, { status: 409 });
      case 'no_locations':
        return NextResponse.json({ error: 'No locations to confirm' }, { status: 409 });
      case 'no_times':
        return NextResponse.json({ error: 'No times to confirm' }, { status: 409 });
      case 'unknown_option':
        return NextResponse.json({ error: 'Unknown location or time' }, { status: 404 });
      default:
        console.error('confirmBrunch failed', result.error);
        return NextResponse.json({ error: 'Failed to confirm brunch' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
