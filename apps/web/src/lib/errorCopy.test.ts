import { API_ERROR_CODES } from '@brunchsters/shared';
import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { ERROR_COPY_CODES, errorCopy } from './errorCopy';

describe('errorCopy', () => {
  it('has a line for every code a route can send, and for the one the browser makes', () => {
    for (const code of API_ERROR_CODES) {
      expect(ERROR_COPY_CODES).toContain(code);
      expect(errorCopy({ code }).length).toBeGreaterThan(0);
    }
    expect(ERROR_COPY_CODES).toContain('network');
    expect(errorCopy({ code: 'network' })).toBe("Looks like you're offline.");
  });

  it('has no line for a code that does not exist', () => {
    const known = new Set<string>([...API_ERROR_CODES, 'network']);
    for (const code of ERROR_COPY_CODES) expect(known.has(code)).toBe(true);
  });

  it('says the same thing for a 404 whatever else it is given (it must not tell ids apart)', () => {
    const plain = errorCopy({ code: 'not_found' });
    expect(plain).toBe("This table's empty.");
    expect(errorCopy({ code: 'not_found', rateLimit: { policy: 'x', retryAfterSeconds: 5 } })).toBe(
      plain,
    );
    expect(plain.toLowerCase()).not.toContain('brunch');
    expect(plain.toLowerCase()).not.toContain('private');
  });

  it('words a 429 from its wait when it has one, and generically when it has none', () => {
    expect(errorCopy({ code: 'rate_limited' })).toBe('Slow down a sec, then try again.');
    expect(
      errorCopy({
        code: 'rate_limited',
        rateLimit: { policy: RATE_LIMIT_POLICIES.resendPerInvite.name, retryAfterSeconds: 120 },
      }),
    ).toBe('That one just went out. Give it 2 minutes.');
  });

  it('never leaves a line that blames the system in the words the voice rules ban', () => {
    for (const code of ERROR_COPY_CODES) {
      const line = errorCopy({ code }).toLowerCase();
      for (const word of ['failed', 'error', 'invalid', 'unable', 'successfully']) {
        expect(line).not.toContain(word);
      }
    }
  });

  it('promises nothing the app does not do (no "we\'ll try again")', () => {
    for (const code of ERROR_COPY_CODES) {
      expect(errorCopy({ code }).toLowerCase()).not.toMatch(/we'?ll (try|retry)|retrying/);
    }
  });
});
