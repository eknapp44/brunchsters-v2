import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  API_ERROR_STATUSES,
  codeForStatus,
  isApiErrorCode,
  isStatusAllowedFor,
} from './apiError';

describe('API_ERROR_STATUSES', () => {
  it('gives every code at least one 4xx or 5xx status, with codes in snake_case', () => {
    for (const code of API_ERROR_CODES) {
      expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(API_ERROR_STATUSES[code].length).toBeGreaterThan(0);
      for (const status of API_ERROR_STATUSES[code]) {
        expect(status).toBeGreaterThanOrEqual(400);
        expect(status).toBeLessThan(600);
      }
    }
  });

  it('never claims "network": that one is made by the browser, not sent by a route', () => {
    expect(isApiErrorCode('network')).toBe(false);
  });
});

describe('isApiErrorCode', () => {
  it('accepts a listed code and nothing else, including inherited object keys', () => {
    expect(isApiErrorCode('not_found')).toBe(true);
    expect(isApiErrorCode('toString')).toBe(false);
    expect(isApiErrorCode('Brunch not found')).toBe(false);
    expect(isApiErrorCode(404)).toBe(false);
    expect(isApiErrorCode(undefined)).toBe(false);
  });
});

describe('isStatusAllowedFor', () => {
  it('allows a code only with its own statuses', () => {
    expect(isStatusAllowedFor({ code: 'not_found', status: 404 })).toBe(true);
    expect(isStatusAllowedFor({ code: 'not_found', status: 403 })).toBe(false);
    expect(isStatusAllowedFor({ code: 'invalid', status: 422 })).toBe(true);
    expect(isStatusAllowedFor({ code: 'internal', status: 409 })).toBe(false);
  });
});

describe('codeForStatus', () => {
  it('picks the general code for a status that came with none', () => {
    expect(codeForStatus(401)).toBe('signed_out');
    expect(codeForStatus(403)).toBe('forbidden');
    expect(codeForStatus(404)).toBe('not_found');
    expect(codeForStatus(409)).toBe('brunch_changed');
    expect(codeForStatus(400)).toBe('invalid');
    expect(codeForStatus(422)).toBe('invalid');
    expect(codeForStatus(429)).toBe('rate_limited');
    expect(codeForStatus(502)).toBe('unavailable');
    expect(codeForStatus(503)).toBe('unavailable');
    expect(codeForStatus(500)).toBe('internal');
    expect(codeForStatus(418)).toBe('internal');
  });

  it('returns a code that allows the status, for every status a code is listed with', () => {
    for (const code of API_ERROR_CODES) {
      for (const status of API_ERROR_STATUSES[code]) {
        // the general code for a status is one of the codes that status belongs to
        expect(isStatusAllowedFor({ code: codeForStatus(status), status })).toBe(true);
      }
    }
  });
});
