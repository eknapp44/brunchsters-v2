import type { DbClient } from '@brunchsters/database';
import { err, ok, type Result } from 'neverthrow';

type SignInWithProviderInput = {
  readonly provider: string;
  readonly providerUserId: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | undefined;
  readonly db: DbClient;
};

type SignInWithProviderResult = {
  readonly userId: string;
};

type SignInWithProviderError = {
  readonly type: 'db_error';
  readonly cause: unknown;
};

export async function signInWithProvider(
  input: SignInWithProviderInput,
): Promise<Result<SignInWithProviderResult, SignInWithProviderError>> {
  const { provider, providerUserId, email, name, avatarUrl, db } = input;

  try {
    // 1. Check for an existing provider record (repeat sign-in)
    const existingProvider = await db.userAuthProvider.findFirst({
      where: { provider, providerUserId },
    });

    if (existingProvider !== null) {
      await db.userAuthProvider.update({
        where: { id: existingProvider.id },
        data: { lastLoginAt: new Date() },
      });
      return ok({ userId: existingProvider.userId });
    }

    // 2. No provider record — check for an existing User by email
    // (soft-delete middleware ensures deletedAt IS NULL automatically)
    const existingUser = await db.user.findFirst({
      where: { email },
    });

    if (existingUser !== null) {
      await db.userAuthProvider.create({
        data: {
          userId: existingUser.id,
          provider,
          providerUserId,
          email,
          lastLoginAt: new Date(),
        },
      });
      return ok({ userId: existingUser.id });
    }

    // 3. Brand new user — create User + UserAuthProvider together
    const newUser = await db.user.create({
      data: {
        name,
        email,
        avatarUrl: avatarUrl ?? null,
        authProviders: {
          create: {
            provider,
            providerUserId,
            email,
            lastLoginAt: new Date(),
          },
        },
      },
    });

    return ok({ userId: newUser.id });
  } catch (cause) {
    return err({ type: 'db_error', cause });
  }
}
