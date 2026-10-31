import {
  EMAIL_NOTIFICATION_TYPES,
  NOTIFICATION_LEVEL_CODES,
  PRODUCED_NOTIFICATION_TYPES,
  type NotificationData,
} from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_CAPTION,
  IN_APP_CAPTION,
  LEVEL_HOST_NOTE,
  LEVEL_OPTIONS,
  SETTINGS_GROUPS,
  SETTINGS_INTRO,
  switchName,
  bellBadgeText,
  bellLabel,
  describeNotification,
  notificationHref,
  relativeAgo,
} from './notificationCopy';
import { BANNED_WORDS } from './findBannedWords';

const BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

// One row of every kind the app writes. A kind added to `NotificationData` without a line here
// fails to compile (the record is exhaustive), which is how a new type cannot reach the inbox
// unworded.
const SAMPLES: Readonly<Record<NotificationData['kind'], NotificationData>> = {
  'rsvp.received': { kind: 'rsvp.received', count: 3, actors: ['a', 'b', 'c'] },
  'vote.cast': { kind: 'vote.cast', count: 1, actors: ['a'] },
  'invite.suggestion': { kind: 'invite.suggestion', suggesterName: 'Maya Reyes' },
  'location.suggested': {
    kind: 'location.suggested',
    suggesterName: 'Maya Reyes',
    placeName: 'Zuni Cafe',
  },
  'time.suggested': { kind: 'time.suggested', suggesterName: 'Maya Reyes' },
  'brunch.confirmed': {
    kind: 'brunch.confirmed',
    hostName: 'Sam K.',
    placeName: 'Tartine',
    scheduledAt: '2026-12-06T18:00:00.000Z',
    timezone: 'America/Los_Angeles',
  },
  'brunch.cancelled': { kind: 'brunch.cancelled', hostName: 'Sam K.' },
  'brunch.reinstated': { kind: 'brunch.reinstated', hostName: 'Sam K.' },
  'vote.deadline.approaching': {
    kind: 'vote.deadline.approaching',
    deadline: '2026-12-01T18:00:00.000Z',
  },
  'invite.received': { kind: 'invite.received', hostName: 'Sam K.', inviteId: 'invite-1' },
  'invite.email.failed': { kind: 'invite.email.failed', email: 'friend@example.com' },
};

describe('the bell', () => {
  it('names the count for a screen reader, and says nothing about a count of none', () => {
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(1)).toBe('Notifications, 1 unread');
    expect(bellLabel(99)).toBe('Notifications, 99 unread');
    expect(bellLabel(100)).toBe('Notifications, more than 99 unread');
  });

  it('shows the number as it is up to 99, then "99+", and nothing for none', () => {
    expect(bellBadgeText(0)).toBeUndefined();
    expect(bellBadgeText(7)).toBe('7');
    expect(bellBadgeText(99)).toBe('99');
    expect(bellBadgeText(250)).toBe('99+');
  });
});

describe('describeNotification', () => {
  it('has a line for every kind, naming the brunch', () => {
    for (const data of Object.values(SAMPLES)) {
      const view = describeNotification({ data, brunchTitle: 'Sunday catch-up' });
      expect(view.headline.length, data.kind).toBeGreaterThan(0);
      if (data.kind !== 'invite.email.failed') {
        expect(view.headline + (view.detail ?? ''), data.kind).toContain('Sunday catch-up');
      }
    }
  });

  it('is exact for the lines the journeys look for', () => {
    const say = (kind: NotificationData['kind']) =>
      describeNotification({ data: SAMPLES[kind], brunchTitle: 'Sunday catch-up' });

    expect(say('rsvp.received').headline).toBe('3 new replies on Sunday catch-up');
    expect(say('vote.cast').headline).toBe('1 new vote on Sunday catch-up');
    expect(say('location.suggested').headline).toBe(
      'Maya Reyes suggested Zuni Cafe for Sunday catch-up',
    );
    expect(say('brunch.confirmed').headline).toBe('Sunday catch-up is on');
    expect(say('brunch.confirmed').detail).toBe('Tartine · Sunday, December 6 · 10:00 AM PST');
    expect(say('brunch.cancelled').headline).toBe('Sam K. called off Sunday catch-up');
    expect(say('brunch.reinstated').headline).toBe('Sunday catch-up is back on');
    expect(say('vote.deadline.approaching').headline).toBe('Last call to vote on Sunday catch-up');
    expect(say('invite.received').headline).toBe('Sam K. wants you at Sunday catch-up');
    expect(say('invite.email.failed').headline).toBe(
      "Your invite to friend@example.com didn't go through",
    );
  });

  it('puts a deadline in the reader zone (a moment, not text), and a place time in the place zone', () => {
    const deadline = describeNotification({
      data: SAMPLES['vote.deadline.approaching'],
      brunchTitle: 'Sunday catch-up',
    });
    expect(deadline.when).toEqual({ label: 'Closes', iso: '2026-12-01T18:00:00.000Z' });

    const confirmed = describeNotification({
      data: SAMPLES['brunch.confirmed'],
      brunchTitle: 'Sunday catch-up',
    });
    expect(confirmed.when).toBeUndefined();
  });

  it('says "1 reply" and "1 vote" in the singular', () => {
    const reply = describeNotification({
      data: { kind: 'rsvp.received', count: 1, actors: ['a'] },
      brunchTitle: 'Brunch',
    });
    expect(reply.headline).toBe('1 new reply on Brunch');
  });

  it('falls back to "your brunch" when the title is not known', () => {
    const view = describeNotification({ data: SAMPLES['vote.cast'], brunchTitle: undefined });
    expect(view.headline).toBe('1 new vote on your brunch');
  });

  it('uses none of the corporate words, and promises nothing', () => {
    for (const data of Object.values(SAMPLES)) {
      const view = describeNotification({ data, brunchTitle: 'Sunday catch-up' });
      const text = `${view.headline} ${view.detail ?? ''}`;
      expect(
        BANNED_WORDS.filter(({ pattern }) => pattern.test(text)).map(({ word }) => word),
        data.kind,
      ).toEqual([]);
      expect(text, data.kind).not.toMatch(/we'll|we will|remind you|successfully/i);
    }
  });
});

describe('notificationHref', () => {
  it('sends a suggestion to the host review page and everything else to the brunch', () => {
    for (const data of Object.values(SAMPLES)) {
      const href = notificationHref({ data, brunchId: BRUNCH_ID });
      const review = ['invite.suggestion', 'location.suggested', 'time.suggested'];
      expect(href, data.kind).toBe(
        review.includes(data.kind) ? `/brunch/${BRUNCH_ID}/manage` : `/brunch/${BRUNCH_ID}`,
      );
    }
  });

  it('goes to the dashboard for a row about no brunch', () => {
    expect(notificationHref({ data: SAMPLES['vote.cast'], brunchId: undefined })).toBe(
      '/dashboard',
    );
  });
});

describe('relativeAgo', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');
  const ago = (ms: number) => relativeAgo({ then: new Date(now.getTime() - ms), now });
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;

  it('reads like a friend would say it', () => {
    expect(ago(0)).toBe('Just now');
    expect(ago(59_000)).toBe('Just now');
    expect(ago(5 * MINUTE)).toBe('5 min ago');
    expect(ago(3 * HOUR)).toBe('3 h ago');
    expect(ago(30 * HOUR)).toBe('Yesterday');
    expect(ago(4 * 24 * HOUR)).toBe('4 days ago');
  });

  it('gives way to the date itself from a week on, and never says a negative time', () => {
    expect(ago(7 * 24 * HOUR)).toBeUndefined();
    expect(relativeAgo({ then: new Date(now.getTime() + HOUR), now })).toBe('Just now');
  });
});

describe('the settings page copy', () => {
  const lines = SETTINGS_GROUPS.flatMap((group) => group.lines);

  it('lists every type something produces exactly once, and nothing else', () => {
    const listed = lines.flatMap((line) => line.types);
    expect([...listed].sort()).toEqual([...PRODUCED_NOTIFICATION_TYPES].sort());
  });

  it('offers an email switch exactly where an email exists, for every type on the line', () => {
    for (const line of lines) {
      const emailable = line.types.map((type) => EMAIL_NOTIFICATION_TYPES.includes(type));
      expect(emailable.every(Boolean) || emailable.every((value) => !value), line.id).toBe(true);
      expect(line.hasEmail, line.id).toBe(emailable.every(Boolean));
    }
  });

  it('has unique line ids and no corporate words', () => {
    expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length);
    const text = [
      SETTINGS_INTRO,
      ...SETTINGS_GROUPS.map((group) => group.heading),
      ...lines.map((line) => line.label),
      ...LEVEL_OPTIONS.flatMap((option) => [option.label, option.hint]),
      LEVEL_HOST_NOTE,
    ].join(' ');
    expect(BANNED_WORDS.filter(({ pattern }) => pattern.test(text))).toEqual([]);
  });

  it('names a switch with the line and the channel, containing the caption a person sees', () => {
    expect(switchName({ label: 'A brunch is on', channel: 'email' })).toBe(
      'A brunch is on, by email',
    );
    expect(switchName({ label: 'A brunch is on', channel: 'in_app' })).toBe(
      'A brunch is on, in the app',
    );
    expect(switchName({ label: 'x', channel: 'email' }).toLowerCase()).toContain(
      EMAIL_CAPTION.toLowerCase(),
    );
    expect(switchName({ label: 'x', channel: 'in_app' }).toLowerCase()).toContain(
      IN_APP_CAPTION.toLowerCase(),
    );
  });

  it('has a mute choice for each level, in order', () => {
    expect(LEVEL_OPTIONS.map((option) => option.code)).toEqual([...NOTIFICATION_LEVEL_CODES]);
  });
});
