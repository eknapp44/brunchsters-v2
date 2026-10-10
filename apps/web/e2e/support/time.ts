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
