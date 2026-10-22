import { describe, expect, it } from 'vitest';
import { formatWait, limitedMessage } from './limitedCopy';

describe('formatWait', () => {
  it.each([
    [1, 'a minute'],
    [45, 'a minute'],
    [90, 'a minute'],
    [91, '2 minutes'],
    [600, '10 minutes'],
    [601, '11 minutes'],
    [3540, '59 minutes'],
    [3570, 'about an hour'],
    [3600, 'about an hour'],
    [5399, 'about an hour'],
    [5400, 'about 2 hours'],
    [10_800, 'about 3 hours'],
    [86_400, 'about 24 hours'],
  ])('says %i seconds as "%s"', (seconds, words) => {
    expect(formatWait(seconds)).toBe(words);
  });

  it('never says zero of anything', () => {
    for (const seconds of [0, 1, 29, 59, 60, 89]) {
      expect(formatWait(seconds)).not.toMatch(/\b0\b/);
    }
  });
});

describe('limitedMessage', () => {
  it('tells a host who sent too many invites, with the wait', () => {
    for (const policy of ['invite-emails-brunch', 'invite-emails-host']) {
      expect(limitedMessage({ policy, retryAfterSeconds: 10_800 })).toBe(
        "Easy there, that's a lot of invites for one day. Try again in about 3 hours.",
      );
    }
  });

  it('tells a host whose resend came too soon, with the wait', () => {
    expect(limitedMessage({ policy: 'resend-invite', retryAfterSeconds: 540 })).toBe(
      'That one just went out. Give it 9 minutes.',
    );
  });

  it('asks for a breather for place search, writes and any policy it does not know', () => {
    for (const policy of ['place-search', 'place-details', 'writes', 'something-new']) {
      expect(limitedMessage({ policy, retryAfterSeconds: 30 })).toBe(
        'Slow down a sec, then try again.',
      );
    }
  });

  it('keeps to the voice: no jargon and no promise to retry', () => {
    const everything = [
      limitedMessage({ policy: 'invite-emails-host', retryAfterSeconds: 3600 }),
      limitedMessage({ policy: 'resend-invite', retryAfterSeconds: 60 }),
      limitedMessage({ policy: 'writes', retryAfterSeconds: 5 }),
    ].join(' ');

    expect(everything).not.toMatch(/rate.?limit|quota|throttl|successfully|we'll|we will/i);
  });
});
