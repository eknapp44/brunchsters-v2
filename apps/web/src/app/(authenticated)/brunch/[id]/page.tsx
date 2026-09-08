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

  const [invites, pendingSuggestions] = brunch.isHost
    ? await Promise.all([
        getInvitesForBrunch({ brunchId, requestedById: viewerId }, { db }),
        getPendingSuggestionsForBrunch({ brunchId, requestedById: viewerId }, { db }),
      ])
    : [undefined, undefined];

  // brunch.isHost was just established via getBrunchById above, so these
  // should never fail — but if that invariant is ever violated, fail loudly
  // instead of silently omitting the panel with no trace.
  if (invites?.isErr()) {
    console.error('getInvitesForBrunch failed for a viewer flagged as host', invites.error);
  }
  if (pendingSuggestions?.isErr()) {
    console.error(
      'getPendingSuggestionsForBrunch failed for a viewer flagged as host',
      pendingSuggestions.error,
    );
  }

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
