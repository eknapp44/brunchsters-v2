import type { BrunchRoster, RosterState } from '@brunchsters/core';
import type { ReactElement } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { rosterSummary, silentLine } from '@/lib/brunchPageFormat';
import styles from './detail.module.css';

const STATE_LABEL: Readonly<Record<RosterState, string>> = {
  yes: 'Yes',
  maybe: 'Maybe',
  no: "Can't make it",
  pending: "Hasn't said yet",
};

function StateBadge(props: { readonly state: RosterState }): ReactElement {
  if (props.state === 'yes') {
    return (
      <Badge tone="mint" icon={<Icon name="check" size={12} />}>
        {STATE_LABEL.yes}
      </Badge>
    );
  }
  return (
    <Badge tone={props.state === 'maybe' ? 'accent' : 'neutral'}>{STATE_LABEL[props.state]}</Badge>
  );
}

// Who is coming, as the roster allows this viewer to see it (getBrunchRoster decides, this only
// draws): the host sees everyone with their answers; any other member sees first names and last
// initials for yes and maybe, and the rest only as numbers underneath.
//
// Plain grouped text, not a list: journeys find the invite rows below by role, and a pending
// person's address would otherwise be two list items.
export function WhosComingPanel(props: { readonly roster: BrunchRoster }): ReactElement {
  const { roster } = props;
  const silent = roster.kind === 'member' ? silentLine(roster.counts) : undefined;
  return (
    <section className={styles.panel}>
      <div className={styles.cardHead}>
        <h2>Who&apos;s coming</h2>
        <span className={styles.summary}>{rosterSummary(roster.counts)}</span>
      </div>
      <div role="group" aria-label="Who's coming" className={styles.roster}>
        {roster.people.map((person, index) => (
          <div key={`${person.name}-${person.colorIndex}-${index}`} className={styles.rosterRow}>
            <InitialsAvatar
              name={person.name}
              colorIndex={person.colorIndex}
              initials={person.initials}
              decorative
            />
            <span className={styles.rosterName}>{person.name}</span>
            <StateBadge state={person.state} />
          </div>
        ))}
      </div>
      {silent !== undefined && <p className={styles.muted}>{silent}</p>}
    </section>
  );
}
