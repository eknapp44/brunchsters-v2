import { describe, expect, it } from 'vitest';
import {
  closesIn,
  daysUntilLabel,
  eyebrowDate,
  formatWhen,
  goingLabel,
  greetingWord,
  rowLine,
  summaryLine,
} from './dashboardFormat';

const NOW = new Date('2026-10-21T20:00:00.000Z'); // 3 pm in Chicago, 1 pm in Los Angeles

describe('greetingWord', () => {
  it('changes at 5, 12, 17 and 22 o clock', () => {
    expect(greetingWord(4)).toBe('Hey');
    expect(greetingWord(5)).toBe('Morning');
    expect(greetingWord(11)).toBe('Morning');
    expect(greetingWord(12)).toBe('Afternoon');
    expect(greetingWord(16)).toBe('Afternoon');
    expect(greetingWord(17)).toBe('Evening');
    expect(greetingWord(21)).toBe('Evening');
    expect(greetingWord(22)).toBe('Hey');
    expect(greetingWord(0)).toBe('Hey');
  });
});

describe('eyebrowDate', () => {
  it('writes the weekday, the month and the day', () => {
    expect(eyebrowDate(new Date(2026, 9, 21, 15, 0))).toBe('Wednesday, October 21');
  });
});

describe('daysUntilLabel', () => {
  const label = (scheduledAt: string, timeZone = 'America/Los_Angeles'): string =>
    daysUntilLabel({ scheduledAt: new Date(scheduledAt), timeZone, now: NOW });

  it('says Today for later the same day, in the brunch zone', () => {
    expect(label('2026-10-22T01:00:00.000Z')).toBe('Today'); // 6 pm Wednesday in Los Angeles
  });

  it('says Tomorrow and then counts days', () => {
    expect(label('2026-10-22T18:00:00.000Z')).toBe('Tomorrow');
    expect(label('2026-10-28T18:00:00.000Z')).toBe('In 7 days');
  });

  it('counts the calendar day where the brunch is, not the viewer, near midnight', () => {
    // 11 pm Wednesday in Los Angeles is already Thursday in Chicago and UTC.
    const lateTonight = '2026-10-22T06:00:00.000Z';
    expect(label(lateTonight, 'America/Los_Angeles')).toBe('Today');
    expect(label(lateTonight, 'America/Chicago')).toBe('Tomorrow');
  });

  it('reads a brunch with no zone in UTC', () => {
    expect(daysUntilLabel({ scheduledAt: NOW, timeZone: undefined, now: NOW })).toBe('Today');
  });
});

describe('formatWhen', () => {
  it('writes the day and the time in the brunch zone', () => {
    const scheduledAt = new Date('2026-10-25T18:00:00.000Z');
    expect(formatWhen({ scheduledAt, timeZone: 'America/Los_Angeles' })).toBe(
      'Sun, Oct 25 · 11:00 AM',
    );
    expect(formatWhen({ scheduledAt, timeZone: 'America/New_York' })).toBe('Sun, Oct 25 · 2:00 PM');
  });
});

describe('closesIn', () => {
  const at = (ms: number): Date => new Date(NOW.getTime() + ms);
  const minute = 60_000;
  const hour = 60 * minute;

  it('counts minutes under an hour, hours under a day, and days with the hours left', () => {
    expect(closesIn({ deadline: at(20 * minute), now: NOW })).toBe('closes in 20m');
    expect(closesIn({ deadline: at(5 * hour + 10 * minute), now: NOW })).toBe('closes in 5h');
    expect(closesIn({ deadline: at(28 * hour), now: NOW })).toBe('closes in 1d 4h');
    expect(closesIn({ deadline: at(48 * hour), now: NOW })).toBe('closes in 2d');
  });

  it('says closing now at or past the deadline', () => {
    expect(closesIn({ deadline: NOW, now: NOW })).toBe('closing now');
    expect(closesIn({ deadline: at(-5 * hour), now: NOW })).toBe('closing now');
  });
});

describe('summaryLine', () => {
  it('says nothing is coming up when nothing is', () => {
    expect(summaryLine({ comingUp: 0, votesWaiting: 0 })).toEqual({
      before: "Nothing on the calendar yet — let's fix that.",
      pill: undefined,
      after: '',
    });
  });

  it('counts brunches, singular and plural', () => {
    expect(summaryLine({ comingUp: 1, votesWaiting: 0 }).before).toBe(
      "You've got 1 brunch coming up.",
    );
    expect(summaryLine({ comingUp: 3, votesWaiting: 0 }).before).toBe(
      "You've got 3 brunches coming up.",
    );
  });

  it('adds the pill when a vote is waiting', () => {
    expect(summaryLine({ comingUp: 2, votesWaiting: 1 })).toEqual({
      before: "You've got 2 brunches coming up and",
      pill: '1 vote waiting',
      after: 'on you.',
    });
    expect(summaryLine({ comingUp: 2, votesWaiting: 2 }).pill).toBe('2 votes waiting');
  });
});

describe('goingLabel', () => {
  it('reads "N going"', () => {
    expect(goingLabel(2)).toBe('2 going');
    expect(goingLabel(0)).toBe('0 going');
  });
});

describe('rowLine', () => {
  const base = {
    description: undefined,
    placeName: undefined,
    statusCode: 'draft',
    votingClosed: false,
    votingDeadline: undefined,
    now: NOW,
  };

  it('prefers the description', () => {
    expect(rowLine({ ...base, description: ' Sunday vibes ', placeName: 'Tartine' })).toBe(
      'Sunday vibes',
    );
  });

  it('ignores a blank description', () => {
    expect(rowLine({ ...base, description: '   ', placeName: 'Tartine' })).toBe('Tartine');
  });

  it('falls back to the confirmed place', () => {
    expect(rowLine({ ...base, placeName: 'Tartine', statusCode: 'confirmed' })).toBe('Tartine');
  });

  it('says when voting closes, or that it has', () => {
    const deadline = new Date(NOW.getTime() + 28 * 3_600_000);
    expect(rowLine({ ...base, statusCode: 'active', votingDeadline: deadline })).toBe(
      'Closes in 1d 4h',
    );
    expect(rowLine({ ...base, statusCode: 'active', votingClosed: true })).toBe('Voting closed');
    expect(rowLine({ ...base, statusCode: 'active' })).toBe('Voting is open');
  });

  it('says nothing is set for a draft with nothing to show', () => {
    expect(rowLine(base)).toBe('Not set yet');
  });
});
