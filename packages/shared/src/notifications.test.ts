import { describe, expect, it } from 'vitest';
import {
  BIG_STUFF_TYPES,
  COMPLETED_AFTER_HOURS,
  DEADLINE_REMINDER_HOURS,
  EMAIL_NOTIFICATION_TYPES,
  MUTE_PROOF_TYPES,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_READ_RETENTION_DAYS,
  NOTIFICATION_TYPE_CODES,
  NOTIFICATION_UNREAD_RETENTION_DAYS,
  PRODUCED_NOTIFICATION_TYPES,
  isNotificationTypeCode,
  readNotificationData,
} from './notifications';

describe('notification types', () => {
  it('lists each code once', () => {
    expect(new Set(NOTIFICATION_TYPE_CODES).size).toBe(NOTIFICATION_TYPE_CODES.length);
  });

  it('gives every type a default for both channels, and nothing else', () => {
    expect(Object.keys(NOTIFICATION_DEFAULTS).sort()).toEqual([...NOTIFICATION_TYPE_CODES].sort());
    for (const defaults of Object.values(NOTIFICATION_DEFAULTS)) {
      expect(Object.keys(defaults).sort()).toEqual(['email', 'in_app']);
    }
  });

  it('keeps the lists inside the type list', () => {
    for (const list of [
      PRODUCED_NOTIFICATION_TYPES,
      BIG_STUFF_TYPES,
      MUTE_PROOF_TYPES,
      EMAIL_NOTIFICATION_TYPES,
    ]) {
      for (const code of list) expect(isNotificationTypeCode(code)).toBe(true);
    }
  });

  it('turns a type off on both channels exactly when nothing produces it', () => {
    for (const code of NOTIFICATION_TYPE_CODES) {
      const produced = (PRODUCED_NOTIFICATION_TYPES as readonly string[]).includes(code);
      const { in_app, email } = NOTIFICATION_DEFAULTS[code];
      expect(in_app || email).toBe(produced);
    }
  });

  it('has an email default only where an email exists', () => {
    for (const code of NOTIFICATION_TYPE_CODES) {
      const hasEmail = (EMAIL_NOTIFICATION_TYPES as readonly string[]).includes(code);
      expect(NOTIFICATION_DEFAULTS[code].email).toBe(hasEmail);
    }
  });

  it('keeps unread notifications longer than read ones, and whole numbers of hours', () => {
    expect(NOTIFICATION_UNREAD_RETENTION_DAYS).toBeGreaterThan(NOTIFICATION_READ_RETENTION_DAYS);
    expect(Number.isInteger(COMPLETED_AFTER_HOURS)).toBe(true);
    expect(Number.isInteger(DEADLINE_REMINDER_HOURS)).toBe(true);
  });
});

describe('readNotificationData', () => {
  it('reads a well-formed row', () => {
    expect(
      readNotificationData({
        type: 'vote.cast',
        data: { kind: 'vote.cast', count: 2, actors: ['a', 'b'] },
      }),
    ).toEqual({ kind: 'vote.cast', count: 2, actors: ['a', 'b'] });
  });

  it('refuses data whose kind is not the row type', () => {
    expect(
      readNotificationData({
        type: 'rsvp.received',
        data: { kind: 'vote.cast', count: 1, actors: [] },
      }),
    ).toBeUndefined();
  });

  it('refuses missing or mistyped fields, and types nothing produces', () => {
    expect(
      readNotificationData({ type: 'brunch.confirmed', data: { kind: 'brunch.confirmed' } }),
    ).toBeUndefined();
    expect(
      readNotificationData({
        type: 'vote.cast',
        data: { kind: 'vote.cast', count: 0, actors: [] },
      }),
    ).toBeUndefined();
    expect(
      readNotificationData({ type: 'running.late', data: { kind: 'running.late' } }),
    ).toBeUndefined();
    expect(readNotificationData({ type: 'vote.cast', data: 'nope' })).toBeUndefined();
    expect(readNotificationData({ type: 'not.a.type', data: {} })).toBeUndefined();
  });
});
