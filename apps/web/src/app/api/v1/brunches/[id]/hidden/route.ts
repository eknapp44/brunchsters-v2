import { setBrunchHidden } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
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
    console.error('Failed to parse hide-brunch request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = hiddenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
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
        return apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });
      default:
        console.error('setBrunchHidden failed', result.error);
        return apiError({
          code: 'internal',
          status: 500,
          message: 'Failed to update the dashboard',
        });
    }
  }

  return NextResponse.json(result.value, { status: 200 });
}
