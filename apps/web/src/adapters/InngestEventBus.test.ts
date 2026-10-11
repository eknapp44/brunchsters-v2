import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { InngestEventBus } from './InngestEventBus';

const PAYLOAD = {
  brunchId: '00000000-0000-4000-8000-000000000001' as BrunchId,
  hostId: '00000000-0000-4000-8000-000000000002' as UserId,
};

describe('InngestEventBus', () => {
  it('forwards the event name and payload to Inngest', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await new InngestEventBus({ send }).emit('brunch/created', PAYLOAD);

    expect(send).toHaveBeenCalledWith({ name: 'brunch/created', data: { ...PAYLOAD } });
  });

  it('rejects when Inngest is unreachable so the calling service can log and move on', async () => {
    const send = vi.fn().mockRejectedValue(new Error('inngest unreachable'));

    await expect(new InngestEventBus({ send }).emit('brunch/created', PAYLOAD)).rejects.toThrow(
      'inngest unreachable',
    );
  });
});
