import { isPastBrunch, type DashboardFacts } from './isPastBrunch';
import { pickNextUp } from './pickNextUp';

const UPCOMING_STATUS_CODES: ReadonlySet<string> = new Set(['draft', 'active', 'confirmed']);

export type DashboardGroups<T> = {
  readonly nextUp: T | undefined;
  // everything else still to come, in the order given (newest created first from the query);
  // never contains the next-up brunch
  readonly upcoming: readonly T[];
  readonly past: readonly T[];
  // what the viewer hid from their own dashboard (spec 0013), in the order given; these are in
  // none of the groups above
  readonly hidden: readonly T[];
};

// Files a person's brunches for the dashboard: the next-up brunch gets the feature card, the
// rest of what is still to come is the list, and finished ones are Past. A brunch the viewer hid
// belongs to none of those: it is returned on its own, so it is out of next-up, out of the counts
// built from the lists, and still findable. A status the dashboard does not know is filed as Past,
// as before. The rules live here, not in the page.
export function groupDashboard<T extends DashboardFacts & { readonly isHidden: boolean }>(
  brunches: readonly T[],
  now: Date,
): DashboardGroups<T> {
  const visible = brunches.filter((brunch) => !brunch.isHidden);
  const hidden = brunches.filter((brunch) => brunch.isHidden);

  const toCome = visible.filter(
    (brunch) => UPCOMING_STATUS_CODES.has(brunch.statusCode) && !isPastBrunch(brunch, now),
  );
  const past = visible.filter((brunch) => !toCome.includes(brunch));
  const nextUp = pickNextUp(toCome, now);
  return { nextUp, upcoming: toCome.filter((brunch) => brunch !== nextUp), past, hidden };
}
