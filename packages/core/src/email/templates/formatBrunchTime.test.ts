import { describe, expect, it } from 'vitest';
import { formatBrunchTime, formatCalendarDate } from './formatBrunchTime';

// 15:30 UTC on a Saturday in October: daylight time in Chicago, still evening in Tokyo.
const SCHEDULED_AT = new Date('2026-10-24T15:30:00Z');

describe('formatBrunchTime', () => {
  it('shows the wall-clock time in the brunch’s timezone with the zone named', () => {
    expect(formatBrunchTime({ scheduledAt: SCHEDULED_AT, timezone: 'America/Chicago' })).toBe(
      'Saturday, October 24, 2026 at 10:30 AM CDT',
    );
  });

  it('is the same instant rendered differently for another zone', () => {
    const tokyo = formatBrunchTime({ scheduledAt: SCHEDULED_AT, timezone: 'Asia/Tokyo' });

    expect(tokyo).toContain('Sunday, October 25, 2026');
    expect(tokyo).toContain('12:30 AM');
  });

  it('falls back to UTC, labelled, when the zone is unknown', () => {
    const text = formatBrunchTime({ scheduledAt: SCHEDULED_AT, timezone: 'Not/AZone' });

    expect(text).toContain('3:30 PM');
    expect(text).toContain('UTC');
  });
});

describe('formatCalendarDate', () => {
  it('formats a date without a time', () => {
    expect(formatCalendarDate(new Date('2026-11-23T12:00:00Z'))).toBe('November 23, 2026');
  });
});
