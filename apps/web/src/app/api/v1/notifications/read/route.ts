import { markAllRead, markRead } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { db } from '@/lib/db';
import { enforceWriteLimit } from '@/lib/rateLimit';

// Named notifications, or all of them. The ids are only strings here: one that is not a UUID, not
// the caller's, or not a notification at all is answered the same way (it marks nothing), so this
// route cannot be used to ask whether a notification id exists.
const MAX_IDS = 100;
const readRequestSchema = z.union([
  z.object({ ids: z.array(z.string().max(64)).min(1).max(MAX_IDS) }),
  z.object({ all: z.literal(true) }),
]);

// Marks the signed-in person's notifications read (spec 0015, ADR 0017). Keyed by the session, never
// by an id the caller named: every id is matched together with their own id in the service.
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse mark-read request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = readRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const userId = session.user.id as UserId;
  const result =
    'all' in parsed.data
      ? await markAllRead({ userId }, { db })
      : await markRead({ userId, ids: parsed.data.ids }, { db });

  if (result.isErr()) {
    console.error('Marking notifications read failed', result.error);
    return apiError({ code: 'internal', status: 500, message: 'Failed to mark as read' });
  }

  return NextResponse.json(result.value, { status: 200 });
}
