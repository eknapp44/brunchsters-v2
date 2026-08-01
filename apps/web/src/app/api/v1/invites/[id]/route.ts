import { revokeInvite } from '@brunchsters/core';
import type { InviteId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const inviteIdSchema = z.uuid();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const parsedInviteId = inviteIdSchema.safeParse(id);
  if (!parsedInviteId.success) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  const result = await revokeInvite(
    { inviteId: parsedInviteId.data as InviteId, requestedById: session.user.id as UserId },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'invite_not_found':
        return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
      case 'not_host':
        return NextResponse.json({ error: 'Only the host can revoke invites' }, { status: 403 });
      default:
        console.error('revokeInvite failed', result.error);
        return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 });
    }
  }

  return new NextResponse(null, { status: 204 });
}
