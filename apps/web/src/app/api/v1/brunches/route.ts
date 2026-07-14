import {
  createBrunch,
  createBrunchRequestSchema,
  getBrunchesForUser,
  NoopEventBus,
} from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const eventBus = new NoopEventBus();

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createBrunchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }

  const result = await createBrunch(
    { ...parsed.data, hostId: session.user.id as UserId },
    { db, eventBus },
  );

  if (result.isErr()) {
    return NextResponse.json({ error: 'Failed to create brunch' }, { status: 500 });
  }

  return NextResponse.json(
    { id: result.value.id, title: parsed.data.title, status: 'draft' },
    { status: 201 },
  );
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (session === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const brunches = await getBrunchesForUser({ userId: session.user.id as UserId }, { db });

  return NextResponse.json({ brunches });
}
