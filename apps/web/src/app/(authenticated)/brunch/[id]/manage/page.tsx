import {
  cancelNoticeWaitSeconds,
  canCallOff,
  getBrunchById,
  getBrunchVoting,
  getCancelNoticeAudience,
  getCancelWait,
  getInvitesForBrunch,
  isCancelNoticePending,
} from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { forbidden, notFound } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { Icon } from '@/components/icons/Icon';
import { PopIcon } from '@/components/icons/PopIcon';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Container } from '@/components/ui/Container';
import { db } from '@/lib/db';
import { DELETE_WAIT_POLICY } from '@/lib/lifecycleCopy';
import { getRateLimiter } from '@/lib/services';
import { CalledOffBanner } from '../CalledOffBanner';
import { OverBanner } from '../OverBanner';
import detail from '../detail.module.css';
import { ConfirmControl } from './ConfirmControl';
import { EndOfTheRoad } from './EndOfTheRoad';
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
  // Membership first: an outsider and a made-up id are both undefined here and get the same 404.
  // Only then a guest, who is told they may not (403).
  if (brunch === undefined) {
    notFound();
  }
  if (!brunch.isHost) {
    forbidden();
  }

  const voting = await getBrunchVoting({ brunchId, viewerId }, { db });
  if (voting === undefined) {
    // Same access rule as getBrunchById, which already succeeded above —
    // fail loudly rather than silently omitting everything with no trace.
    console.error('getBrunchVoting returned undefined for a viewer flagged as host');
  }

  // The ways this brunch can end (spec 0013, ADR 0015). Which of them are offered is core's rule
  // (`canCallOff`, `isCancelNoticePending`); the waits are the server's, asked of the same counters
  // that refuse, so they are the same in every tab and on every device.
  const now = new Date();
  const confirmedAt = voting?.times.options.find((option) => option.isConfirmed)?.scheduledAt;
  const callOffOffered = canCallOff({
    statusCode: brunch.statusCode,
    scheduledAt: confirmedAt,
    now,
  });
  const callOffWaitResult = callOffOffered
    ? await getCancelWait({ hostId: viewerId }, { rateLimiter: getRateLimiter() })
    : undefined;
  if (callOffWaitResult?.isErr()) {
    // The page still renders, with nothing held; the server still refuses when the button is pressed.
    console.error('getCancelWait failed: showing no wait', callOffWaitResult.error);
  }
  const audienceResult = callOffOffered
    ? await getCancelNoticeAudience({ brunchId }, { db })
    : undefined;
  const noticePending =
    brunch.cancelledAt !== undefined &&
    isCancelNoticePending({
      statusCode: brunch.statusCode,
      cancelledAt: brunch.cancelledAt,
      cancelNoticeSentAt: brunch.cancelNoticeSentAt,
      now,
    });
  const endOfTheRoad = (
    <EndOfTheRoad
      brunchId={brunchId}
      title={brunch.title}
      statusCode={brunch.statusCode}
      canCallOff={callOffOffered}
      audience={audienceResult?.isOk() ? audienceResult.value : 0}
      callOffWait={callOffWaitResult?.isOk() ? callOffWaitResult.value : undefined}
      deleteWait={
        noticePending && brunch.cancelledAt !== undefined
          ? {
              policy: DELETE_WAIT_POLICY,
              retryAfterSeconds: cancelNoticeWaitSeconds({ cancelledAt: brunch.cancelledAt, now }),
            }
          : undefined
      }
    />
  );

  // Called off: nothing to manage but the way back and the way out.
  if (brunch.statusCode === 'cancelled') {
    return (
      <Container as="main">
        <div className={styles.back}>
          <ButtonLink href={`/brunch/${brunchId}`} size="sm">
            <Icon name="arrowLeft" size={16} />
            Back to brunch
          </ButtonLink>
        </div>
        <div className={styles.header}>
          <h1>Manage: {brunch.title}</h1>
        </div>
        <CalledOffBanner isHost hostName={brunch.hostName} />
        {endOfTheRoad}
      </Container>
    );
  }

  // Over: the brunch happened. Nothing to manage, and nothing to call off.
  if (brunch.statusCode === 'completed') {
    return (
      <Container as="main">
        <div className={styles.back}>
          <ButtonLink href={`/brunch/${brunchId}`} size="sm">
            <Icon name="arrowLeft" size={16} />
            Back to brunch
          </ButtonLink>
        </div>
        <div className={styles.header}>
          <h1>Manage: {brunch.title}</h1>
        </div>
        <OverBanner isHost />
      </Container>
    );
  }

  if (brunch.statusCode === 'confirmed') {
    const confirmedLocation = voting?.locations.options.find((option) => option.isConfirmed);
    const confirmedTime = voting?.times.options.find((option) => option.isConfirmed);

    return (
      <Container as="main">
        <div className={styles.back}>
          <ButtonLink href={`/brunch/${brunchId}`} size="sm">
            <Icon name="arrowLeft" size={16} />
            Back to brunch
          </ButtonLink>
        </div>
        <div className={styles.header}>
          <h1>Manage: {brunch.title}</h1>
        </div>

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
                {confirmedTime.scheduledAt.toLocaleString('en-US', {
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

        {endOfTheRoad}
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
      <div className={styles.back}>
        <ButtonLink href={`/brunch/${brunchId}`} size="sm">
          <Icon name="arrowLeft" size={16} />
          Back to brunch
        </ButtonLink>
      </div>
      <div className={styles.header}>
        <h1>Manage: {brunch.title}</h1>
      </div>

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

      {endOfTheRoad}
    </Container>
  );
}
