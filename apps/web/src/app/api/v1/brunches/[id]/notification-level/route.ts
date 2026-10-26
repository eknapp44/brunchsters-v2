import { setNotificationLevel } from '@brunchsters/core';
import { NOTIFICATION_LEVEL_CODES, type BrunchId, type UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { db } from '@/lib/db';
import { enforceWriteLimit } from '@/lib/rateLimit';

const brunchIdSchema = z.uuid();
const levelRequestSchema = z.object({ level: z.enum(NOTIFICATION_LEVEL_CODES) });

// Mutes or unmutes a brunch for the caller alone (spec 0015, ADR 0017): all, just big stuff, or
// muted. Any member, the host too; it changes nothing for anyone else. A person who is not in the
// brunch gets the same 404 as for a made-up id, so there is no 403 here (the service's one lookup
// is the membership check and the write at once).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const limited = await enforceWriteLimit(session.user.id);
  if (limited !== undefined) return limited;

  const { id } = await params;
  const parsedBrunchId = brunchIdSchema.safeParse(id);
  if (!parsedBrunchId.success) {
    return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (cause) {
    console.error('Failed to parse notification-level request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = levelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await setNotificationLevel(
    {
      brunchId: parsedBrunchId.data as BrunchId,
      userId: session.user.id as UserId,
      level: parsed.data.level,
    },
    { db },
  );

  if (result.isErr()) {
    if (result.error.kind === 'brunch_not_found') {
      return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
    }
    console.error('setNotificationLevel failed', result.error);
    return apiError({
      code: 'internal',
      status: 500,
      message: 'Failed to update the notifications',
    });
  }

  return NextResponse.json(result.value, { status: 200 });
}
