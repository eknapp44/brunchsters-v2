import {
  getBrunchById,
  getInvitesForBrunch,
  getPendingSuggestionsForBrunch,
} from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { InvitePanel } from './InvitePanel';
import { RsvpControl } from './RsvpControl';
import { SuggestionsPanel } from './SuggestionsPanel';

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

  const viewerId = session.user.id as UserId;
  const brunchId = parsedId.data as BrunchId;

  const brunch = await getBrunchById({ brunchId, viewerId }, { db });
  if (brunch === undefined) {
    notFound();
  }

  const invites = brunch.isHost
    ? await getInvitesForBrunch({ brunchId, requestedById: viewerId }, { db })
    : undefined;

  const pendingSuggestions = brunch.isHost
    ? await getPendingSuggestionsForBrunch({ brunchId, requestedById: viewerId }, { db })
    : undefined;

  return (
    <main>
      <h1>{brunch.title}</h1>
      <p>{brunch.statusLabel}</p>
      <Link href="/dashboard">← Back to Dashboard</Link>

      <RsvpControl brunchId={brunchId} currentStatus={brunch.viewerRsvpStatus} />

      <SuggestionsPanel
        brunchId={brunchId}
        canSuggest={!brunch.isHost && brunch.allowInviteSuggestions}
        pendingSuggestions={pendingSuggestions?.isOk() ? pendingSuggestions.value : undefined}
      />

      {invites?.isOk() && <InvitePanel brunchId={brunchId} invites={invites.value} />}
    </main>
  );
}
