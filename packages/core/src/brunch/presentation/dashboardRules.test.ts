import { describe, expect, it } from 'vitest';
import { groupDashboard } from './groupDashboard';
import { isPastBrunch, type DashboardFacts } from './isPastBrunch';
import { pickNextUp } from './pickNextUp';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const hoursFromNow = (hours: number): Date => new Date(NOW.getTime() + hours * 3_600_000);

type Row = DashboardFacts & { readonly id: string };

function row(
  id: string,
  statusCode: string,
  options: { readonly scheduledAt?: Date; readonly createdHoursAgo?: number } = {},
): Row {
  return {
    id,
    statusCode,
    scheduledAt: options.scheduledAt,
    createdAt: hoursFromNow(-(options.createdHoursAgo ?? 1)),
  };
}

describe('isPastBrunch', () => {
  it('files completed and cancelled brunches as past', () => {
    expect(isPastBrunch(row('a', 'completed'), NOW)).toBe(true);
    expect(isPastBrunch(row('b', 'cancelled'), NOW)).toBe(true);
  });

  it('files a confirmed brunch as past once its time has passed, and not before', () => {
    expect(isPastBrunch(row('a', 'confirmed', { scheduledAt: hoursFromNow(-1) }), NOW)).toBe(true);
    expect(isPastBrunch(row('b', 'confirmed', { scheduledAt: hoursFromNow(1) }), NOW)).toBe(false);
  });

  it('treats a time exactly now as still to come', () => {
    expect(isPastBrunch(row('a', 'confirmed', { scheduledAt: NOW }), NOW)).toBe(false);
  });

  it('keeps a confirmed brunch with no time on record where it is', () => {
    expect(isPastBrunch(row('a', 'confirmed'), NOW)).toBe(false);
  });

  it('never files a draft or an active brunch as past, whatever its dates', () => {
    expect(isPastBrunch(row('a', 'draft'), NOW)).toBe(false);
    expect(isPastBrunch(row('b', 'active', { scheduledAt: hoursFromNow(-48) }), NOW)).toBe(false);
  });
});

describe('pickNextUp', () => {
  it('prefers the soonest confirmed brunch to come over a newer active one', () => {
    const soon = row('soon', 'confirmed', { scheduledAt: hoursFromNow(24) });
    const later = row('later', 'confirmed', { scheduledAt: hoursFromNow(72) });
    const active = row('active', 'active', { createdHoursAgo: 0.1 });

    expect(pickNextUp([active, later, soon], NOW)?.id).toBe('soon');
  });

  it('falls back to the newest active brunch when nothing confirmed is still to come', () => {
    const older = row('older', 'active', { createdHoursAgo: 10 });
    const newer = row('newer', 'active', { createdHoursAgo: 2 });
    const pastConfirmed = row('past', 'confirmed', { scheduledAt: hoursFromNow(-5) });

    expect(pickNextUp([older, pastConfirmed, newer], NOW)?.id).toBe('newer');
  });

  it('breaks a tie on the time by the newest created brunch', () => {
    const when = hoursFromNow(24);
    const first = row('first', 'confirmed', { scheduledAt: when, createdHoursAgo: 10 });
    const second = row('second', 'confirmed', { scheduledAt: when, createdHoursAgo: 2 });

    expect(pickNextUp([first, second], NOW)?.id).toBe('second');
  });

  it('never picks a draft, a cancelled brunch, or a confirmed one with no time', () => {
    expect(
      pickNextUp([row('d', 'draft'), row('c', 'cancelled'), row('x', 'confirmed')], NOW),
    ).toBeUndefined();
  });

  it('returns nothing for no brunches', () => {
    expect(pickNextUp([], NOW)).toBeUndefined();
  });

  it('does not reorder the list it is given', () => {
    const rows = [
      row('b', 'confirmed', { scheduledAt: hoursFromNow(48) }),
      row('a', 'confirmed', { scheduledAt: hoursFromNow(24) }),
    ];
    pickNextUp(rows, NOW);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('groupDashboard', () => {
  it('puts the next-up brunch in its own slot and not in the list', () => {
    const nextUp = row('next', 'confirmed', { scheduledAt: hoursFromNow(24) });
    const active = row('active', 'active');
    const draft = row('draft', 'draft');

    const groups = groupDashboard([active, draft, nextUp], NOW);

    expect(groups.nextUp?.id).toBe('next');
    expect(groups.upcoming.map((r) => r.id)).toEqual(['active', 'draft']);
    expect(groups.past).toEqual([]);
  });

  it('keeps the order it was given for the list', () => {
    const groups = groupDashboard(
      [row('c', 'draft'), row('b', 'draft'), row('a', 'draft'), row('n', 'active')],
      NOW,
    );
    expect(groups.upcoming.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('files completed, cancelled, unknown-status and passed-confirmed brunches as past', () => {
    const groups = groupDashboard(
      [
        row('done', 'completed'),
        row('off', 'cancelled'),
        row('odd', 'something-new'),
        row('over', 'confirmed', { scheduledAt: hoursFromNow(-3) }),
        row('live', 'draft'),
      ],
      NOW,
    );
    expect(groups.past.map((r) => r.id)).toEqual(['done', 'off', 'odd', 'over']);
    expect(groups.upcoming.map((r) => r.id)).toEqual(['live']);
    expect(groups.nextUp).toBeUndefined();
  });

  it('has no next-up brunch and an empty list for a person with only a draft', () => {
    const groups = groupDashboard([row('d', 'draft')], NOW);
    expect(groups.nextUp).toBeUndefined();
    expect(groups.upcoming.map((r) => r.id)).toEqual(['d']);
  });

  it('handles no brunches', () => {
    expect(groupDashboard([], NOW)).toEqual({ nextUp: undefined, upcoming: [], past: [] });
  });
});
