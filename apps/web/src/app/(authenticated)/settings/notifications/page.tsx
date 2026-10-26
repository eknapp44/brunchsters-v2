import { getNotificationPreferences } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Container } from '@/components/ui/Container';
import { db } from '@/lib/db';
import {
  EMAIL_CAPTION,
  IN_APP_CAPTION,
  SETTINGS_BACK,
  SETTINGS_GROUPS,
  SETTINGS_HEADING,
  SETTINGS_INTRO,
} from '@/lib/notificationCopy';
import { PreferenceSwitch } from './PreferenceSwitch';
import styles from './settings.module.css';

// What the signed-in person hears about, and where (spec 0015, ADR 0017). Keyed by the session and
// naming no id, so there is nothing to look up or leak. Only things the app really does are here.
// A line that covers several types shows the first one's saved choice; the switches always save all
// of them together, so they only differ if a type was saved alone elsewhere.
export default async function NotificationSettingsPage() {
  const session = await auth();
  if (session === null) redirect('/sign-in');

  const result = await getNotificationPreferences({ userId: session.user.id as UserId }, { db });
  if (result.isErr())
    throw new Error('Could not read notification settings', { cause: result.error });
  const effective = result.value;

  return (
    <Container as="main" size="narrow">
      <div className={styles.header}>
        <h1>{SETTINGS_HEADING}</h1>
        <ButtonLink href="/notifications" variant="ghost" size="sm">
          {SETTINGS_BACK}
        </ButtonLink>
      </div>
      <p className={styles.intro}>{SETTINGS_INTRO}</p>

      {SETTINGS_GROUPS.map((group) => (
        <section key={group.heading} className={styles.group}>
          <h2>{group.heading}</h2>
          <ul className={styles.lines}>
            {group.lines.map((line) => {
              const first = line.types[0];
              const saved = first === undefined ? undefined : effective[first];
              return (
                <li key={line.id} className={styles.line}>
                  <span className={styles.label}>{line.label}</span>
                  <span className={styles.switches}>
                    <PreferenceSwitch
                      lineId={line.id}
                      label={line.label}
                      types={line.types}
                      channel="in_app"
                      caption={IN_APP_CAPTION}
                      initial={saved?.in_app ?? true}
                    />
                    {line.hasEmail && (
                      <PreferenceSwitch
                        lineId={line.id}
                        label={line.label}
                        types={line.types}
                        channel="email"
                        caption={EMAIL_CAPTION}
                        initial={saved?.email ?? true}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Container>
  );
}
