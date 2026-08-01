import { getBrunchById } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const brunchIdSchema = z.uuid();

export default async function BrunchDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const parsedId = brunchIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const session = await auth();
  if (session === null) {
    notFound();
  }

  const brunch = await getBrunchById(
    { brunchId: parsedId.data as BrunchId, viewerId: session.user.id as UserId },
    { db },
  );
  if (brunch === undefined) {
    notFound();
  }

  return (
    <main>
      <h1>{brunch.title}</h1>
      <p>{brunch.statusLabel}</p>
      <Link href="/dashboard">← Back to Dashboard</Link>
    </main>
  );
}
