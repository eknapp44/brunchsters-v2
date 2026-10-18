// "Saturday, October 24, 2026 at 10:30 AM CDT" in the brunch's own timezone, so
// every recipient reads the same wall-clock time the place will be on.
export function formatBrunchTime(params: {
  readonly scheduledAt: Date;
  readonly timezone: string;
}): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: params.timezone }).format(
      params.scheduledAt,
    );
  } catch {
    // An unknown zone should never stop an email; UTC is explicit about what it is.
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(
      params.scheduledAt,
    );
  }
}

// An instant in UTC with the zone named ("November 23, 2026 at 12:00 PM UTC"). A date alone is
// ambiguous by up to a day for someone far from UTC; a link's expiry should not be.
export function formatInstantUtc(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'UTC',
  }).format(date);
}
