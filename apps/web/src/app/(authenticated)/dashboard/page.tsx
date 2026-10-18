import { getBrunchesForUser } from '@brunchsters/core';
import type { BrunchSummary } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BreakfastScene } from '@/components/art/BreakfastScene';
import { Icon } from '@/components/icons/Icon';
import { PopIcon } from '@/components/icons/PopIcon';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';
import { db } from '@/lib/db';
import styles from './dashboard.module.css';

const UPCOMING_STATUS_CODES = new Set(['draft', 'active', 'confirmed']);

// How loudly a status is drawn; the label text always carries the meaning.
function badgeToneFor(statusCode: string): 'neutral' | 'accent' | 'mint' {
  if (statusCode === 'confirmed') return 'mint';
  if (statusCode === 'active') return 'accent';
  return 'neutral';
}

function BrunchCard({ brunch }: { readonly brunch: BrunchSummary }) {
  return (
    <li>
      <Card>
        <div className={styles.top}>
          <Link className={styles.title} href={`/brunch/${brunch.id}`}>
            {brunch.title}
          </Link>
          {brunch.isHost && <span className={styles.role}>(Host)</span>}
        </div>
        <div className={styles.meta}>
          <Badge tone={badgeToneFor(brunch.statusCode)}>{brunch.statusLabel}</Badge>
          <span className={styles.going}>
            <PopIcon name="users" size={20} />
            <span>{brunch.goingCount} going</span>
          </span>
        </div>
      </Card>
    </li>
  );
}

function BrunchList({ brunches }: { readonly brunches: readonly BrunchSummary[] }) {
  return (
    <ul className={styles.list} role="list">
      {brunches.map((brunch) => (
        <BrunchCard key={brunch.id} brunch={brunch} />
      ))}
    </ul>
  );
}

function PlanButton() {
  return (
    <ButtonLink href="/brunch/new" variant="primary">
      <Icon name="plus" size={16} />
      Plan a Brunch
    </ButtonLink>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (session === null) {
    redirect('/sign-in');
  }

  const brunches = await getBrunchesForUser({ userId: session.user.id as UserId }, { db });
  const upcoming = brunches.filter((b) => UPCOMING_STATUS_CODES.has(b.statusCode));
  const past = brunches.filter((b) => !UPCOMING_STATUS_CODES.has(b.statusCode));

  if (brunches.length === 0) {
    return (
      <Container as="main">
        <div className={styles.header}>
          <h1>Dashboard</h1>
        </div>
        <div className={styles.empty}>
          <BreakfastScene />
          <p>No brunches yet.</p>
          <PlanButton />
        </div>
      </Container>
    );
  }

  return (
    <Container as="main">
      <div className={styles.header}>
        <h1>Dashboard</h1>
        <PlanButton />
      </div>

      <section className={styles.section}>
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className={styles.muted}>No upcoming brunches.</p>
        ) : (
          <BrunchList brunches={upcoming} />
        )}
      </section>

      {past.length > 0 && (
        <section className={styles.section}>
          <h2>Past</h2>
          <BrunchList brunches={past} />
        </section>
      )}
    </Container>
  );
}
