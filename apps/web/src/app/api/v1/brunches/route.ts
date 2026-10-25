import { createBrunch, createBrunchRequestSchema, getBrunchesForUser } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiError } from '@/lib/apiErrorResponse';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

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
    console.error('Failed to parse brunch creation request body', cause);
    return apiError({ code: 'invalid', status: 400, message: 'Invalid JSON body' });
  }

  const parsed = createBrunchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: 'invalid',
      status: 422,
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  const result = await createBrunch(
    { ...parsed.data, hostId: session.user.id as UserId },
    { db, eventBus },
  );

  if (result.isErr()) {
    console.error('createBrunch failed', result.error);
    return apiError({ code: 'internal', status: 500, message: 'Failed to create brunch' });
  }

  return NextResponse.json(
    { id: result.value.id, title: parsed.data.title, status: 'draft' },
    { status: 201 },
  );
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return apiError({ code: 'signed_out', status: 401, message: 'Unauthorized' });
  }

  const brunches = await getBrunchesForUser({ userId: session.user.id as UserId }, { db });

  return NextResponse.json({ brunches });
}
