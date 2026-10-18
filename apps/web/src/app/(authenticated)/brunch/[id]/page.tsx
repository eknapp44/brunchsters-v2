import {
  getBrunchById,
  getBrunchVoting,
  getInvitesForBrunch,
  getPendingSuggestionsForBrunch,
} from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { Icon } from '@/components/icons/Icon';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Container } from '@/components/ui/Container';
import { statusTone } from '@/components/ui/statusTone';
import { db } from '@/lib/db';
import { LocationBallotChecklist, TimeBallotChecklist } from './BallotChecklist';
import styles from './detail.module.css';
import { InvitePanel } from './InvitePanel';
import { LocationSuggestionControl, TimeSuggestionControl } from './OptionSuggestionControl';
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

  const voting = await getBrunchVoting({ brunchId, viewerId }, { db });
  if (voting === undefined) {
    // Same access rule as getBrunchById, which already succeeded above —
    // fail loudly rather than silently omitting voting with no trace.
    console.error('getBrunchVoting returned undefined for a viewer with confirmed access');
  }

  // Which candidate location's zone the time options' subline is shown
  // against: the confirmed location once there is one, else the first
  // candidate — a deliberate simplification documented in the M7 testing
  // notes (candidates may span multiple zones before voting closes).
  const representativeLocation =
    voting?.locations.options.find((option) => option.isConfirmed) ?? voting?.locations.options[0];

  return (
    <Container as="main">
      <div className={styles.header}>
        <h1>{brunch.title}</h1>
        <Badge tone={statusTone(brunch.statusCode)}>{brunch.statusLabel}</Badge>
      </div>
      <div className={styles.nav}>
        <ButtonLink href="/dashboard" size="sm">
          <Icon name="arrowLeft" size={16} />
          Back to Dashboard
        </ButtonLink>
        {brunch.isHost && (
          <ButtonLink href={`/brunch/${brunchId}/manage`} size="sm">
            <Icon name="arrowRight" size={16} />
            Manage brunch
          </ButtonLink>
        )}
      </div>

      <div className={styles.columns}>
        <div className={styles.column}>
          <RsvpControl brunchId={brunchId} currentStatus={brunch.viewerRsvpStatus} />

          {voting !== undefined && (
            <>
              <section className={styles.panel}>
                <h2>Locations</h2>
                <LocationBallotChecklist
                  brunchId={brunchId}
                  options={voting.locations.options}
                  canVote={voting.canVote}
                  closed={voting.locations.closed}
                  suggestionsEnabled={!brunch.isHost && brunch.allowLocationSuggestions}
                  votable={voting.locations.mode === 'group_vote'}
                />
              </section>

              <section className={styles.panel}>
                <h2>Times</h2>
                <TimeBallotChecklist
                  brunchId={brunchId}
                  options={voting.times.options}
                  canVote={voting.canVote}
                  closed={voting.times.closed}
                  suggestionsEnabled={!brunch.isHost && brunch.allowTimeSuggestions}
                  locationTimezone={representativeLocation?.timezone}
                  locationName={representativeLocation?.placeName}
                  votable={voting.times.mode === 'group_vote'}
                />
              </section>
            </>
          )}
        </div>

        <div className={styles.column}>
          {voting !== undefined && !brunch.isHost && (
            <>
              <LocationSuggestionControl
                brunchId={brunchId}
                canSuggest={brunch.allowLocationSuggestions && brunch.statusCode !== 'confirmed'}
                pendingSuggestions={voting.locations.pendingSuggestions}
              />
              <TimeSuggestionControl
                brunchId={brunchId}
                canSuggest={brunch.allowTimeSuggestions && brunch.statusCode !== 'confirmed'}
                pendingSuggestions={voting.times.pendingSuggestions}
              />
            </>
          )}

          <SuggestionsPanel
            brunchId={brunchId}
            canSuggest={!brunch.isHost && brunch.allowInviteSuggestions}
            pendingSuggestions={pendingSuggestions?.isOk() ? pendingSuggestions.value : undefined}
          />

          {invites?.isOk() && <InvitePanel brunchId={brunchId} invites={invites.value} />}
        </div>
      </div>
    </Container>
  );
}
