// How the dashboard words the facts it is given. Pure formatting (the rules behind the facts live
// in packages/core); every function takes the moment it is judged at, so none has a hidden clock.

export type GreetingWord = 'Morning' | 'Afternoon' | 'Evening' | 'Hey';

// Morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–21:59, otherwise just "Hey".
export function greetingWord(hour: number): GreetingWord {
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 22) return 'Evening';
  return 'Hey';
}

// "Tuesday, October 21", in the zone the date is formatted in (the browser's, for the greeting).
export function eyebrowDate(now: Date): string {
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function calendarDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000;
}

// "Today", "Tomorrow", "In 7 days": whole calendar days between now and the brunch, counted in
// the brunch's own zone so a late-evening brunch on the other side of the country is not a day off.
export function daysUntilLabel(params: {
  readonly scheduledAt: Date;
  readonly timeZone: string | undefined;
  readonly now: Date;
}): string {
  const zone = params.timeZone ?? 'UTC';
  const days = calendarDay(params.scheduledAt, zone) - calendarDay(params.now, zone);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

// "Sun, Nov 1 · 11:00 AM", in the brunch's zone.
export function formatWhen(params: {
  readonly scheduledAt: Date;
  readonly timeZone: string | undefined;
}): string {
  const zone = { timeZone: params.timeZone ?? 'UTC' };
  const day = params.scheduledAt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...zone,
  });
  const time = params.scheduledAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...zone,
  });
  return `${day} · ${time}`;
}

// "closes in 1d 4h", "closes in 5h", "closes in 20m". Elapsed time between two instants, so it is
// the same in every time zone. It is the moment of the request: it does not tick.
export function closesIn(params: { readonly deadline: Date; readonly now: Date }): string {
  const minutes = Math.floor((params.deadline.getTime() - params.now.getTime()) / 60_000);
  if (minutes <= 0) return 'closing now';
  if (minutes < 60) return `closes in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `closes in ${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `closes in ${days}d` : `closes in ${days}d ${rest}h`;
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export function goingLabel(count: number): string {
  return `${count} going`;
}

export type SummaryLine = {
  readonly before: string;
  // the butter pill, when a vote is waiting
  readonly pill: string | undefined;
  readonly after: string;
};

// "You've got 2 brunches coming up and [1 vote waiting] on you."
export function summaryLine(params: {
  readonly comingUp: number;
  readonly votesWaiting: number;
}): SummaryLine {
  if (params.comingUp === 0) {
    return { before: "Nothing on the calendar yet — let's fix that.", pill: undefined, after: '' };
  }
  const brunches = plural(params.comingUp, 'brunch', 'brunches');
  if (params.votesWaiting === 0) {
    return { before: `You've got ${brunches} coming up.`, pill: undefined, after: '' };
  }
  return {
    before: `You've got ${brunches} coming up and`,
    pill: plural(params.votesWaiting, 'vote', 'votes') + ' waiting',
    after: 'on you.',
  };
}

// The one line under a brunch's title in the list: its description if it has one, else the place
// once confirmed, else when voting closes, else that nothing is set yet.
export function rowLine(params: {
  readonly description: string | undefined;
  readonly placeName: string | undefined;
  readonly statusCode: string;
  readonly votingClosed: boolean;
  readonly votingDeadline: Date | undefined;
  readonly now: Date;
}): string {
  const description = params.description?.trim();
  if (description !== undefined && description !== '') return description;
  if (params.placeName !== undefined) return params.placeName;
  if (params.statusCode === 'active') {
    if (params.votingClosed) return 'Voting closed';
    if (params.votingDeadline !== undefined) {
      return capitalize(closesIn({ deadline: params.votingDeadline, now: params.now }));
    }
    return 'Voting is open';
  }
  return 'Not set yet';
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
