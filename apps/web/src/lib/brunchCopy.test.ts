import { BRUNCH_STATUSES } from '@brunchsters/database';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_STATUS_WORDING, dashboardStatusLabel } from './brunchCopy';

describe('dashboard status wording', () => {
  it('has a decision for every seeded status code, so a new status cannot go unworded', () => {
    const missing = BRUNCH_STATUSES.map((status) => status.code).filter(
      (code) => DASHBOARD_STATUS_WORDING[code] === undefined,
    );
    expect(missing, `seeded status codes with no wording decision: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  it('has no entry for a status that is not seeded (a stale decision)', () => {
    const seeded = new Set(BRUNCH_STATUSES.map((status) => status.code));
    const stale = Object.keys(DASHBOARD_STATUS_WORDING).filter((code) => !seeded.has(code));
    expect(stale).toEqual([]);
  });

  it('uses the Copy Pass wording for the three statuses the dashboard shows as upcoming', () => {
    expect(dashboardStatusLabel({ code: 'draft', lookupLabel: 'Draft' })).toBe('In the works');
    expect(dashboardStatusLabel({ code: 'active', lookupLabel: 'Active' })).toBe('Open for votes');
    expect(dashboardStatusLabel({ code: 'confirmed', lookupLabel: 'Confirmed' })).toBe('Confirmed');
  });

  it('keeps the lookup label where that is the wording, and for a code it has never heard of', () => {
    expect(dashboardStatusLabel({ code: 'cancelled', lookupLabel: 'Cancelled' })).toBe('Cancelled');
    expect(dashboardStatusLabel({ code: 'completed', lookupLabel: 'Completed' })).toBe('Completed');
    expect(dashboardStatusLabel({ code: 'brand-new', lookupLabel: 'Brand New' })).toBe('Brand New');
  });
});
