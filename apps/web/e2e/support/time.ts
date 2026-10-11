const pad = (value: number): string => String(value).padStart(2, '0');

// A moment `days` from now at a fixed time of day. Never a fixed calendar date, so the suite
// does not rot as time passes (ADR 0007).
export function daysFromNow(days: number, hour = 10, minute = 30): Date {
  const moment = new Date();
  moment.setDate(moment.getDate() + days);
  moment.setHours(hour, minute, 0, 0);
  return moment;
}

// The value format a <input type="datetime-local"> accepts.
export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// A <input type="datetime-local"> value for `date` as it reads in `timeZone`. The browser
// interprets and displays that value in its own (pinned) zone, so tests that fill or compare
// one use this instead of the machine-local toDatetimeLocalValue.
export function datetimeLocalIn(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const part = (type: string): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
