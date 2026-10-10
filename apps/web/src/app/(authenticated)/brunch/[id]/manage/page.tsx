import { getBrunchById, getBrunchVoting, getInvitesForBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { ConfirmControl } from './ConfirmControl';
import { OptionManager } from './OptionManager';
import { OptionSuggestionReview } from './OptionSuggestionReview';
import { VotingControls } from './VotingControls';

const brunchIdSchema = z.uuid();

export default async function ManageBrunchPage({
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
  if (brunch === undefined || !brunch.isHost) {
    notFound();
  }

  const voting = await getBrunchVoting({ brunchId, viewerId }, { db });
  if (voting === undefined) {
    // Same access rule as getBrunchById, which already succeeded above —
    // fail loudly rather than silently omitting everything with no trace.
    console.error('getBrunchVoting returned undefined for a viewer flagged as host');
  }

  if (brunch.statusCode === 'confirmed') {
    const confirmedLocation = voting?.locations.options.find((option) => option.isConfirmed);
    const confirmedTime = voting?.times.options.find((option) => option.isConfirmed);

    return (
      <main>
        <h1>Manage: {brunch.title}</h1>
        <Link href={`/brunch/${brunchId}`}>← Back to brunch</Link>

        <section>
          <h2>Confirmed</h2>
          {confirmedLocation !== undefined && (
            <p>
              {confirmedLocation.placeName} — {confirmedLocation.placeAddress}
            </p>
          )}
          {confirmedTime !== undefined && (
            <p>
              {confirmedTime.scheduledAt.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
                // PLANNING §9.3: times render in the location's zone once
                // confirmed. This is a server component with no client-side
                // correction pass, so `undefined` here would resolve to the
                // *server's* zone (UTC in production), not the viewer's or
                // the location's — silently showing the wrong confirmed time
                // (architect review, F5).
                timeZone: confirmedLocation?.timezone,
              })}
            </p>
          )}
        </section>
      </main>
    );
  }

  const invites = await getInvitesForBrunch({ brunchId, requestedById: viewerId }, { db });
  if (invites.isErr()) {
    console.error('getInvitesForBrunch failed for a viewer flagged as host', invites.error);
  }
  const noOneElseAccepted = invites.isOk()
    ? !invites.value.some((invite) => invite.status === 'yes')
    : false;

  return (
    <main>
      <h1>Manage: {brunch.title}</h1>
      <Link href={`/brunch/${brunchId}`}>← Back to brunch</Link>

      {voting !== undefined && (
        <>
          <OptionManager
            brunchId={brunchId}
            locations={voting.locations.options}
            times={voting.times.options}
          />

          <VotingControls
            brunchId={brunchId}
            votingDeadline={brunch.votingDeadline}
            closed={voting.locations.closed}
            locationsShouldSuggestClosing={voting.locations.shouldSuggestClosing}
            timesShouldSuggestClosing={voting.times.shouldSuggestClosing}
          />

          <ConfirmControl
            brunchId={brunchId}
            locations={voting.locations.options}
            times={voting.times.options}
            noOneElseAccepted={noOneElseAccepted}
          />

          <OptionSuggestionReview
            locationSuggestions={voting.locations.pendingSuggestions}
            timeSuggestions={voting.times.pendingSuggestions}
          />
        </>
      )}
    </main>
  );
}
