import { describe, expect, it } from 'vitest';
import {
  formatWhenLong,
  rosterSummary,
  silentLine,
  votesChip,
  whosInLine,
} from './brunchPageFormat';

const NOW = new Date('2026-10-21T20:00:00.000Z');

describe('formatWhenLong', () => {
  it('writes the day in full and names the zone', () => {
    const scheduledAt = new Date('2026-10-25T18:00:00.000Z');
    expect(formatWhenLong({ scheduledAt, timeZone: 'America/Los_Angeles' })).toBe(
      'Sunday, October 25 · 11:00 AM PDT',
    );
    expect(formatWhenLong({ scheduledAt, timeZone: 'America/New_York' })).toBe(
      'Sunday, October 25 · 2:00 PM EDT',
    );
  });

  it('reads a brunch with no zone in UTC', () => {
    expect(formatWhenLong({ scheduledAt: NOW, timeZone: undefined })).toContain('UTC');
  });
});

describe('votesChip', () => {
  it('says when voting closes', () => {
    const deadline = new Date(NOW.getTime() + 28 * 3_600_000);
    expect(votesChip({ deadline, now: NOW })).toBe('Votes coming in · closes in 1d 4h');
  });

  it('says only that votes are coming in when there is no deadline', () => {
    expect(votesChip({ deadline: undefined, now: NOW })).toBe('Votes coming in');
  });
});

describe('rosterSummary', () => {
  it('lists yes and maybe, leaving out zeros', () => {
    expect(rosterSummary({ yes: 3, maybe: 1, no: 2, pending: 4 })).toBe('3 yes · 1 maybe');
    expect(rosterSummary({ yes: 2, maybe: 0, no: 0, pending: 0 })).toBe('2 yes');
    expect(rosterSummary({ yes: 0, maybe: 1, no: 0, pending: 0 })).toBe('1 maybe');
  });

  it('says so when nobody has said yes or maybe', () => {
    expect(rosterSummary({ yes: 0, maybe: 0, no: 1, pending: 1 })).toBe('No answers yet');
  });
});

describe('silentLine', () => {
  it('says how many cannot make it and how many have not answered', () => {
    expect(silentLine({ yes: 1, maybe: 0, no: 1, pending: 2 })).toBe(
      "1 can't make it · 2 haven't said yet",
    );
    expect(silentLine({ yes: 1, maybe: 0, no: 0, pending: 1 })).toBe("1 haven't said yet");
  });

  it('says nothing when there is nobody to say it about', () => {
    expect(silentLine({ yes: 3, maybe: 1, no: 0, pending: 0 })).toBeUndefined();
  });
});

describe('whosInLine', () => {
  it('reads naturally for one, two, three and many', () => {
    expect(whosInLine([])).toBeUndefined();
    expect(whosInLine(['You'])).toBe("You're in.");
    expect(whosInLine(['Maya R.'])).toBe('Maya R. is in.');
    expect(whosInLine(['You', 'Maya R.'])).toBe('You & Maya R. are in.');
    expect(whosInLine(['You', 'Maya R.', 'Devon K.'])).toBe('You, Maya R. & Devon K. are in.');
    expect(whosInLine(['You', 'Maya R.', 'Devon K.', 'Priya S.'])).toBe(
      'You, Maya R. & 2 more are in.',
    );
  });
});
