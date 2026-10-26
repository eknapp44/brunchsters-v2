import { setNotificationPreferences } from '@brunchsters/core';
import {
  NOTIFICATION_CHANNEL_CODES,
  NOTIFICATION_TYPE_CODES,
  type UserId,
} from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { db } from '@/lib/db';
import { enforceWriteLimit } from '@/lib/rateLimit';

// One switch on the settings page: which types it governs (a line can cover several), which channel,
// and whether it is on. What a type may be asked for (one nothing produces, an email where none
// exists) is the service's rule, answered as `invalid`.
const preferenceRequestSchema = z.object({
  types: z.array(z.enum(NOTIFICATION_TYPE_CODES)).min(1).max(NOTIFICATION_TYPE_CODES.length),
  channel: z.enum(NOTIFICATION_CHANNEL_CODES),
  enabled: z.boolean(),
});

// Saves the signed-in person's own switch (spec 0015, ADR 0017). It is keyed by the session and
// names no id of anyone else's, so there is nothing to probe: the only brunch-free write a person
// can make to their own account.
export async function PUT(request: Request): Promise<NextResponse> {
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
    console.error('Failed to parse notification-preference request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = preferenceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await setNotificationPreferences(
    { userId: session.user.id as UserId, ...parsed.data },
    { db },
  );

  if (result.isErr()) {
    if (result.error.kind === 'invalid_selection') {
      return apiError({ code: 'invalid', status: 422, message: 'That switch does not exist' });
    }
    console.error('setNotificationPreferences failed', result.error);
    return apiError({ code: 'internal', status: 500, message: 'Failed to save the switch' });
  }

  return NextResponse.json(parsed.data, { status: 200 });
}
