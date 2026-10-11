import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '@brunchsters/database';
import { signInWithProvider } from './signInWithProvider';

// Unique suffix per test run so parallel runs and retries don't collide.
const RUN_ID = Date.now();
const TEST_EMAIL = `integration-auth-${RUN_ID}@example.com`;
const GOOGLE_PROVIDER = 'google';
const GOOGLE_USER_ID = `google-integration-${RUN_ID}`;
const APPLE_PROVIDER = 'apple';
const APPLE_USER_ID = `apple-integration-${RUN_ID}`;

const db = createDb();

afterAll(async () => {
  // Delete providers first (FK → User), then the user.
  await db.userAuthProvider.deleteMany({ where: { email: TEST_EMAIL } });
  await db.user.deleteMany({ where: { email: TEST_EMAIL } });
});

describe('signInWithProvider (integration — real Postgres)', () => {
  it('creates User and UserAuthProvider for a brand-new email', async () => {
    const result = await signInWithProvider({
      provider: GOOGLE_PROVIDER,
      providerUserId: GOOGLE_USER_ID,
      email: TEST_EMAIL,
      name: 'Integration Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      db,
    });

    expect(result.isOk()).toBe(true);

    const user = await db.user.findFirst({ where: { email: TEST_EMAIL } });
    expect(user).not.toBeNull();
    expect(user?.name).toBe('Integration Test User');

    const provider = await db.userAuthProvider.findFirst({
      where: { provider: GOOGLE_PROVIDER, providerUserId: GOOGLE_USER_ID },
    });
    expect(provider).not.toBeNull();
    expect(provider?.userId).toBe(result._unsafeUnwrap().userId);
  });

  it('updates lastLoginAt and returns the same userId on repeat sign-in', async () => {
    const before = new Date();

    const result = await signInWithProvider({
      provider: GOOGLE_PROVIDER,
      providerUserId: GOOGLE_USER_ID,
      email: TEST_EMAIL,
      name: 'Integration Test User',
      avatarUrl: undefined,
      db,
    });

    expect(result.isOk()).toBe(true);

    const provider = await db.userAuthProvider.findFirst({
      where: { provider: GOOGLE_PROVIDER, providerUserId: GOOGLE_USER_ID },
    });
    expect(provider?.lastLoginAt).not.toBeNull();
    expect(provider?.lastLoginAt != null && provider.lastLoginAt >= before).toBe(true);

    // No second User row should have been created.
    const userCount = await db.user.count({ where: { email: TEST_EMAIL } });
    expect(userCount).toBe(1);
  });

  it('links a second provider to the existing User when email matches', async () => {
    const firstResult = await db.user.findFirst({ where: { email: TEST_EMAIL } });
    const existingUserId = firstResult?.id;
    expect(existingUserId).toBeDefined();

    const result = await signInWithProvider({
      provider: APPLE_PROVIDER,
      providerUserId: APPLE_USER_ID,
      email: TEST_EMAIL,
      name: 'Integration Test User',
      avatarUrl: undefined,
      db,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().userId).toBe(existingUserId);

    const appleProvider = await db.userAuthProvider.findFirst({
      where: { provider: APPLE_PROVIDER, providerUserId: APPLE_USER_ID },
    });
    expect(appleProvider).not.toBeNull();
    expect(appleProvider?.userId).toBe(existingUserId);

    // Still only one User.
    const userCount = await db.user.count({ where: { email: TEST_EMAIL } });
    expect(userCount).toBe(1);
  });

  // ADR 0008: the address a provider reports may have capitals; accounts are stored normalized,
  // so the same person signing in with a differently-cased address is the same account.
  it('stores the address normalized and recognizes the same person in any case', async () => {
    const lower = `integration-auth-case-${RUN_ID}@example.com`;
    const reported = `Integration-Auth-Case-${RUN_ID}@Example.COM`;
    try {
      const first = await signInWithProvider({
        provider: GOOGLE_PROVIDER,
        providerUserId: `google-case-a-${RUN_ID}`,
        email: reported,
        name: 'Capitalized Address',
        avatarUrl: undefined,
        db,
      });
      const stored = await db.user.findFirst({ where: { id: first._unsafeUnwrap().userId } });
      expect(stored?.email).toBe(lower);

      // Another sign-in method reports it in lowercase: it links to the same account.
      const second = await signInWithProvider({
        provider: APPLE_PROVIDER,
        providerUserId: `apple-case-b-${RUN_ID}`,
        email: lower,
        name: 'Capitalized Address',
        avatarUrl: undefined,
        db,
      });
      expect(second._unsafeUnwrap().userId).toBe(first._unsafeUnwrap().userId);
      expect(await db.user.count({ where: { email: lower } })).toBe(1);
    } finally {
      await db.userAuthProvider.deleteMany({ where: { email: lower } });
      await db.user.deleteMany({ where: { email: lower } });
    }
  });
});
