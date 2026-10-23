import { setBrunchHidden } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';

const brunchIdSchema = z.uuid();
const hiddenRequestSchema = z.object({ hidden: z.boolean() });

// Hide a brunch from, or show it again on, the caller's own dashboard (spec 0013, ADR 0015). Any
// member, in any status; it changes nothing for anyone else. A person who is not in the brunch gets
// the same 404 as for a made-up id, so there is no 403 here.
export async function PUT(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse hide-brunch request body', cause);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = hiddenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await setBrunchHidden(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      viewerId: session.user.id as UserId,
      hidden: parsed.data.hidden,
    },
    { db },
  );

  if (result.isErr()) {
    switch (result.error.kind) {
      case 'brunch_not_found':
        return NextResponse.json({ error: 'Brunch not found' }, { status: 404 });
      default:
        console.error('setBrunchHidden failed', result.error);
        return NextResponse.json({ error: 'Failed to update the dashboard' }, { status: 500 });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
