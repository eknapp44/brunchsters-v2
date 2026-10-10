import { addTime, addTimeRequestSchema } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
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

  const { id } = await params;
  const parsedBrunchId = brunchIdSchema.safeParse(id);
  if (!parsedBrunchId.success) {
    return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse add-time request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = addTimeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await addTime(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      requestedById: session.user.id as UserId,
      scheduledAt: parsed.data.scheduledAt,
    },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can add times' }, { status: 403 });
      case 'brunch_not_active':
        return NextResponse.json({ error: 'Brunch is not open for changes' }, { status: 409 });
      case 'already_added':
        return NextResponse.json({ error: 'This time is already an option' }, { status: 409 });
      default:
        console.error('addTime failed', result.error);
        return NextResponse.json({ error: 'Failed to add time' }, { status: 500 });
    }
  }

  return NextResponse.json({ id: result.value.id }, { status: 201 });
}
