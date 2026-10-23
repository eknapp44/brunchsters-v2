import { deleteBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';

const brunchIdSchema = z.uuid();

// Delete a draft or a called-off brunch (spec 0013, ADR 0015). Host only. A soft delete: afterwards
// the brunch is a 404 for everyone, a second delete included.
export async function DELETE(
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

  const result = await deleteBrunch(
    { brunchId: parsedBrunchId.data as BrunchId, requestedById: session.user.id as UserId },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can delete a brunch' }, { status: 403 });
      case 'not_deletable':
        return NextResponse.json(
          { error: 'Call this brunch off before deleting it' },
          { status: 409 },
        );
      default:
        console.error('deleteBrunch failed', result.error);
        return NextResponse.json({ error: 'Failed to delete the brunch' }, { status: 500 });
    }
  }

  return new NextResponse(null, { status: 204 });
}
