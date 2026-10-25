import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import {
  buildContentSecurityPolicy,
  CSP_HEADER_NAME,
  generateNonce,
} from '@/lib/contentSecurityPolicy';

// /api/inngest is called by Inngest, not by a signed-in person; the Inngest SDK verifies
// the request signature itself (INNGEST_SIGNING_KEY), so the session gate must not apply.
const PUBLIC_ROUTES = new Set(['/', '/sign-in', '/api/inngest']);
// /api/v1/invites/token/ covers both the preview GET and the respond POST —
// the respond route still enforces its own auth() check, this just stops
// the blanket /api/ 401 gate from short-circuiting the one route meant to
// work for a signed-out visitor previewing an invite before they sign in.
const PUBLIC_PREFIXES = ['/invite/', '/api/auth/', '/api/v1/invites/token/'];

// Every response this middleware returns carries the policy, the early 401 and the redirect to
// sign-in included (ADR 0014): a page is only as protected as the answer that delivers it.
function withPolicy(response: NextResponse, policy: string): NextResponse {
  response.headers.set(CSP_HEADER_NAME, policy);
  return response;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // A new nonce for every request, never reused (see generateNonce).
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === 'development',
  });

  const isPublic =
    PUBLIC_ROUTES.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!req.auth && !isPublic) {
    // API clients get a 401, not a 307 to an HTML sign-in page —
    // fetch follows redirects silently and the failure becomes confusing.
    if (pathname.startsWith('/api/')) {
      // The same coded shape every route answers with (spec 0014): this is the 401 a person
      // meets when their session ends while a page is open, so the client words it "signed out".
      return withPolicy(
        NextResponse.json(
          { error: { code: 'signed_out', message: 'Unauthorized' } },
          { status: 401 },
        ),
        policy,
      );
    }
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return withPolicy(NextResponse.redirect(signInUrl), policy);
  }

  // The policy goes on the request as well: Next reads the nonce from it and stamps the inline
  // scripts it renders (the page's own data and bootstrap) with it. (This Next version also finds
  // it on the response, so this is belt and braces, as Next's own guide shows it.)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(CSP_HEADER_NAME, policy);
  return withPolicy(NextResponse.next({ request: { headers: requestHeaders } }), policy);
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
