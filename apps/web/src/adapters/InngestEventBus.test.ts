import type { BrunchId, InviteId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { InngestEventBus } from './InngestEventBus';

const CREATED = {
  brunchId: '00000000-0000-4000-8000-000000000001' as BrunchId,
  hostId: '00000000-0000-4000-8000-000000000002' as UserId,
};
const RESENT = {
  brunchId: CREATED.brunchId,
  inviteId: '00000000-0000-4000-8000-000000000003' as InviteId,
};

describe('InngestEventBus', () => {
  it('forwards an event some function handles, with its name and payload', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await new InngestEventBus({ send }, new Set(['invite/resent'])).emit('invite/resent', RESENT);

    expect(send).toHaveBeenCalledWith({ name: 'invite/resent', data: { ...RESENT } });
  });

  it('drops an event nothing handles, without a network call', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await new InngestEventBus({ send }, new Set(['invite/resent'])).emit('brunch/created', CREATED);

    expect(send).not.toHaveBeenCalled();
  });

  it('rejects when Inngest is unreachable so the calling service can log and move on', async () => {
    const send = vi.fn().mockRejectedValue(new Error('inngest unreachable'));

    await expect(
      new InngestEventBus({ send }, new Set(['brunch/created'])).emit('brunch/created', CREATED),
    ).rejects.toThrow('inngest unreachable');
  });
});
