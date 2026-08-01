import { getBrunchesForUser } from '@brunchsters/core';
import type { BrunchSummary } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const UPCOMING_STATUS_CODES = new Set(['draft', 'active', 'confirmed']);

function BrunchCard({ brunch }: { readonly brunch: BrunchSummary }) {
  return (
    <li>
      <Link href={`/brunch/${brunch.id}`}>{brunch.title}</Link>
      {brunch.isHost && <span> (Host)</span>}
      <span> — {brunch.statusLabel}</span>
      <span> — {brunch.goingCount} going</span>
    </li>
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
      <main>
        <h1>Dashboard</h1>
        <p>No brunches yet.</p>
        <Link href="/brunch/new">Plan a Brunch</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <Link href="/brunch/new">Plan a Brunch</Link>

      <section>
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <p>No upcoming brunches.</p>
        ) : (
          <ul>
            {upcoming.map((brunch) => (
              <BrunchCard key={brunch.id} brunch={brunch} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2>Past</h2>
          <ul>
            {past.map((brunch) => (
              <BrunchCard key={brunch.id} brunch={brunch} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
