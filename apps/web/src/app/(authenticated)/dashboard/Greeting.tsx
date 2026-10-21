'use client';

import { useSyncExternalStore } from 'react';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { eyebrowDate, greetingWord } from '@/lib/dashboardFormat';
import styles from './dashboard.module.css';

// Nothing changes while a person is looking: the greeting is a snapshot of the browser's clock,
// not a subscription.
const subscribe = (): (() => void) => () => undefined;

// What the browser's clock says, as "Afternoon|Wednesday, October 21". Kept for the current
// minute, because React asks twice per render and expects the same answer both times.
let cached: { readonly minute: number; readonly value: string } | undefined;
function getClientSnapshot(): string {
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60_000);
  if (cached?.minute !== minute) {
    cached = { minute, value: `${greetingWord(now.getHours())}|${eyebrowDate(now)}` };
  }
  return cached.value;
}

// The server does not know the viewer's time zone, so it renders a neutral greeting and no date,
// and the browser fills both in (ADR 0012). React reconciles without a hydration warning.
const getServerSnapshot = (): string => '';

export function Greeting(props: { readonly firstName: string }) {
  const snapshot = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const [word = 'Hey', date] = snapshot === '' ? [] : snapshot.split('|');
  const name = props.firstName === '' ? 'there' : props.firstName;

  return (
    <div>
      {/* the line keeps its height before the date arrives, so the page does not jump */}
      <Eyebrow>{date ?? ' '}</Eyebrow>
      <h1 className={styles.greeting}>
        {word}, {name}{' '}
        <span aria-hidden="true" className={styles.wave}>
          👋
        </span>
      </h1>
    </div>
  );
}
