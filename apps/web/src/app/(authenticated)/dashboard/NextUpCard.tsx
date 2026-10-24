import type { BrunchRoster, BrunchSummary, RosterState } from '@brunchsters/core';
import type { ReactElement } from 'react';
import { Icon } from '@/components/icons/Icon';
import { PopIcon } from '@/components/icons/PopIcon';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { HideControl } from '@/components/HideControl';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { statusTone } from '@/components/ui/statusTone';
import { dashboardStatusLabel } from '@/lib/brunchCopy';
import { silentLine } from '@/lib/brunchPageFormat';
import { closesIn, daysUntilLabel, formatWhen, goingLabel } from '@/lib/dashboardFormat';
import styles from './NextUpCard.module.css';

// Names shown before "+N more": all of them up to this many on a wide screen, three on a phone.
const DESKTOP_LIMIT = 8;
const PHONE_LIMIT = 3;

type Person = BrunchRoster['people'][number];

const STATE_WORDS: Readonly<Record<RosterState, string>> = {
  yes: 'Going',
  maybe: 'Maybe',
  no: "Can't make it",
  pending: "Hasn't said yet",
};

function Mark(props: { readonly state: RosterState }): ReactElement {
  if (props.state === 'yes') {
    return (
      <span className={styles.check}>
        <Icon name="check" size={14} />
        <span className={styles.srOnly}>{STATE_WORDS.yes}</span>
      </span>
    );
  }
  return <span className={styles.stateWord}>{STATE_WORDS[props.state].toLowerCase()}</span>;
}

// The roster is plain grouped text, not a list: the dashboard's journeys count `listitem`s, and
// the only list items on this page are the brunch rows.
function Roster(props: { readonly roster: BrunchRoster }): ReactElement {
  const { roster } = props;
  const people: readonly Person[] = roster.people;
  const shown = people.slice(0, DESKTOP_LIMIT);
  const moreOnDesktop = people.length - shown.length;
  const moreOnPhone = people.length - PHONE_LIMIT;
  // A member is told about the people who said no or have not answered only as numbers; the host
  // already has them in the list.
  const silent = roster.kind === 'member' ? silentLine(roster.counts) : undefined;

  return (
    <div className={styles.who}>
      <Eyebrow>Who&apos;s coming</Eyebrow>
      <div role="group" aria-label="Who's coming" className={styles.people}>
        {shown.map((person, index) => (
          <div
            key={`${person.name}-${person.colorIndex}-${index}`}
            className={
              index >= PHONE_LIMIT ? `${styles.person} ${styles.beyondPhone}` : styles.person
            }
          >
            <InitialsAvatar
              name={person.name}
              colorIndex={person.colorIndex}
              initials={person.initials}
              decorative
            />
            <span className={styles.name}>{person.name}</span>
            <Mark state={person.state} />
          </div>
        ))}
        {moreOnPhone > 0 && <div className={styles.morePhone}>+{moreOnPhone} more</div>}
        {moreOnDesktop > 0 && <div className={styles.moreDesktop}>+{moreOnDesktop} more</div>}
      </div>
      {silent !== undefined && <p className={styles.silent}>{silent}</p>}
    </div>
  );
}

// The feature card for the brunch coming up next: what it is and when, where, and who is
// coming. `roster` is undefined only if the roster could not be read; the card then has no
// right-hand panel.
export function NextUpCard(props: {
  readonly brunch: BrunchSummary;
  readonly roster: BrunchRoster | undefined;
  readonly now: Date;
}): ReactElement {
  const { brunch, now } = props;
  const confirmed = brunch.statusCode === 'confirmed' && brunch.scheduledAt !== undefined;
  const voting = brunch.statusCode === 'active' && !brunch.votingClosed;

  return (
    <div className={styles.feature}>
      <div className={styles.left}>
        <div className={styles.chips}>
          <Badge
            tone={statusTone(brunch.statusCode)}
            icon={confirmed ? <Icon name="check" size={12} /> : undefined}
          >
            {dashboardStatusLabel({ code: brunch.statusCode, lookupLabel: brunch.statusLabel })}
          </Badge>
          {confirmed && brunch.scheduledAt !== undefined && (
            <Badge>
              {daysUntilLabel({
                scheduledAt: brunch.scheduledAt,
                timeZone: brunch.timezone,
                now,
              })}
            </Badge>
          )}
          {voting && brunch.votingDeadline !== undefined && (
            <Badge>{capitalize(closesIn({ deadline: brunch.votingDeadline, now }))}</Badge>
          )}
          {brunch.isHost && <Badge>You&apos;re hosting</Badge>}
        </div>
        <h2 className={styles.title}>{brunch.title}</h2>
        <div className={styles.facts}>
          <div className={styles.fact}>
            <PopIcon name="calendar" size={28} />
            <span>
              {brunch.scheduledAt !== undefined
                ? formatWhen({ scheduledAt: brunch.scheduledAt, timeZone: brunch.timezone })
                : 'Time to be decided'}
            </span>
          </div>
          <div className={styles.fact}>
            <PopIcon name="pin" size={28} />
            <span>{brunch.placeName ?? 'Place to be decided'}</span>
          </div>
          <div className={styles.fact}>
            <PopIcon name="users" size={28} />
            <span>{goingLabel(brunch.goingCount)}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <ButtonLink
            href={`/brunch/${brunch.id}`}
            variant="primary"
            aria-label={`Open ${brunch.title}`}
          >
            Open
            <Icon name="arrowRight" size={16} />
          </ButtonLink>
          <HideControl brunchId={brunch.id} title={brunch.title} hidden={false} placement="row" />
        </div>
      </div>
      {props.roster !== undefined && <Roster roster={props.roster} />}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
