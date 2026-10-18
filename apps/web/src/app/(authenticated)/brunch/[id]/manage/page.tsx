import { getBrunchById, getBrunchVoting, getInvitesForBrunch } from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { Icon } from '@/components/icons/Icon';
import { PopIcon } from '@/components/icons/PopIcon';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Container } from '@/components/ui/Container';
import { db } from '@/lib/db';
import detail from '../detail.module.css';
import { ConfirmControl } from './ConfirmControl';
import styles from './manage.module.css';
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
      <Container as="main">
        <div className={styles.header}>
          <h1>Manage: {brunch.title}</h1>
        </div>
        <ButtonLink href={`/brunch/${brunchId}`} size="sm">
          <Icon name="arrowLeft" size={16} />
          Back to brunch
        </ButtonLink>

        <section className={detail.panel}>
          <h2>Confirmed</h2>
          {confirmedLocation !== undefined && (
            <p className={styles.fact}>
              <PopIcon name="pin" size={22} />
              <span>
                {confirmedLocation.placeName} — {confirmedLocation.placeAddress}
              </span>
            </p>
          )}
          {confirmedTime !== undefined && (
            <p className={styles.fact}>
              <PopIcon name="clock" size={22} />
              <span>
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
              </span>
            </p>
          )}
        </section>
      </Container>
    );
  }

  const invites = await getInvitesForBrunch({ brunchId, requestedById: viewerId }, { db });
  if (invites.isErr()) {
    console.error('getInvitesForBrunch failed for a viewer flagged as host', invites.error);
  }
  const noOneElseAccepted = invites.isOk()
    ? !invites.value.some((invite) => invite.status === 'yes')
    : false;
  // A draft brunch has had no invites sent yet. Adding or removing options and confirming all
  // need an active brunch (the first invite activates it), so those controls are shown but
  // disabled, with an explanation, instead of failing with a generic error.
  const isDraft = brunch.statusCode === 'draft';

  return (
    <Container as="main">
      <div className={styles.header}>
        <h1>Manage: {brunch.title}</h1>
      </div>
      <ButtonLink href={`/brunch/${brunchId}`} size="sm">
        <Icon name="arrowLeft" size={16} />
        Back to brunch
      </ButtonLink>

      {isDraft && (
        <section className={detail.panel}>
          <h2>Send an invite first</h2>
          <p>
            This brunch is still a draft. You can add or remove places and times, close voting, and
            confirm, once you have invited at least one person.
          </p>
          <div className={detail.choices}>
            <ButtonLink href={`/brunch/${brunchId}`} variant="primary" size="sm">
              Invite people from the brunch page
            </ButtonLink>
          </div>
        </section>
      )}

      {voting !== undefined && (
        <div className={detail.columns}>
          <div className={detail.column}>
            <OptionManager
              brunchId={brunchId}
              locations={voting.locations.options}
              times={voting.times.options}
              disabled={isDraft}
            />
          </div>

          <div className={detail.column}>
            <VotingControls
              brunchId={brunchId}
              votingDeadline={brunch.votingDeadline}
              closed={voting.locations.closed}
              locationsShouldSuggestClosing={voting.locations.shouldSuggestClosing}
              timesShouldSuggestClosing={voting.times.shouldSuggestClosing}
              canClose={!isDraft}
            />

            <ConfirmControl
              brunchId={brunchId}
              locations={voting.locations.options}
              times={voting.times.options}
              noOneElseAccepted={noOneElseAccepted && !isDraft}
              disabled={isDraft}
            />

            <OptionSuggestionReview
              locationSuggestions={voting.locations.pendingSuggestions}
              timeSuggestions={voting.times.pendingSuggestions}
            />
          </div>
        </div>
      )}
    </Container>
  );
}
