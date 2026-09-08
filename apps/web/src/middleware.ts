import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const PUBLIC_ROUTES = new Set(['/', '/sign-in']);
// /api/v1/invites/token/ covers both the preview GET and the respond POST —
// the respond route still enforces its own auth() check, this just stops
// the blanket /api/ 401 gate from short-circuiting the one route meant to
// work for a signed-out visitor previewing an invite before they sign in.
const PUBLIC_PREFIXES = ['/invite/', '/api/auth/', '/api/v1/invites/token/'];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_ROUTES.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!req.auth && !isPublic) {
    // API clients get a 401, not a 307 to an HTML sign-in page —
    // fetch follows redirects silently and the failure becomes confusing.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
