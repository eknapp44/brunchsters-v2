import { describe, expect, it } from 'vitest';
import { describeTimeLeft } from './sendDeadlineReminderEmail';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const after = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);

describe('describeTimeLeft', () => {
  it('says less than an hour under an hour, including a deadline that is already here', () => {
    expect(describeTimeLeft({ now: NOW, deadline: after(59) })).toBe('less than an hour');
    expect(describeTimeLeft({ now: NOW, deadline: after(0) })).toBe('less than an hour');
    expect(describeTimeLeft({ now: NOW, deadline: after(-5) })).toBe('less than an hour');
  });

  it('says about an hour for an hour, and rounds to the nearest hour after that', () => {
    expect(describeTimeLeft({ now: NOW, deadline: after(60) })).toBe('about an hour');
    expect(describeTimeLeft({ now: NOW, deadline: after(89) })).toBe('about an hour');
    expect(describeTimeLeft({ now: NOW, deadline: after(90) })).toBe('about 2 hours');
    expect(describeTimeLeft({ now: NOW, deadline: after(5 * 60) })).toBe('about 5 hours');
    expect(describeTimeLeft({ now: NOW, deadline: after(24 * 60) })).toBe('about 24 hours');
  });
});
