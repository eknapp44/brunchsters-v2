'use client';

import { useState, type ReactElement } from 'react';
import { LEVEL_HEADING, LEVEL_HOST_NOTE, LEVEL_OPTIONS } from '@/lib/notificationCopy';
import { useMutation } from '@/store/useMutation';
import styles from './detail.module.css';

type Level = (typeof LEVEL_OPTIONS)[number]['code'];

// How much this brunch may say to the person looking at it (spec 0015, ADR 0017): all, just big
// stuff, or muted. It takes effect when chosen and goes back, with a toast, if the route says no. It
// is the person's own and changes nothing for anyone else. The section is the target of the
// "Mute this brunch" link in every email about the brunch (#notifications).
export function NotificationLevelControl(props: {
  readonly brunchId: string;
  readonly initial: Level;
  readonly isHost: boolean;
}): ReactElement {
  const [level, setLevel] = useState<Level>(props.initial);
  const { pending, run } = useMutation(`notification-level:${props.brunchId}`);

  async function choose(next: Level): Promise<void> {
    if (pending || next === level) return;
    const before = level;
    setLevel(next);
    const result = await run({
      request: {
        url: `/api/v1/brunches/${props.brunchId}/notification-level`,
        method: 'PUT',
        body: { level: next },
      },
      failure: 'toast',
    });
    if (!result.ok) setLevel(before);
  }

  return (
    <section id="notifications" className={styles.panel}>
      <fieldset className={styles.levelGroup} {...(pending ? { 'aria-busy': true } : {})}>
        <legend>{LEVEL_HEADING}</legend>
        {LEVEL_OPTIONS.map((option) => (
          <label key={option.code} className={styles.levelOption}>
            <input
              type="radio"
              name={`notification-level-${props.brunchId}`}
              value={option.code}
              checked={level === option.code}
              {...(pending ? { 'aria-disabled': true } : {})}
              onChange={() => void choose(option.code)}
            />
            <span>
              <span className={styles.levelLabel}>{option.label}</span>
              <span className={styles.levelHint}>{option.hint}</span>
            </span>
          </label>
        ))}
        {props.isHost && <p className={styles.levelHint}>{LEVEL_HOST_NOTE}</p>}
      </fieldset>
    </section>
  );
}
