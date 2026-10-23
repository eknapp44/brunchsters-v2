import type { NextConfig } from 'next';

// Headers every response carries. The Content-Security-Policy is not here: it needs a fresh nonce
// for every request, so `middleware.ts` sets it (spec 0012, ADR 0014).
// No Strict-Transport-Security either: the host (Vercel, the domain) sets that for the real
// domain, and sending it from http://localhost would be wrong.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@brunchsters/shared', '@brunchsters/core', '@brunchsters/database'],
  // Keep @prisma/client as a Node.js external (not bundled); requires it to be a direct dep of apps/web
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  // pnpm lint is the authoritative ESLint check; don't re-lint during next build
  eslint: { ignoreDuringBuilds: true },
  // forbidden() and forbidden.tsx: the 403 a member gets for a host-only page.
  experimental: { authInterrupts: true },
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // An invite link carries a bearer token in its address: never hand it to another site in
      // a Referer header. Listed after the rule above, so its Referrer-Policy wins.
      { source: '/invite/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};

export default nextConfig;
