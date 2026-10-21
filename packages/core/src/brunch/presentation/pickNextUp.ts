import type { DashboardFacts } from './isPastBrunch';

// The brunch the dashboard puts in its feature card: the soonest confirmed one that is still to
// come, else the newest active one. Drafts, past and cancelled brunches are never next up. A tie
// (the same time, or two actives created at once) goes to the newest created. Pure: `now` is a
// parameter.
export function pickNextUp<T extends DashboardFacts>(
  brunches: readonly T[],
  now: Date,
): T | undefined {
  const byNewest = (a: T, b: T): number => b.createdAt.getTime() - a.createdAt.getTime();

  const coming = brunches
    .filter(
      (brunch) =>
        brunch.statusCode === 'confirmed' &&
        brunch.scheduledAt !== undefined &&
        brunch.scheduledAt >= now,
    )
    .sort((a, b) => {
      const byTime = (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0);
      return byTime !== 0 ? byTime : byNewest(a, b);
    });
  if (coming[0] !== undefined) return coming[0];

  return brunches.filter((brunch) => brunch.statusCode === 'active').sort(byNewest)[0];
}
