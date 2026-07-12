import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { signInWithProvider } from '@brunchsters/core';
import { db } from '@/lib/db';

// Auth.js v5 auto-infers credentials from AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET.
// We use GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (see .env.example), so wire them
// explicitly. Fail fast with a clear message if either is missing at boot.
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (
  googleClientId === undefined ||
  googleClientId === '' ||
  googleClientSecret === undefined ||
  googleClientSecret === ''
) {
  throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in apps/web/.env.local');
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ clientId: googleClientId, clientSecret: googleClientSecret })],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/sign-in',
  },
  callbacks: {
    async signIn({ profile }) {
      // Guard: Google must provide an email or we cannot create a User record.
      return profile?.email != null;
    },
    async jwt({ token, account, profile }) {
      // account is only defined on the initial OAuth callback (first sign-in).
      if (account !== null && account !== undefined && profile !== undefined) {
        const email = profile.email;
        if (email == null) return token;

        const result = await signInWithProvider({
          provider: account.provider,
          providerUserId: account.providerAccountId,
          email,
          name: profile.name ?? email,
          avatarUrl: typeof profile.image === 'string' ? profile.image : undefined,
          db,
        });

        if (result.isErr()) {
          throw new Error('Failed to create or retrieve user account');
        }

        token.userId = result.value.userId;
      }
      return token;
    },
    async session({ session, token }) {
      const userId = (token as Record<string, unknown>)['userId'];
      if (typeof userId === 'string') {
        session.user.id = userId;
      }
      return session;
    },
  },
});
