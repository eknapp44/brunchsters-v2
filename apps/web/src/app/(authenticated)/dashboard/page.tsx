import { getBrunchesForUser, getBrunchRoster, groupDashboard, limitPast } from '@brunchsters/core';
import { RefreshOnFocus } from '@/components/RefreshOnFocus';
import type { BrunchSummary } from '@brunchsters/core';
import { firstNameOf, PAST_BRUNCHES_SHOWN, type UserId } from '@brunchsters/shared';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BreakfastScene } from '@/components/art/BreakfastScene';
import { Icon } from '@/components/icons/Icon';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Container } from '@/components/ui/Container';
import { dashboardStatusLabel } from '@/lib/brunchCopy';
import { summaryLine } from '@/lib/dashboardFormat';
import { db } from '@/lib/db';
import styles from './dashboard.module.css';
import { Greeting } from './Greeting';
import { NextUpCard } from './NextUpCard';
import { UpcomingRow } from './UpcomingRow';

function PlanButton() {
  return (
    <ButtonLink href="/brunch/new" variant="primary">
      <Icon name="plus" size={16} />
      Plan a Brunch
    </ButtonLink>
  );
}

// The dashboard's own addresses: the full Past list and the Hidden list are server-rendered
// (`?past=all`, `?hidden=1`), so nothing about them lives in the browser.
function dashboardHref(params: { readonly pastAll: boolean; readonly hidden: boolean }): string {
  const query = [params.pastAll ? 'past=all' : undefined, params.hidden ? 'hidden=1' : undefined]
    .filter((part): part is string => part !== undefined)
    .join('&');
  return query === '' ? '/dashboard' : `/dashboard?${query}`;
}

function BrunchRows(props: {
  readonly brunches: readonly BrunchSummary[];
  readonly past: boolean;
  readonly now: Date;
  readonly inHiddenList?: boolean;
}) {
  return (
    <ul className={styles.list} role="list">
      {props.brunches.map((brunch) => (
        <UpcomingRow
          key={brunch.id}
          brunch={brunch}
          // The Copy Pass wording for every row, Past included: a called-off brunch reads "Called
          // off" here and on its own page. Statuses the Copy Pass leaves alone keep the lookup's.
          statusText={dashboardStatusLabel({
            code: brunch.statusCode,
            lookupLabel: brunch.statusLabel,
          })}
          past={props.past}
          now={props.now}
          {...(props.inHiddenList === true ? { inHiddenList: true } : {})}
        />
      ))}
    </ul>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly past?: string; readonly hidden?: string }>;
}) {
  const query = await searchParams;
  const showAllPast = query.past === 'all';
  const showHidden = query.hidden === '1';
  const session = await auth();
  if (session === null) {
    redirect('/sign-in');
  }

  const viewerId = session.user.id as UserId;
  const now = new Date();
  const brunches = await getBrunchesForUser({ userId: viewerId, now }, { db });
  const { nextUp, upcoming, past, hidden } = groupDashboard(brunches, now);
  const pastShown = limitPast(past, { showAll: showAllPast });
  const firstName = firstNameOf(session.user.name ?? '');

  if (brunches.length === 0) {
    return (
      <Container as="main">
        <RefreshOnFocus />
        <div className={styles.header}>
          <div>
            <Greeting firstName={firstName} />
            <p className={styles.summary}>{summaryLine({ comingUp: 0, votesWaiting: 0 }).before}</p>
          </div>
        </div>
        <div className={styles.empty}>
          <BreakfastScene />
          <h2>The table&apos;s set. Now invite some people.</h2>
          <p>Pick a spot, pick a time, send it. We&apos;ll handle the invites and the votes.</p>
          <PlanButton />
          <div className={styles.steps}>
            <span className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                1
              </span>
              Name it
            </span>
            <span className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                2
              </span>
              Pick spots and times
            </span>
            <span className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                3
              </span>
              Round up the crew
            </span>
          </div>
        </div>
      </Container>
    );
  }

  // The roster of the next-up brunch only: one more read, not one per brunch.
  const roster =
    nextUp === undefined
      ? undefined
      : await getBrunchRoster({ brunchId: nextUp.id, viewerId }, { db });
  const comingUp = (nextUp === undefined ? 0 : 1) + upcoming.length;
  const votesWaiting = [...(nextUp === undefined ? [] : [nextUp]), ...upcoming].filter(
    (brunch) => brunch.votesWaiting,
  ).length;
  const summary = summaryLine({ comingUp, votesWaiting });

  return (
    <Container as="main">
      <RefreshOnFocus />
      <div className={styles.header}>
        <div>
          <Greeting firstName={firstName} />
          <p className={styles.summary}>
            {summary.before}
            {summary.pill !== undefined && (
              <>
                {' '}
                <Badge tone="accent" icon={<Icon name="plus" size={12} />}>
                  {summary.pill}
                </Badge>{' '}
                {summary.after}
              </>
            )}
          </p>
        </div>
        <PlanButton />
      </div>

      {nextUp !== undefined && (
        <div className={styles.nextUp}>
          <NextUpCard brunch={nextUp} roster={roster} now={now} />
        </div>
      )}

      {upcoming.length > 0 ? (
        <section className={styles.section}>
          <h2>Upcoming</h2>
          <BrunchRows brunches={upcoming} past={false} now={now} />
        </section>
      ) : (
        nextUp === undefined && (
          <section className={styles.section}>
            <h2>Upcoming</h2>
            <p className={styles.muted}>No upcoming brunches.</p>
          </section>
        )
      )}

      {past.length > 0 && (
        <section className={styles.section}>
          <h2>Past</h2>
          <BrunchRows brunches={pastShown.shown} past now={now} />
          {pastShown.moreCount > 0 && (
            <div className={styles.more}>
              <ButtonLink
                href={dashboardHref({ pastAll: true, hidden: showHidden })}
                variant="ghost"
                size="sm"
              >
                Show all ({past.length})
              </ButtonLink>
            </div>
          )}
          {showAllPast && past.length > PAST_BRUNCHES_SHOWN && (
            <div className={styles.more}>
              <ButtonLink
                href={dashboardHref({ pastAll: false, hidden: showHidden })}
                variant="ghost"
                size="sm"
              >
                Show fewer
              </ButtonLink>
            </div>
          )}
        </section>
      )}

      {hidden.length > 0 && !showHidden && (
        <div className={styles.more}>
          <ButtonLink
            href={`${dashboardHref({ pastAll: showAllPast, hidden: true })}#hidden`}
            variant="ghost"
            size="sm"
          >
            Hidden ({hidden.length})
          </ButtonLink>
        </div>
      )}

      {hidden.length > 0 && showHidden && (
        <section id="hidden" className={styles.section}>
          <h2>Hidden</h2>
          <p className={styles.muted}>
            Off your dashboard, and only yours. Unhide one to bring it back.
          </p>
          <BrunchRows brunches={hidden} past={false} now={now} inHiddenList />
          <div className={styles.more}>
            <ButtonLink
              href={dashboardHref({ pastAll: showAllPast, hidden: false })}
              variant="ghost"
              size="sm"
            >
              Close
            </ButtonLink>
          </div>
        </section>
      )}
    </Container>
  );
}
