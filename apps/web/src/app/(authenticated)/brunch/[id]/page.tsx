import {
  barPercent,
  getBrunchById,
  getNotificationLevel,
  getBrunchRoster,
  getBrunchVoting,
  getInvitesForBrunch,
  getInviteWaits,
  getPendingSuggestionsForBrunch,
  leadingOptionId,
} from '@brunchsters/core';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { notFound } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';
import { z } from 'zod';
import { auth } from '@/auth';
import { Icon } from '@/components/icons/Icon';
import { Badge } from '@/components/ui/Badge';
import { Container } from '@/components/ui/Container';
import { closesIn } from '@/lib/dashboardFormat';
import { formatWhenLong } from '@/lib/brunchPageFormat';
import { db } from '@/lib/db';
import { getRateLimiter } from '@/lib/services';
import { LocationBallotChecklist, TimeBallotChecklist } from './BallotChecklist';
import { BrunchHeader } from './BrunchHeader';
import { CalledOffBanner } from './CalledOffBanner';
import { ConfirmedBanner } from './ConfirmedBanner';
import styles from './detail.module.css';
import { InvitePanel } from './InvitePanel';
import { NotificationLevelControl } from './NotificationLevelControl';
import { LocationSuggestionControl, TimeSuggestionControl } from './OptionSuggestionControl';
import { RsvpControl } from './RsvpControl';
import { SuggestionsPanel } from './SuggestionsPanel';
import { WhosComingPanel } from './WhosComingPanel';

const brunchIdSchema = z.uuid();

// An option list as the checklists draw it: each row gets its quiet bar's width, and the one
// option that is strictly ahead (if any) is named. Core decides both; this only passes them on.
function withBars<T extends { readonly id: string; readonly voteCount: number }>(
  options: readonly T[],
): { readonly options: readonly (T & { readonly barPercent: number })[]; readonly top: number } {
  const top = Math.max(0, ...options.map((option) => option.voteCount));
  return {
    top,
    options: options.map((option) => ({
      ...option,
      barPercent: barPercent({ voteCount: option.voteCount, topVoteCount: top }),
    })),
  };
}

// The header chip of a Where/When card: "Locked in" once confirmed, else how long voting has left.
// The "closes in" chip repeats the page header's, so a phone leaves it out.
function CardChip(props: {
  readonly confirmed: boolean;
  readonly votingOpen: boolean;
  readonly deadline: Date | undefined;
  readonly now: Date;
}): ReactElement | null {
  if (props.confirmed) {
    return (
      <Badge tone="mint" icon={<Icon name="check" size={12} />}>
        Locked in
      </Badge>
    );
  }
  if (props.votingOpen && props.deadline !== undefined) {
    const text = closesIn({ deadline: props.deadline, now: props.now });
    return (
      <span className={styles.phoneHiddenInline}>
        <Badge icon={<Icon name="clock" size={12} />}>
          {text.charAt(0).toUpperCase() + text.slice(1)}
        </Badge>
      </span>
    );
  }
  return null;
}

function CardResult(props: {
  readonly text: string;
  readonly detail?: string | undefined;
}): ReactElement {
  return (
    <div className={styles.result}>
      <p className={styles.resultText}>{props.text}</p>
      {props.detail !== undefined && <p className={styles.resultDetail}>{props.detail}</p>}
    </div>
  );
}

function Card(props: {
  readonly heading: string;
  readonly chip: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className={styles.panel}>
      <div className={styles.cardHead}>
        <h2>{props.heading}</h2>
        {props.chip}
      </div>
      {props.children}
    </section>
  );
}

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

  // The viewer's own mute level (spec 0015), read after membership is known. If it cannot be read the
  // page still renders, without the control.
  const notificationLevel = await getNotificationLevel({ brunchId, userId: viewerId }, { db });

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

  // What the host is waiting on (an invite that was just sent, the day's invites used up), asked of
  // the same counters that refuse, so every tab and device shows the same thing (ADR 0013 addendum).
  // Only the host gets this: the invite list above was host-only. If the counters cannot be read the
  // page still renders, with nothing held; the server still refuses when a button is pressed.
  const [voting, roster, inviteWaitsResult] = await Promise.all([
    getBrunchVoting({ brunchId, viewerId }, { db }),
    getBrunchRoster({ brunchId, viewerId }, { db }),
    invites?.isOk()
      ? getInviteWaits(
          { brunchId, hostId: viewerId, inviteIds: invites.value.map((invite) => invite.id) },
          { rateLimiter: getRateLimiter() },
        )
      : undefined,
  ]);
  if (inviteWaitsResult?.isErr()) {
    console.error('getInviteWaits failed: showing no waits', inviteWaitsResult.error);
  }
  const inviteWaits = inviteWaitsResult?.isOk() ? inviteWaitsResult.value : undefined;
  if (voting === undefined) {
    // Same access rule as getBrunchById, which already succeeded above —
    // fail loudly rather than silently omitting voting with no trace.
    console.error('getBrunchVoting returned undefined for a viewer with confirmed access');
  }
  if (roster === undefined) {
    console.error('getBrunchRoster returned undefined for a viewer with confirmed access');
  }

  const now = new Date();
  const confirmed = brunch.statusCode === 'confirmed';
  // Called off: the page is read-only. No RSVP, vote, suggestion or invite control is offered, and
  // the server would refuse them anyway (spec 0013, ADR 0015).
  const calledOff = brunch.statusCode === 'cancelled';
  const votingOpen =
    brunch.statusCode === 'active' && voting !== undefined && !voting.locations.closed;

  const confirmedLocation = voting?.locations.options.find((option) => option.isConfirmed);
  const confirmedTime = voting?.times.options.find((option) => option.isConfirmed);

  // Which candidate location's zone the time options' subline is shown
  // against: the confirmed location once there is one, else the first
  // candidate — a deliberate simplification documented in the M7 testing
  // notes (candidates may span multiple zones before voting closes).
  const representativeLocation = confirmedLocation ?? voting?.locations.options[0];

  const places = voting === undefined ? undefined : withBars(voting.locations.options);
  const times = voting === undefined ? undefined : withBars(voting.times.options);
  // A confirmed list has its winner; "leading" is only for a vote still being decided.
  const placeLeader =
    voting === undefined || places === undefined || confirmedLocation !== undefined
      ? undefined
      : leadingOptionId(places.options);
  const timeLeader =
    voting === undefined || times === undefined || confirmedTime !== undefined
      ? undefined
      : leadingOptionId(times.options);

  const goingNames =
    roster === undefined
      ? []
      : roster.people.filter((person) => person.state === 'yes').map((person) => person.name);

  return (
    <Container as="main">
      <BrunchHeader brunch={brunch} brunchId={brunchId} votingOpen={votingOpen} now={now} />

      {confirmed && <ConfirmedBanner goingNames={goingNames} />}
      {calledOff && <CalledOffBanner isHost={brunch.isHost} hostName={brunch.hostName} />}

      {!calledOff && <RsvpControl brunchId={brunchId} currentStatus={brunch.viewerRsvpStatus} />}

      <div className={styles.columns}>
        <div className={styles.column}>
          {voting !== undefined && places !== undefined && times !== undefined && (
            <>
              <Card
                heading="Where to?"
                chip={
                  <CardChip
                    confirmed={confirmedLocation !== undefined}
                    votingOpen={votingOpen}
                    deadline={brunch.votingDeadline}
                    now={now}
                  />
                }
              >
                {confirmedLocation !== undefined && (
                  <CardResult
                    text={confirmedLocation.placeName}
                    detail={confirmedLocation.placeAddress}
                  />
                )}
                <LocationBallotChecklist
                  brunchId={brunchId}
                  options={places.options}
                  canVote={voting.canVote && !calledOff}
                  closed={voting.locations.closed || calledOff}
                  suggestionsEnabled={
                    !brunch.isHost && brunch.allowLocationSuggestions && !calledOff
                  }
                  leadingId={placeLeader}
                  votable={voting.locations.mode === 'group_vote'}
                />
              </Card>

              <Card
                heading="When?"
                chip={
                  <CardChip
                    confirmed={confirmedTime !== undefined}
                    votingOpen={votingOpen}
                    deadline={brunch.votingDeadline}
                    now={now}
                  />
                }
              >
                {confirmedTime !== undefined && (
                  <CardResult
                    text={formatWhenLong({
                      scheduledAt: confirmedTime.scheduledAt,
                      timeZone: confirmedLocation?.timezone,
                    })}
                  />
                )}
                <TimeBallotChecklist
                  brunchId={brunchId}
                  options={times.options}
                  canVote={voting.canVote && !calledOff}
                  closed={voting.times.closed || calledOff}
                  suggestionsEnabled={!brunch.isHost && brunch.allowTimeSuggestions && !calledOff}
                  locationTimezone={representativeLocation?.timezone}
                  locationName={representativeLocation?.placeName}
                  leadingId={timeLeader}
                  votable={voting.times.mode === 'group_vote'}
                />
              </Card>
            </>
          )}
        </div>

        <div className={styles.column}>
          {roster !== undefined && <WhosComingPanel roster={roster} />}

          {voting !== undefined && !brunch.isHost && !calledOff && (
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

          {!calledOff && (
            <SuggestionsPanel
              brunchId={brunchId}
              sendWait={inviteWaits?.send}
              canSuggest={!brunch.isHost && brunch.allowInviteSuggestions}
              pendingSuggestions={pendingSuggestions?.isOk() ? pendingSuggestions.value : undefined}
            />
          )}

          {invites?.isOk() && !calledOff && (
            <InvitePanel
              brunchId={brunchId}
              invites={invites.value}
              sendWait={inviteWaits?.send}
              resendWaits={inviteWaits?.resend ?? {}}
            />
          )}

          {notificationLevel.isOk() && (
            <NotificationLevelControl
              brunchId={brunchId}
              initial={notificationLevel.value}
              isHost={brunch.isHost}
            />
          )}
        </div>
      </div>
    </Container>
  );
}
