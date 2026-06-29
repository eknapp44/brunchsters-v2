import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/sign-in',
  },
  callbacks: {
    async jwt({ token }) {
      return token; // M2: user upsert + userId stored in token
    },
    async session({ session }) {
      return session; // M2: session.user.id populated from token.userId
    },
  },
});
