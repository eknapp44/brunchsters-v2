import { describe, expect, it } from 'vitest';
import { canCallOff } from './canCallOff';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const hoursFromNow = (hours: number): Date => new Date(NOW.getTime() + hours * 3_600_000);

describe('canCallOff', () => {
  it('offers it for an active brunch, whatever its dates', () => {
    expect(canCallOff({ statusCode: 'active', scheduledAt: undefined, now: NOW })).toBe(true);
    expect(canCallOff({ statusCode: 'active', scheduledAt: hoursFromNow(-48), now: NOW })).toBe(
      true,
    );
  });

  it('offers it for a confirmed brunch that has not happened yet', () => {
    expect(canCallOff({ statusCode: 'confirmed', scheduledAt: hoursFromNow(2), now: NOW })).toBe(
      true,
    );
    expect(canCallOff({ statusCode: 'confirmed', scheduledAt: NOW, now: NOW })).toBe(true);
  });

  it('does not offer it for a confirmed brunch that already happened', () => {
    expect(canCallOff({ statusCode: 'confirmed', scheduledAt: hoursFromNow(-1), now: NOW })).toBe(
      false,
    );
  });

  it('does not offer it for a draft (it can only be deleted) or a brunch already called off', () => {
    expect(canCallOff({ statusCode: 'draft', scheduledAt: undefined, now: NOW })).toBe(false);
    expect(canCallOff({ statusCode: 'cancelled', scheduledAt: undefined, now: NOW })).toBe(false);
  });

  it.each(['completed', 'brunching', 'paying', 'archived', 'something-new'])(
    'does not offer it for a %s brunch',
    (statusCode) => {
      expect(canCallOff({ statusCode, scheduledAt: undefined, now: NOW })).toBe(false);
    },
  );
});
