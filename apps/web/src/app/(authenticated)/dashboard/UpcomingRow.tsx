import type { BrunchSummary } from '@brunchsters/core';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Icon } from '@/components/icons/Icon';
import { PopIcon } from '@/components/icons/PopIcon';
import { Badge } from '@/components/ui/Badge';
import { DateTile } from '@/components/ui/DateTile';
import { statusTone } from '@/components/ui/statusTone';
import { goingLabel, rowLine } from '@/lib/dashboardFormat';
import styles from './UpcomingRow.module.css';

// One brunch in a list: its day as a tile, its title (the whole row is the link), one line about
// it, and its status and head count. The only list item on the dashboard besides its siblings:
// journeys count rows by role, so nothing else on the page is a `listitem`.
export function UpcomingRow(props: {
  readonly brunch: BrunchSummary;
  // the status as worded for this list (the Copy Pass wording for upcoming, the lookup label for past)
  readonly statusText: string;
  readonly past: boolean;
  readonly now: Date;
}): ReactElement {
  const { brunch } = props;
  return (
    <li className={props.past ? `${styles.row} ${styles.past}` : styles.row}>
      <DateTile date={brunch.scheduledAt} timeZone={brunch.timezone} muted={props.past} />
      <div className={styles.main}>
        <div className={styles.titleLine}>
          <Link className={styles.title} href={`/brunch/${brunch.id}`}>
            {brunch.title}
          </Link>
          {brunch.isHost && <span className={styles.role}>(Host)</span>}
        </div>
        <div className={styles.line}>
          {rowLine({
            description: brunch.description,
            placeName: brunch.placeName,
            statusCode: brunch.statusCode,
            votingClosed: brunch.votingClosed,
            votingDeadline: brunch.votingDeadline,
            now: props.now,
          })}
        </div>
      </div>
      <div className={styles.meta}>
        <Badge tone={statusTone(brunch.statusCode)}>{props.statusText}</Badge>
        <span className={styles.going}>
          <PopIcon name="users" size={20} />
          <span>{goingLabel(brunch.goingCount)}</span>
        </span>
      </div>
      <span className={styles.arrow}>
        <Icon name="arrowRight" size={18} />
      </span>
    </li>
  );
}
