import { describe, expect, it } from 'vitest';
import {
  MAX_RATE_LIMIT_WINDOW_SECONDS,
  RATE_LIMIT_POLICIES,
  RATE_LIMIT_RETENTION_DAYS,
} from './rateLimits';

const policies = Object.values(RATE_LIMIT_POLICIES);

describe('RATE_LIMIT_POLICIES', () => {
  it('gives every policy a unique, key-safe name (the name is part of the counter key)', () => {
    const names = policies.map((policy) => policy.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('uses whole, positive limits and windows', () => {
    for (const policy of policies) {
      expect(Number.isInteger(policy.limit)).toBe(true);
      expect(policy.limit).toBeGreaterThan(0);
      expect(Number.isInteger(policy.windowSeconds)).toBe(true);
      expect(policy.windowSeconds).toBeGreaterThan(0);
    }
  });

  it('keeps the daily host cap at least as large as the per-brunch cap and the largest single request', () => {
    expect(RATE_LIMIT_POLICIES.inviteEmailsPerHost.limit).toBeGreaterThanOrEqual(
      RATE_LIMIT_POLICIES.inviteEmailsPerBrunch.limit,
    );
  });

  it('has no window longer than the client clamps a wait to', () => {
    for (const policy of policies) {
      expect(policy.windowSeconds).toBeLessThanOrEqual(MAX_RATE_LIMIT_WINDOW_SECONDS);
    }
  });

  it('keeps counters for longer than the longest window, so a live window is never pruned', () => {
    const longestWindowDays = Math.max(...policies.map((policy) => policy.windowSeconds)) / 86_400;
    expect(RATE_LIMIT_RETENTION_DAYS).toBeGreaterThan(longestWindowDays);
  });
});
