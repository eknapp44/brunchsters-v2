import {
  BIG_STUFF_TYPES,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_TYPE_CODES,
  PRODUCED_NOTIFICATION_TYPES,
  type BrunchId,
  type UserId,
} from '@brunchsters/shared';
import type { DbClient } from '@brunchsters/database';
import { describe, expect, it, vi } from 'vitest';
import { decideDelivery, shouldDeliver } from './shouldDeliver';

describe('decideDelivery', () => {
  it('uses the default when the person has chosen nothing', () => {
    for (const type of NOTIFICATION_TYPE_CODES) {
      for (const channel of ['in_app', 'email'] as const) {
        expect(decideDelivery({ type, channel, level: 'all', preference: undefined })).toBe(
          NOTIFICATION_DEFAULTS[type][channel],
        );
      }
    }
  });

  it("lets the person's own switch win over the default, both ways", () => {
    expect(
      decideDelivery({
        type: 'brunch.confirmed',
        channel: 'email',
        level: 'all',
        preference: false,
      }),
    ).toBe(false);
    expect(
      decideDelivery({ type: 'vote.cast', channel: 'email', level: 'all', preference: true }),
    ).toBe(true);
  });

  it('drops everything for a muted brunch, whatever the person chose', () => {
    for (const type of PRODUCED_NOTIFICATION_TYPES) {
      if (type === 'invite.email.failed') continue;
      expect(decideDelivery({ type, channel: 'in_app', level: 'muted', preference: true })).toBe(
        false,
      );
    }
  });

  it('keeps only big stuff at "just big stuff"', () => {
    for (const type of PRODUCED_NOTIFICATION_TYPES) {
      if (type === 'invite.email.failed') continue;
      const kept = decideDelivery({
        type,
        channel: 'in_app',
        level: 'big_stuff',
        preference: true,
      });
      expect(kept).toBe(BIG_STUFF_TYPES.includes(type));
    }
  });

  it("never lets a mute hide the host's failed invite email, but still honors their switch", () => {
    for (const level of ['all', 'big_stuff', 'muted'] as const) {
      expect(
        decideDelivery({
          type: 'invite.email.failed',
          channel: 'in_app',
          level,
          preference: undefined,
        }),
      ).toBe(true);
    }
    expect(
      decideDelivery({
        type: 'invite.email.failed',
        channel: 'in_app',
        level: 'muted',
        preference: false,
      }),
    ).toBe(false);
  });

  it('delivers nothing for a type no feature produces', () => {
    for (const type of ['running.late', 'host.transferred', 'vote.autoclose.prompted'] as const) {
      expect(decideDelivery({ type, channel: 'in_app', level: 'all', preference: undefined })).toBe(
        false,
      );
    }
  });
});

const USER_ID = 'user-uuid' as UserId;
const BRUNCH_ID = 'brunch-uuid' as BrunchId;

function makeDb(params: { level?: string; isEnabled?: boolean }): DbClient {
  return {
    brunchAttendee: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          params.level === undefined ? null : { notificationLevel: { code: params.level } },
        ),
    },
    userNotificationPreference: {
      findFirst: vi
        .fn()
        .mockResolvedValue(params.isEnabled === undefined ? null : { isEnabled: params.isEnabled }),
    },
  } as unknown as DbClient;
}

describe('shouldDeliver', () => {
  it("reads the person's level for the brunch and their saved switch", async () => {
    const result = await shouldDeliver(
      { userId: USER_ID, type: 'brunch.confirmed', channel: 'email', brunchId: BRUNCH_ID },
      { db: makeDb({ level: 'muted', isEnabled: true }) },
    );
    expect(result._unsafeUnwrap()).toBe(false);
  });

  it('treats someone with no attendee row, or an unknown level, as "all"', async () => {
    const none = await shouldDeliver(
      { userId: USER_ID, type: 'brunch.confirmed', channel: 'email', brunchId: BRUNCH_ID },
      { db: makeDb({}) },
    );
    const unknown = await shouldDeliver(
      { userId: USER_ID, type: 'brunch.confirmed', channel: 'email', brunchId: BRUNCH_ID },
      { db: makeDb({ level: 'surprise' }) },
    );
    expect(none._unsafeUnwrap()).toBe(true);
    expect(unknown._unsafeUnwrap()).toBe(true);
  });

  it('does not look up a level when there is no brunch', async () => {
    const db = makeDb({ level: 'muted' });
    const result = await shouldDeliver(
      { userId: USER_ID, type: 'invite.received', channel: 'in_app' },
      { db },
    );
    expect(result._unsafeUnwrap()).toBe(true);
    expect(db.brunchAttendee.findFirst).not.toHaveBeenCalled();
  });

  it('reports a database failure as an error, not as "do not deliver"', async () => {
    const db = {
      brunchAttendee: { findFirst: vi.fn().mockRejectedValue(new Error('down')) },
      userNotificationPreference: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as DbClient;
    const result = await shouldDeliver(
      { userId: USER_ID, type: 'brunch.confirmed', channel: 'in_app', brunchId: BRUNCH_ID },
      { db },
    );
    expect(result._unsafeUnwrapErr().kind).toBe('db_error');
  });
});
