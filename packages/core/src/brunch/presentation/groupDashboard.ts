import { isPastBrunch, type DashboardFacts } from './isPastBrunch';
import { pickNextUp } from './pickNextUp';

const UPCOMING_STATUS_CODES: ReadonlySet<string> = new Set(['draft', 'active', 'confirmed']);

export type DashboardGroups<T> = {
  readonly nextUp: T | undefined;
  // everything else still to come, in the order given (newest created first from the query);
  // never contains the next-up brunch
  readonly upcoming: readonly T[];
  readonly past: readonly T[];
};

// Files a person's brunches for the dashboard: the next-up brunch gets the feature card, the
// rest of what is still to come is the list, and finished ones are Past. A status the dashboard
// does not know is filed as Past, as before. The rules live here, not in the page.
export function groupDashboard<T extends DashboardFacts>(
  brunches: readonly T[],
  now: Date,
): DashboardGroups<T> {
  const toCome = brunches.filter(
    (brunch) => UPCOMING_STATUS_CODES.has(brunch.statusCode) && !isPastBrunch(brunch, now),
  );
  const past = brunches.filter((brunch) => !toCome.includes(brunch));
  const nextUp = pickNextUp(toCome, now);
  return { nextUp, upcoming: toCome.filter((brunch) => brunch !== nextUp), past };
}
