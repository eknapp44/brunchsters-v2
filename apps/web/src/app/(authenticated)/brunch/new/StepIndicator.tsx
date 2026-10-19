import type { ReactElement } from 'react';
import { PopIcon, type PopIconName } from '@/components/icons/PopIcon';
import styles from './StepIndicator.module.css';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { step: 1, label: 'What', icon: 'egg' },
  { step: 2, label: 'Where', icon: 'pin' },
  { step: 3, label: 'When', icon: 'clock' },
  { step: 4, label: 'Who', icon: 'users' },
] as const satisfies readonly {
  readonly step: Step;
  readonly label: string;
  readonly icon: PopIconName;
}[];

const LABELS: Readonly<Record<Step, string>> = { 1: 'What', 2: 'Where', 3: 'When', 4: 'Who' };

// Where the host is in the four steps. It only reads the wizard's current step; it adds no
// state and no events. A progress bar rather than a list on purpose: the journeys count the
// page's list items (the places, times and addresses added), so this must not add any.
// None of its words repeat a field's label ("Title", "Description"), for the same reason.
export function StepIndicator(props: { readonly step: Step }): ReactElement {
  const { step } = props;
  const fill = ((step - 0.5) / STEPS.length) * 100;

  return (
    <div
      className={styles.indicator}
      role="progressbar"
      aria-label="Brunch planning progress"
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-valuenow={step}
      aria-valuetext={`Step ${step} of ${STEPS.length}: ${LABELS[step]}`}
    >
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${fill}%` }} />
      </div>
      {STEPS.map((item) => (
        <div
          key={item.step}
          className={[
            styles.step,
            item.step === step ? styles.current : undefined,
            item.step > step ? styles.ahead : undefined,
          ]
            .filter((name): name is string => name !== undefined)
            .join(' ')}
          aria-hidden="true"
        >
          <span className={styles.plate}>
            <PopIcon name={item.icon} size={24} />
          </span>
          <span className={styles.label}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
