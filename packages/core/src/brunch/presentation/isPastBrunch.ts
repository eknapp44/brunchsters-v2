// The facts about a brunch that decide where the dashboard files it.
export type DashboardFacts = {
  readonly statusCode: string;
  // the confirmed time; undefined until the host confirms
  readonly scheduledAt: Date | undefined;
  readonly createdAt: Date;
};

// A brunch is over when it was completed or cancelled, or when it was confirmed and its time has
// passed. Nothing marks a confirmed brunch completed yet (there is no scheduler), so the last
// case is derived at read time, as voting deadlines are. A confirmed brunch with no time on
// record has nothing to pass, so it stays where it is. `now` is a parameter, not a hidden clock.
export function isPastBrunch(
  brunch: Pick<DashboardFacts, 'statusCode' | 'scheduledAt'>,
  now: Date,
): boolean {
  if (brunch.statusCode === 'completed' || brunch.statusCode === 'cancelled') return true;
  return (
    brunch.statusCode === 'confirmed' &&
    brunch.scheduledAt !== undefined &&
    brunch.scheduledAt < now
  );
}
