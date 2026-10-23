import type { BrunchId, InviteId } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import {
  backOnEmailKey,
  cancelledEmailKey,
  confirmedEmailKey,
  inviteEmailKey,
  joinUrl,
} from './emailKeys';

const INVITE_ID = 'invite-1' as InviteId;
const BRUNCH_ID = 'brunch-1' as BrunchId;

describe('inviteEmailKey', () => {
  it('is stable for the same invite and token, so a retry sends nothing new', async () => {
    const first = await inviteEmailKey({ inviteId: INVITE_ID, token: 'token-a' });
    const second = await inviteEmailKey({ inviteId: INVITE_ID, token: 'token-a' });

    expect(first).toBe(second);
  });

  it('changes when the token is rotated, so a resend sends again', async () => {
    const before = await inviteEmailKey({ inviteId: INVITE_ID, token: 'token-a' });
    const after = await inviteEmailKey({ inviteId: INVITE_ID, token: 'token-b' });

    expect(before).not.toBe(after);
  });

  it('never contains the token itself', async () => {
    const key = await inviteEmailKey({ inviteId: INVITE_ID, token: 'secret-token-value' });

    expect(key).not.toContain('secret-token-value');
    expect(key).toMatch(/^invite:invite-1:[0-9a-f]{16}$/);
  });
});

describe('confirmedEmailKey', () => {
  it('is per brunch and per recipient', () => {
    expect(confirmedEmailKey({ brunchId: BRUNCH_ID, recipientKey: 'host' })).toBe(
      'confirmed:brunch-1:host',
    );
    expect(confirmedEmailKey({ brunchId: BRUNCH_ID, recipientKey: 'invite:i1' })).not.toBe(
      confirmedEmailKey({ brunchId: BRUNCH_ID, recipientKey: 'invite:i2' }),
    );
  });
});

describe('cancelledEmailKey and backOnEmailKey', () => {
  const FIRST = new Date('2026-10-23T12:00:00.000Z');
  const SECOND = new Date('2026-10-23T12:30:00.000Z');

  it('are per brunch, per cancellation and per recipient', () => {
    expect(
      cancelledEmailKey({ brunchId: BRUNCH_ID, cancelledAt: FIRST, recipientKey: 'invite:i1' }),
    ).toBe(`cancelled:brunch-1:${FIRST.getTime()}:invite:i1`);
    expect(
      backOnEmailKey({ brunchId: BRUNCH_ID, cancelledAt: FIRST, recipientKey: 'invite:i1' }),
    ).toBe(`backon:brunch-1:${FIRST.getTime()}:invite:i1`);
  });

  it('change with the cancellation, so a second one tells people again', () => {
    const first = cancelledEmailKey({
      brunchId: BRUNCH_ID,
      cancelledAt: FIRST,
      recipientKey: 'host',
    });
    const second = cancelledEmailKey({
      brunchId: BRUNCH_ID,
      cancelledAt: SECOND,
      recipientKey: 'host',
    });

    expect(first).not.toBe(second);
  });

  it('keep the called-off and back-on emails apart for the same cancellation and person', () => {
    const params = { brunchId: BRUNCH_ID, cancelledAt: FIRST, recipientKey: 'invite:i1' };

    expect(cancelledEmailKey(params)).not.toBe(backOnEmailKey(params));
  });
});

describe('joinUrl', () => {
  it('joins with exactly one slash whether or not the base ends in one', () => {
    expect(joinUrl({ base: 'https://app.example.com', path: '/invite/x' })).toBe(
      'https://app.example.com/invite/x',
    );
    expect(joinUrl({ base: 'https://app.example.com/', path: '/invite/x' })).toBe(
      'https://app.example.com/invite/x',
    );
  });
});
