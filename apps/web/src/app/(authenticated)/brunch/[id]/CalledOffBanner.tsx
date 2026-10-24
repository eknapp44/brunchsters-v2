import type { ReactElement } from 'react';
import { CALLED_OFF_HEADING, calledOffLine } from '@/lib/lifecycleCopy';
import styles from './detail.module.css';

// What the brunch page says once the host has called it off (spec 0013): in place of the
// celebration. Gentle, low-stakes and warm (Brand Voice: "Sam called it off. No worries — these
// things happen."). The page below it is read-only, so there is nothing for the banner to ask.
export function CalledOffBanner(props: {
  readonly isHost: boolean;
  readonly hostName: string;
}): ReactElement {
  return (
    <div className={`${styles.banner} ${styles.bannerOff}`}>
      <div>
        <h2>{CALLED_OFF_HEADING}</h2>
        <p>{calledOffLine({ isHost: props.isHost, hostName: props.hostName })}</p>
      </div>
    </div>
  );
}
