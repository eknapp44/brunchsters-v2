import type { BrunchId, InviteId } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { confirmedEmailKey, inviteEmailKey, joinUrl } from './emailKeys';

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

describe('joinUrl', () => {
  it('joins with exactly one slash whether or not the base ends in one', () => {
    expect(joinUrl('https://app.example.com', '/invite/x')).toBe(
      'https://app.example.com/invite/x',
    );
    expect(joinUrl('https://app.example.com/', '/invite/x')).toBe(
      'https://app.example.com/invite/x',
    );
  });
});
