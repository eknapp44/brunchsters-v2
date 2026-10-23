import { request as playwrightRequest } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { createUser } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { baseUrl } from '../support/env';
import { mintSessionCookie, sessionCookieName } from '../support/session';

// S2 — a session that is not valid never counts as signed in. Spec 0012 M1: the dependency bump
// of next-auth includes an advisory about "existence-based auth checks failing open" (the auth
// object populated with an error), and every handler here gates on `session === null` and the
// middleware on `req.auth`. This pins the outcome from outside: for every kind of broken
// credential, an API route answers 401 (never 200, never a 5xx) and a page sends the person to
// sign in. It is written before the bump and must pass after it.

type BrokenCredential = {
  readonly label: string;
  readonly headers: () => Promise<Record<string, string>>;
};

const WRONG_SECRET = 'a-different-secret-that-is-long-enough-to-be-used-for-signing';

async function cookieHeader(value: string): Promise<Record<string, string>> {
  return { cookie: `${sessionCookieName(baseUrl)}=${value}` };
}

const brokenCredentials: readonly BrokenCredential[] = [
  { label: 'a cookie that is not a token at all', headers: () => cookieHeader('not-a-jwt') },
  {
    label: 'a real token with its signature altered',
    headers: async () => {
      const user = await createUser({ label: 'tampered' });
      const { value } = await mintSessionCookie(user);
      return cookieHeader(`${value.slice(0, -4)}AAAA`);
    },
  },
  {
    label: 'an expired token',
    headers: async () => {
      const user = await createUser({ label: 'expired' });
      const { value } = await mintSessionCookie(user, { maxAgeSeconds: -60 });
      return cookieHeader(value);
    },
  },
  {
    label: 'a token signed with another secret',
    headers: async () => {
      const user = await createUser({ label: 'forged' });
      const name = sessionCookieName(baseUrl);
      const value = await encode({
        token: { sub: user.id, userId: user.id, name: user.name, email: user.email },
        secret: WRONG_SECRET,
        salt: name,
      });
      return cookieHeader(value);
    },
  },
  { label: 'a malformed Bearer header', headers: async () => ({ authorization: 'Bearer' }) },
  {
    label: 'a Bearer header with junk in it',
    headers: async () => ({ authorization: 'Bearer %%%.not.a.token' }),
  },
];

// One route per family, mutating and reading, plus the public-prefixed token route that does its
// own session check.
const SOME_UUID = '00000000-0000-4000-8000-000000000000';
const apiCalls: ReadonlyArray<{ readonly method: 'GET' | 'POST'; readonly path: string }> = [
  { method: 'GET', path: '/api/v1/places/search?q=cafe' },
  { method: 'POST', path: '/api/v1/brunches' },
  { method: 'POST', path: `/api/v1/brunches/${SOME_UUID}/rsvp` },
  { method: 'POST', path: `/api/v1/brunches/${SOME_UUID}/invites` },
  { method: 'POST', path: `/api/v1/invites/${SOME_UUID}/resend` },
  { method: 'POST', path: '/api/v1/invites/token/not-a-real-token/respond' },
];

test.describe('S2 — a broken session is never signed in', () => {
  for (const credential of brokenCredentials) {
    test(`${credential.label}: every API route answers 401 and a page goes to sign-in`, async ({
      browser,
    }) => {
      const headers = await credential.headers();
      const api = await playwrightRequest.newContext({
        baseURL: baseUrl,
        extraHTTPHeaders: headers,
      });

      for (const call of apiCalls) {
        const response =
          call.method === 'GET'
            ? await api.get(call.path, { maxRedirects: 0 })
            : await api.post(call.path, { maxRedirects: 0, data: {} });
        expect(response.status(), `${call.method} ${call.path}`).toBe(401);
      }
      await api.dispose();

      // A page (the cookie variants only: a Bearer header is not how a browser signs in).
      if (headers.cookie !== undefined) {
        const context = await browser.newContext({ extraHTTPHeaders: headers });
        const page = await context.newPage();
        await page.goto('/dashboard');
        await expect(page).toHaveURL(`/sign-in?callbackUrl=${encodeURIComponent('/dashboard')}`);
        await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
        await context.close();
      }
    });
  }
});
