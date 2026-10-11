import { encode } from 'next-auth/jwt';
import { baseUrl, E2E_AUTH_SECRET } from './env';
import type { TestUser } from './factories';

// Auth.js names the session cookie by transport, and uses the cookie name as the JWT salt.
export function sessionCookieName(authUrl: string): string {
  return authUrl.startsWith('https://') ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

export type SessionCookie = {
  readonly name: string;
  readonly value: string;
  readonly url: string;
};

// Mints the cookie a real Google sign-in would end with. auth.ts is untouched: this is
// the session its jwt/session callbacks expect (userId in the token; name/email/picture
// for the nav). See ADR 0007.
export async function mintSessionCookie(
  user: TestUser,
  // Defaults to Auth.js's own 30 days. A negative value mints an already-expired session.
  options: { readonly maxAgeSeconds?: number } = {},
): Promise<SessionCookie> {
  const name = sessionCookieName(baseUrl);
  const value = await encode({
    token: {
      sub: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      picture: user.avatarUrl,
    },
    secret: E2E_AUTH_SECRET,
    salt: name,
    ...(options.maxAgeSeconds !== undefined ? { maxAge: options.maxAgeSeconds } : {}),
  });
  return { name, value, url: baseUrl };
}
