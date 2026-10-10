import { removeTime } from '@brunchsters/core';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const idSchema = z.uuid();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; optionId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, optionId } = await params;
  const parsedBrunchId = idSchema.safeParse(id);
  const parsedTimeId = idSchema.safeParse(optionId);
  if (!parsedBrunchId.success || !parsedTimeId.success) {
    return NextResponse.json({ error: 'Time not found' }, { status: 404 });
  }

  const result = await removeTime(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      requestedById: session.user.id as UserId,
      timeId: parsedTimeId.data as BrunchTimeId,
    },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can remove times' }, { status: 403 });
      case 'brunch_not_active':
        return NextResponse.json({ error: 'Brunch is not open for changes' }, { status: 409 });
      case 'unknown_option':
        return NextResponse.json({ error: 'Time not found' }, { status: 404 });
      case 'option_confirmed':
        return NextResponse.json({ error: 'Cannot remove a confirmed time' }, { status: 409 });
      case 'last_option':
        return NextResponse.json(
          { error: 'Cannot remove the last remaining time' },
          { status: 409 },
        );
      default:
        console.error('removeTime failed', result.error);
        return NextResponse.json({ error: 'Failed to remove time' }, { status: 500 });
    }
  }

  return new NextResponse(null, { status: 204 });
}
