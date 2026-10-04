import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import type { HostBrunch } from './assertHostOf';
import { assertBrunchActive } from './assertBrunchActive';

function makeBrunch(statusCode: string): HostBrunch {
  return {
    id: 'brunch-uuid' as BrunchId,
    hostId: 'host-uuid' as UserId,
    status: { code: statusCode },
  } as unknown as HostBrunch;
}

describe('assertBrunchActive', () => {
  it('returns Ok for an active brunch', () => {
    const result = assertBrunchActive(makeBrunch('active'));

    expect(result.isOk()).toBe(true);
  });

  it('rejects a draft brunch', () => {
    const result = assertBrunchActive(makeBrunch('draft'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('rejects a confirmed brunch', () => {
    const result = assertBrunchActive(makeBrunch('confirmed'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('rejects a cancelled brunch', () => {
    const result = assertBrunchActive(makeBrunch('cancelled'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });
});
