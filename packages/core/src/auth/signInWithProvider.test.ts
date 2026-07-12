import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from '@brunchsters/database';
import { signInWithProvider } from './signInWithProvider';

const INPUT = {
  provider: 'google',
  providerUserId: 'google-123',
  email: 'evan@example.com',
  name: 'Evan Knapp',
  avatarUrl: 'https://example.com/avatar.jpg',
} as const;

function makeMockDb(
  overrides: {
    authProviderFindFirst?: ReturnType<typeof vi.fn>;
    authProviderUpdate?: ReturnType<typeof vi.fn>;
    authProviderCreate?: ReturnType<typeof vi.fn>;
    userFindFirst?: ReturnType<typeof vi.fn>;
    userCreate?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    userAuthProvider: {
      findFirst: overrides.authProviderFindFirst ?? vi.fn().mockResolvedValue(null),
      update: overrides.authProviderUpdate ?? vi.fn().mockResolvedValue({}),
      create: overrides.authProviderCreate ?? vi.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: overrides.userFindFirst ?? vi.fn().mockResolvedValue(null),
      create: overrides.userCreate ?? vi.fn().mockResolvedValue({ id: 'new-user-uuid' }),
    },
  } as unknown as DbClient;
}

describe('signInWithProvider', () => {
  describe('new user (no existing provider, no existing email)', () => {
    it('creates User and UserAuthProvider, returns new userId', async () => {
      const userCreate = vi.fn().mockResolvedValue({ id: 'new-user-uuid' });
      const db = makeMockDb({ userCreate });

      const result = await signInWithProvider({ ...INPUT, db });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ userId: 'new-user-uuid' });
      expect(db.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: INPUT.email,
            name: INPUT.name,
            avatarUrl: INPUT.avatarUrl,
          }),
        }),
      );
    });

    it('passes null avatarUrl to db when avatarUrl is undefined', async () => {
      const userCreate = vi.fn().mockResolvedValue({ id: 'new-user-uuid' });
      const db = makeMockDb({ userCreate });

      await signInWithProvider({ ...INPUT, avatarUrl: undefined, db });

      expect(db.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatarUrl: null }),
        }),
      );
    });
  });

  describe('repeat sign-in (existing UserAuthProvider)', () => {
    it('updates lastLoginAt and returns existing userId', async () => {
      const existingProvider = { id: 'provider-uuid', userId: 'existing-user-uuid' };
      const authProviderFindFirst = vi.fn().mockResolvedValue(existingProvider);
      const authProviderUpdate = vi.fn().mockResolvedValue({});
      const db = makeMockDb({ authProviderFindFirst, authProviderUpdate });

      const result = await signInWithProvider({ ...INPUT, db });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ userId: 'existing-user-uuid' });
      expect(db.userAuthProvider.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'provider-uuid' },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        }),
      );
      expect(db.user.create).not.toHaveBeenCalled();
    });
  });

  describe('existing email, new provider', () => {
    it('links new provider to existing User, returns existing userId', async () => {
      const existingUser = { id: 'existing-user-uuid' };
      const userFindFirst = vi.fn().mockResolvedValue(existingUser);
      const authProviderCreate = vi.fn().mockResolvedValue({});
      const db = makeMockDb({ userFindFirst, authProviderCreate });

      const result = await signInWithProvider({ ...INPUT, db });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ userId: 'existing-user-uuid' });
      expect(db.userAuthProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'existing-user-uuid',
            provider: INPUT.provider,
            providerUserId: INPUT.providerUserId,
          }),
        }),
      );
      expect(db.user.create).not.toHaveBeenCalled();
    });
  });

  describe('db error', () => {
    it('returns db_error result when db throws', async () => {
      const cause = new Error('connection refused');
      const db = makeMockDb({
        authProviderFindFirst: vi.fn().mockRejectedValue(cause),
      });

      const result = await signInWithProvider({ ...INPUT, db });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toEqual({ type: 'db_error', cause });
    });
  });
});
