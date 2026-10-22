import { closesIn } from './dashboardFormat';

// How the brunch page words the facts it is given. Pure formatting; the rules (who is leading,
// who may see whom) live in packages/core.

type Counts = {
  readonly yes: number;
  readonly maybe: number;
  readonly no: number;
  readonly pending: number;
};

// "Sunday, November 1 · 11:00 AM PST": the confirmed time, in the confirmed place's zone, with the
// zone named so nobody has to guess which one it is.
export function formatWhenLong(params: {
  readonly scheduledAt: Date;
  readonly timeZone: string | undefined;
}): string {
  const zone = { timeZone: params.timeZone ?? 'UTC' };
  const day = params.scheduledAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...zone,
  });
  const time = params.scheduledAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...zone,
  });
  return `${day} · ${time}`;
}

// The chip beside the status while voting is open: "Votes coming in · closes in 1d 4h", or just
// "Votes coming in" when the host set no deadline.
export function votesChip(params: {
  readonly deadline: Date | undefined;
  readonly now: Date;
}): string {
  if (params.deadline === undefined) return 'Votes coming in';
  return `Votes coming in · ${closesIn({ deadline: params.deadline, now: params.now })}`;
}

// "3 yes · 1 maybe": the head of the roster. Zero counts are left out; with no answer at all it
// says so.
export function rosterSummary(counts: Counts): string {
  const parts = [
    counts.yes > 0 ? `${counts.yes} yes` : undefined,
    counts.maybe > 0 ? `${counts.maybe} maybe` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(' · ') : 'No answers yet';
}

// "1 can't make it · 2 haven't said yet": the people a member is told about only as numbers.
// Nothing when there are none.
export function silentLine(counts: Counts): string | undefined {
  const parts = [
    counts.no > 0 ? `${counts.no} can't make it` : undefined,
    counts.pending > 0 ? `${counts.pending} haven't said yet` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

// "Maya R. & Devon K. are in." for the Brunch on. banner: up to two names, then "and N more".
// The viewer is "You": alone, "You're in."; with others, "You, Maya R. & 2 more are in."
export function whosInLine(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length === 1) {
    return names[0] === 'You' ? "You're in." : `${names[0]} is in.`;
  }
  if (names.length === 2) return `${names[0]} & ${names[1]} are in.`;
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]} are in.`;
  return `${names[0]}, ${names[1]} & ${names.length - 2} more are in.`;
}
