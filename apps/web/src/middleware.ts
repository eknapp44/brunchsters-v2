import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const PUBLIC_ROUTES = new Set(['/', '/sign-in']);
const PUBLIC_PREFIXES = ['/invite/', '/api/auth/'];

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
