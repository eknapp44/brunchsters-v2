import Link from 'next/link';
import type { ReactElement } from 'react';
import { auth } from '@/auth';
import { BreakfastScene } from '@/components/art/BreakfastScene';
import { Icon } from '@/components/icons/Icon';
import { PopIcon, type PopIconName } from '@/components/icons/PopIcon';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import styles from './landing.module.css';

// What the landing page promises is only what the app does today: picking a place and a time
// (one or several, to vote on), inviting by link or email, and a voting deadline that closes the
// vote and tells everyone when it is locked in. Reminders, plus-ones and Apple sign-in are in the
// prototype's copy but are not built, so they are not said here.
const STEPS: readonly {
  readonly icon: PopIconName;
  readonly title: string;
  readonly body: string;
}[] = [
  {
    icon: 'pin',
    title: 'Pick a spot. Or a few.',
    body: "Lock in your go-to place, or toss in a couple and we'll let the gang vote. Group consensus, minus the 47-message thread.",
  },
  {
    icon: 'users',
    title: 'Round up the crew.',
    body: 'Send invites by link or email. Friends RSVP without downloading anything.',
  },
  {
    icon: 'check',
    title: 'Show up. Eat eggs.',
    body: "We close the vote at your deadline and tell everyone when it's locked in. You handle ordering the second cappuccino.",
  },
];

function Step(props: {
  readonly number: number;
  readonly icon: PopIconName;
  readonly title: string;
  readonly body: string;
}): ReactElement {
  return (
    <div className={styles.step}>
      <div className={styles.stepHead}>
        <PopIcon name={props.icon} size={32} />
        <span className={styles.stepNumber} aria-hidden="true">
          {props.number}
        </span>
      </div>
      <h3>{props.title}</h3>
      <p>{props.body}</p>
    </div>
  );
}

export default async function Home() {
  const session = await auth();
  const signedIn = session !== null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.copy}>
            <Eyebrow>For groups who keep saying &ldquo;we should brunch&rdquo;</Eyebrow>
            <h1 className={styles.headline}>
              Your friends are hungry. Probably.{' '}
              <span aria-hidden="true" className={styles.emoji}>
                🥂
              </span>
            </h1>
            <p className={styles.sub}>
              Plan brunch with the gang in 30 seconds. Pick a spot, pick a time, send it. We&apos;ll
              handle the invites, the votes, and the inevitable &ldquo;what about Tartine?&rdquo;
              debate.
            </p>
            {signedIn ? (
              <div className={styles.actions}>
                <ButtonLink href="/dashboard" variant="primary" size="lg">
                  Go to dashboard
                </ButtonLink>
              </div>
            ) : (
              <>
                <div className={styles.actions}>
                  <ButtonLink href="/sign-in" variant="primary" size="lg">
                    <Icon name="plus" size={16} />
                    Round up the crew
                  </ButtonLink>
                  <ButtonLink href="#how" size="lg">
                    See how
                    <Icon name="arrowRight" size={16} />
                  </ButtonLink>
                </div>
                <p className={styles.note}>
                  No app to download. Already in? <Link href="/sign-in">Sign in</Link>
                </p>
              </>
            )}
          </div>
          <div className={styles.scene}>
            <BreakfastScene />
          </div>
        </div>
      </section>

      <section id="how" className={styles.how}>
        <div className={styles.howInner}>
          <Eyebrow>How it works</Eyebrow>
          <h2 className={styles.howTitle}>
            Three taps. Brunch on.{' '}
            <span aria-hidden="true" className={styles.emoji}>
              💕
            </span>
          </h2>
          <p className={styles.howSub}>
            The whole point is to stop talking about brunch and actually do it. Here&apos;s how the
            gang gets to a table together.
          </p>
          <div className={styles.steps}>
            {STEPS.map((step, index) => (
              <Step key={step.title} number={index + 1} {...step} />
            ))}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        © {new Date().getFullYear()} Brunchsters · Made for people who keep saying &ldquo;we should
        brunch&rdquo;.
      </footer>
    </main>
  );
}
