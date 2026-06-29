import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { signInWithProvider } from '@brunchsters/core';
import { db } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
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
