import type { BrunchDetail } from '@brunchsters/core';
import { avatarColorIndex } from '@brunchsters/shared';
import type { ReactElement } from 'react';
import { Icon } from '@/components/icons/Icon';
import { HideControl } from '@/components/HideControl';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { statusTone } from '@/components/ui/statusTone';
import { pageStatusLabel } from '@/lib/brunchCopy';
import { votesChip } from '@/lib/brunchPageFormat';
import { HIDDEN_LINE, HIDE_LINE } from '@/lib/lifecycleCopy';
import styles from './detail.module.css';

// The top of the brunch page: the way back (and, for the host, on to managing it), who asked
// you, the title, the status and what is going on with the vote, and the description.
//
// The status badge keeps the status lookup's exact label ("Active", "Draft", "Confirmed"): the
// exact-text rule and a great many journeys depend on it. The chip beside it is separate wording.
export function BrunchHeader(props: {
  readonly brunch: BrunchDetail;
  readonly brunchId: string;
  // whether voting is open right now (active, and not closed by the host or the deadline)
  readonly votingOpen: boolean;
  readonly now: Date;
}): ReactElement {
  const { brunch } = props;
  const hideHint = brunch.isHidden ? HIDDEN_LINE : HIDE_LINE;
  return (
    <div className={styles.top}>
      <div className={styles.topNav}>
        <ButtonLink href="/dashboard" size="sm">
          <Icon name="arrowLeft" size={16} />
          Back to Dashboard
        </ButtonLink>
        <div className={styles.topActions}>
          <HideControl
            brunchId={props.brunchId}
            title={brunch.title}
            hidden={brunch.isHidden}
            placement="page"
            hint={{ id: 'hide-hint', text: hideHint }}
          />
          {brunch.isHost && (
            <ButtonLink href={`/brunch/${props.brunchId}/manage`} size="sm">
              <Icon name="arrowRight" size={16} />
              Manage brunch
            </ButtonLink>
          )}
        </div>
      </div>
      <p id="hide-hint" className={styles.hideHint}>
        {hideHint}
      </p>

      {/* "wants you at brunch" would contradict the called-off banner below it. */}
      {!brunch.isHost && brunch.statusCode !== 'cancelled' && (
        <div className={styles.inviter}>
          <InitialsAvatar
            name={brunch.hostName}
            colorIndex={avatarColorIndex(brunch.hostName)}
            decorative
          />
          <span>
            <strong>{brunch.hostName}</strong> wants you at brunch
          </span>
        </div>
      )}

      <h1 className={styles.title}>{brunch.title}</h1>

      <div className={styles.chips}>
        <Badge tone={statusTone(brunch.statusCode)}>
          {pageStatusLabel({ code: brunch.statusCode, lookupLabel: brunch.statusLabel })}
        </Badge>
        {props.votingOpen && (
          <Badge icon={<Icon name="clock" size={12} />}>
            {votesChip({ deadline: brunch.votingDeadline, now: props.now })}
          </Badge>
        )}
        {brunch.isHost && <Badge>You&apos;re hosting</Badge>}
      </div>

      {brunch.description !== undefined && brunch.description.trim() !== '' && (
        <p className={styles.subtitle}>{brunch.description}</p>
      )}
    </div>
  );
}
