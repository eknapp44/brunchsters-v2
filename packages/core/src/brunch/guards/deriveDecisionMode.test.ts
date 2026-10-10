import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { deriveDecisionMode } from './deriveDecisionMode';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;

function makeMockDb(count: ReturnType<typeof vi.fn>): DbClient {
  return {
    brunchLocation: { count },
    brunchTime: { count },
  } as unknown as DbClient;
}

describe('deriveDecisionMode', () => {
  it('returns host_decides for zero options', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const db = makeMockDb(count);

    const mode = await deriveDecisionMode({ brunchId: BRUNCH_ID, kind: 'location' }, { db });

    expect(mode).toBe('host_decides');
  });

  it('returns host_decides for exactly one option', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const db = makeMockDb(count);

    const mode = await deriveDecisionMode({ brunchId: BRUNCH_ID, kind: 'location' }, { db });

    expect(mode).toBe('host_decides');
  });

  it('returns group_vote for two or more options', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const db = makeMockDb(count);

    const mode = await deriveDecisionMode({ brunchId: BRUNCH_ID, kind: 'location' }, { db });

    expect(mode).toBe('group_vote');
  });

  it('always filters deletedAt: null, since count() bypasses the soft-delete extension', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const db = makeMockDb(count);

    await deriveDecisionMode({ brunchId: BRUNCH_ID, kind: 'time' }, { db });

    expect(count).toHaveBeenCalledWith({
      where: { brunchId: BRUNCH_ID, deletedAt: null },
    });
  });

  it('counts BrunchTime, not BrunchLocation, for kind "time"', async () => {
    const locationCount = vi.fn().mockResolvedValue(5);
    const timeCount = vi.fn().mockResolvedValue(1);
    const db = {
      brunchLocation: { count: locationCount },
      brunchTime: { count: timeCount },
    } as unknown as DbClient;

    const mode = await deriveDecisionMode({ brunchId: BRUNCH_ID, kind: 'time' }, { db });

    expect(timeCount).toHaveBeenCalled();
    expect(locationCount).not.toHaveBeenCalled();
    expect(mode).toBe('host_decides');
  });
});
