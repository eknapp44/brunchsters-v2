import { countUnread } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { db } from '@/lib/db';

// The bell's number (spec 0015, ADR 0017): how many unread notifications the signed-in person has.
// It is keyed by the session and takes no id, so there is nothing to name and nothing to leak. A
// read, so it spends no write budget; it is one indexed count, which is why the badge may poll it
// about once a minute. Never cached: a stale zero is the one thing the bell must not show.
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const result = await countUnread({ userId: session.user.id as UserId }, { db });
  if (result.isErr()) {
    console.error('countUnread failed', result.error);
    return apiError({ code: 'internal', status: 500, message: 'Failed to count notifications' });
  }

  return NextResponse.json({ count: result.value }, { headers: { 'Cache-Control': 'no-store' } });
}
